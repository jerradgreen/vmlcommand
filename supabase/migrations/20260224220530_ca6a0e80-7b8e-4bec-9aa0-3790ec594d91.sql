
-- =============================================
-- 1. CREATE transaction_rules TABLE
-- =============================================
CREATE TABLE public.transaction_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  match_type text NOT NULL,
  match_value text NOT NULL,
  match_value_norm text,
  match_field text NOT NULL DEFAULT 'description',
  assign_txn_type text,
  assign_category text,
  assign_vendor text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to transaction_rules"
  ON public.transaction_rules FOR ALL
  USING (true) WITH CHECK (true);

-- Indexes on transaction_rules
CREATE INDEX idx_transaction_rules_active_priority ON public.transaction_rules (is_active, priority);
CREATE INDEX idx_transaction_rules_match_value ON public.transaction_rules (match_value);
CREATE INDEX idx_transaction_rules_match_value_norm ON public.transaction_rules (match_value_norm);
CREATE INDEX idx_transaction_rules_active_priority_created ON public.transaction_rules (is_active, priority, created_at DESC);

-- =============================================
-- 2. ALTER financial_transactions
-- =============================================
ALTER TABLE public.financial_transactions
  ADD COLUMN txn_type text,
  ADD COLUMN txn_category text,
  ADD COLUMN vendor text,
  ADD COLUMN rule_id_applied uuid REFERENCES public.transaction_rules(id),
  ADD COLUMN is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN classified_at timestamptz,
  ADD COLUMN description_norm text,
  ADD COLUMN account_name_norm text;

CREATE INDEX idx_ft_txn_type ON public.financial_transactions (txn_type);
CREATE INDEX idx_ft_txn_category ON public.financial_transactions (txn_category);
CREATE INDEX idx_ft_rule_id_applied ON public.financial_transactions (rule_id_applied);
CREATE INDEX idx_ft_is_locked ON public.financial_transactions (is_locked);
CREATE INDEX idx_ft_description_norm ON public.financial_transactions (description_norm);
CREATE INDEX idx_ft_account_name_norm ON public.financial_transactions (account_name_norm);

-- =============================================
-- 3. BACKFILL normalized columns
-- =============================================
UPDATE public.financial_transactions
SET description_norm = trim(regexp_replace(
  lower(regexp_replace(coalesce(description, ''), '[^a-z0-9 ]', ' ', 'g')),
  '\s+', ' ', 'g'))
WHERE description_norm IS NULL;

UPDATE public.financial_transactions
SET account_name_norm = trim(regexp_replace(
  lower(regexp_replace(coalesce(account_name, ''), '[^a-z0-9 ]', ' ', 'g')),
  '\s+', ' ', 'g'))
WHERE account_name_norm IS NULL;

-- =============================================
-- 4. TRIGGER: auto-normalize match_value_norm
-- =============================================
CREATE OR REPLACE FUNCTION public.transaction_rules_normalize_match_value()
RETURNS trigger AS $$
BEGIN
  IF NEW.match_type != 'regex' THEN
    NEW.match_value_norm := trim(regexp_replace(
      lower(regexp_replace(NEW.match_value, '[^a-z0-9 ]', ' ', 'g')),
      '\s+', ' ', 'g'));
  ELSE
    NEW.match_value_norm := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_rules_normalize_match_value
  BEFORE INSERT OR UPDATE ON public.transaction_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.transaction_rules_normalize_match_value();

-- =============================================
-- 5. SEED 10 rules
-- =============================================
INSERT INTO public.transaction_rules (priority, match_type, match_value, match_field, assign_txn_type, assign_category, assign_vendor, notes) VALUES
  (10, 'contains', 'fosterweld', 'description', 'business', 'cogs', 'FosterWeld', NULL),
  (10, 'contains', 'wowork', 'description', 'business', 'cogs', 'Wowork', NULL),
  (10, 'contains', 'serena sheng', 'description', 'business', 'cogs', 'Wowork', NULL),
  (20, 'contains', 'apex global', 'description', 'business', 'cogs', 'APEX Global Shipping', NULL),
  (30, 'contains', 'ups', 'description', 'business', 'cogs', 'UPS', NULL),
  (20, 'contains', 'epayment', 'description', 'business', 'transfer', NULL, 'Credit card payment transfer'),
  (20, 'contains', 'credit card payment', 'description', 'business', 'transfer', NULL, 'Credit card payment transfer'),
  (25, 'contains', 'amex autopay', 'description', 'business', 'transfer', NULL, 'Credit card autopay'),
  (25, 'contains', 'chase autopay', 'description', 'business', 'transfer', NULL, 'Credit card autopay'),
  (25, 'contains', 'credit card autopay', 'description', 'business', 'transfer', NULL, 'Credit card autopay');

-- =============================================
-- 6. apply_transaction_rules(p_txn_id)
-- =============================================
CREATE OR REPLACE FUNCTION public.apply_transaction_rules(p_txn_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- Determine target field
    IF v_rule.match_field = 'account_name' THEN
      v_target := coalesce(v_txn.account_name_norm, '');
    ELSE
      v_target := coalesce(v_txn.description_norm, '');
    END IF;

    -- Match logic
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
        vendor = coalesce(v_rule.assign_vendor, vendor),
        rule_id_applied = v_rule.id,
        classified_at = now()
      WHERE id = p_txn_id;

      -- Default owner_draw for personal with no category
      IF v_rule.assign_txn_type = 'personal' AND v_rule.assign_category IS NULL THEN
        UPDATE financial_transactions SET txn_category = 'owner_draw' WHERE id = p_txn_id AND txn_category IS NULL;
      END IF;

      RETURN jsonb_build_object('classified', true, 'rule_id', v_rule.id, 'match_type', v_rule.match_type);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('classified', false, 'reason', 'no rule matched');
END;
$$;

-- =============================================
-- 7. apply_rules_to_unclassified(p_limit)
-- =============================================
CREATE OR REPLACE FUNCTION public.apply_rules_to_unclassified(p_limit int DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_row record;
  v_result jsonb;
BEGIN
  FOR v_row IN
    SELECT id FROM financial_transactions
    WHERE is_locked = false AND (txn_type IS NULL OR txn_category IS NULL)
    LIMIT p_limit
  LOOP
    v_result := public.apply_transaction_rules(v_row.id);
    IF (v_result->>'classified')::boolean THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated', v_count);
END;
$$;
