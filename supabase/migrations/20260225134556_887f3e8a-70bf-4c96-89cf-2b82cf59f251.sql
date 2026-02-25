
-- Fix Pack C: Add txn_subcategory columns
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS txn_subcategory text;
ALTER TABLE transaction_rules ADD COLUMN IF NOT EXISTS assign_subcategory text;
CREATE INDEX IF NOT EXISTS idx_ft_txn_subcategory ON financial_transactions(txn_subcategory);

-- Fix Pack A: Server-side cost rollup RPC
CREATE OR REPLACE FUNCTION public.get_cost_rollups(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cogs numeric;
  v_ads numeric;
  v_overhead numeric;
BEGIN
  -- NOTE: txn_category='transfer' is NOT an expense and must be excluded from expense totals.
  -- All cost rollups enforce: txn_type='business', txn_category IS NOT NULL, txn_category != 'transfer'

  SELECT coalesce(sum(abs(amount)), 0) INTO v_cogs
  FROM financial_transactions
  WHERE txn_type = 'business'
    AND txn_category IS NOT NULL
    AND txn_category != 'transfer'
    AND txn_category IN ('cogs','shipping_cogs','merchant_fees','packaging')
    AND txn_date >= p_from AND txn_date <= p_to;

  SELECT coalesce(sum(abs(amount)), 0) INTO v_ads
  FROM financial_transactions
  WHERE txn_type = 'business'
    AND txn_category IS NOT NULL
    AND txn_category != 'transfer'
    AND txn_category IN ('advertising_media')
    AND txn_date >= p_from AND txn_date <= p_to;

  SELECT coalesce(sum(abs(amount)), 0) INTO v_overhead
  FROM financial_transactions
  WHERE txn_type = 'business'
    AND txn_category IS NOT NULL
    AND txn_category != 'transfer'
    AND txn_category IN ('software','subscriptions','contractor_payments','office_expense',
      'rent','utilities','insurance','equipment','creative_services','seo',
      'advertising_tools','education','taxes','bank_fees','interest')
    AND txn_date >= p_from AND txn_date <= p_to;

  RETURN jsonb_build_object(
    'cogs_total', v_cogs,
    'ads_spend_total', v_ads,
    'overhead_total', v_overhead
  );
END;
$$;

-- Fix Pack C: Update apply_transaction_rules to handle txn_subcategory
CREATE OR REPLACE FUNCTION public.apply_transaction_rules(p_txn_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_txn record;
  v_rule record;
  v_target text;
  v_matched boolean := false;
BEGIN
  SELECT * INTO v_txn FROM financial_transactions WHERE id = p_txn_id;
  IF v_txn IS NULL THEN
    RETURN jsonb_build_object('classified', false, 'reason', 'txn not found');
  END IF;
  IF v_txn.is_locked THEN
    RETURN jsonb_build_object('classified', false, 'reason', 'locked');
  END IF;

  FOR v_rule IN
    SELECT * FROM transaction_rules
    WHERE is_active = true
    ORDER BY priority ASC, created_at DESC
  LOOP
    IF v_rule.match_field = 'account_name' THEN
      v_target := coalesce(v_txn.account_name_norm, '');
    ELSE
      v_target := coalesce(v_txn.description_norm, '');
    END IF;

    v_matched := false;
    IF v_rule.match_type = 'contains' THEN
      v_matched := v_target ILIKE '%' || v_rule.match_value_norm || '%';
    ELSIF v_rule.match_type = 'starts_with' THEN
      v_matched := v_target ILIKE v_rule.match_value_norm || '%';
    ELSIF v_rule.match_type = 'equals' THEN
      v_matched := v_target = v_rule.match_value_norm;
    ELSIF v_rule.match_type = 'regex' THEN
      v_matched := v_target ~ v_rule.match_value;
    END IF;

    IF v_matched THEN
      UPDATE financial_transactions SET
        txn_type = coalesce(v_rule.assign_txn_type, txn_type),
        txn_category = coalesce(v_rule.assign_category, txn_category),
        txn_subcategory = coalesce(v_rule.assign_subcategory, txn_subcategory),
        vendor = coalesce(v_rule.assign_vendor, vendor),
        rule_id_applied = v_rule.id,
        classified_at = now()
      WHERE id = p_txn_id;

      IF v_rule.assign_txn_type = 'personal' AND v_rule.assign_category IS NULL THEN
        UPDATE financial_transactions SET txn_category = 'owner_draw' WHERE id = p_txn_id AND txn_category IS NULL;
      END IF;

      RETURN jsonb_build_object('classified', true, 'rule_id', v_rule.id, 'match_type', v_rule.match_type);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('classified', false, 'reason', 'no rule matched');
END;
$$;
