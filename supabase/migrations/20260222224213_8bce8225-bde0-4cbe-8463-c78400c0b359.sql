
-- Replace backfill_smart_matches with simple deterministic auto-linking
CREATE OR REPLACE FUNCTION public.backfill_smart_matches(lookback_days integer DEFAULT 120, min_score integer DEFAULT 95, min_gap integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_before int;
  v_linked int := 0;
  rec record;
  v_lead record;
  v_method text;
  v_reason text;
BEGIN
  -- Parameters min_score and min_gap are kept for signature compatibility but ignored.

  SELECT count(*) INTO v_total_before
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown';

  FOR rec IN
    SELECT s.id AS sale_id, s.email, s.email_domain, s.product_name,
           coalesce(s.date::timestamptz, s.created_at, now()) AS sale_time
    FROM sales s
    WHERE s.lead_id IS NULL AND s.sale_type = 'unknown'
  LOOP
    v_lead := NULL;
    v_method := NULL;
    v_reason := NULL;

    -- Rule A: Exact email match
    SELECT l.id, l.name, l.email, l.submitted_at INTO v_lead
    FROM leads l
    WHERE rec.email IS NOT NULL AND l.email IS NOT NULL
      AND lower(btrim(rec.email)) = lower(btrim(l.email))
      AND l.submitted_at IS NOT NULL
      AND l.submitted_at <= rec.sale_time
      AND l.submitted_at >= rec.sale_time - (lookback_days || ' days')::interval
    ORDER BY l.submitted_at DESC
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
      v_method := 'email_exact';
      v_reason := 'email_exact ' || coalesce(rec.email, '');
    END IF;

    -- Rule B: Same corporate domain (non-free)
    IF v_lead.id IS NULL AND rec.email_domain IS NOT NULL
       AND NOT public.is_free_email_domain(rec.email_domain) THEN
      SELECT l.id, l.name, l.email, l.submitted_at INTO v_lead
      FROM leads l
      WHERE l.email_domain IS NOT NULL
        AND l.email_domain = rec.email_domain
        AND l.submitted_at IS NOT NULL
        AND l.submitted_at <= rec.sale_time
        AND l.submitted_at >= rec.sale_time - (lookback_days || ' days')::interval
      ORDER BY l.submitted_at DESC
      LIMIT 1;

      IF v_lead.id IS NOT NULL THEN
        v_method := 'domain_match';
        v_reason := 'domain_match ' || rec.email_domain;
      END IF;
    END IF;

    -- Rule C: sale.product_name ILIKE '%' || lead.phrase || '%'
    IF v_lead.id IS NULL AND rec.product_name IS NOT NULL AND btrim(rec.product_name) != '' THEN
      SELECT l.id, l.name, l.email, l.phrase, l.submitted_at INTO v_lead
      FROM leads l
      WHERE l.phrase IS NOT NULL AND btrim(l.phrase) != ''
        AND rec.product_name ILIKE '%' || btrim(l.phrase) || '%'
        AND l.submitted_at IS NOT NULL
        AND l.submitted_at <= rec.sale_time
        AND l.submitted_at >= rec.sale_time - (lookback_days || ' days')::interval
      ORDER BY l.submitted_at DESC
      LIMIT 1;

      IF v_lead.id IS NOT NULL THEN
        v_method := 'phrase_match';
        v_reason := 'product contains phrase: ' || coalesce(v_lead.phrase, '');
      END IF;
    END IF;

    -- Rule D: lead.phrase ILIKE '%' || sale.product_name || '%'
    IF v_lead.id IS NULL AND rec.product_name IS NOT NULL AND btrim(rec.product_name) != '' THEN
      SELECT l.id, l.name, l.email, l.phrase, l.submitted_at INTO v_lead
      FROM leads l
      WHERE l.phrase IS NOT NULL AND btrim(l.phrase) != ''
        AND btrim(l.phrase) ILIKE '%' || btrim(rec.product_name) || '%'
        AND l.submitted_at IS NOT NULL
        AND l.submitted_at <= rec.sale_time
        AND l.submitted_at >= rec.sale_time - (lookback_days || ' days')::interval
      ORDER BY l.submitted_at DESC
      LIMIT 1;

      IF v_lead.id IS NOT NULL THEN
        v_method := 'phrase_match';
        v_reason := 'phrase contains product: ' || coalesce(rec.product_name, '');
      END IF;
    END IF;

    -- Link if matched
    IF v_lead.id IS NOT NULL THEN
      UPDATE sales SET
        lead_id = v_lead.id,
        match_method = v_method,
        match_confidence = 100,
        match_reason = v_reason,
        sale_type = 'new_lead'
      WHERE id = rec.sale_id;
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_unmatched_before', v_total_before,
    'linked_count', v_linked,
    'still_unmatched_after', v_total_before - v_linked
  );
END;
$function$;

-- Replace get_match_suggestions with simple deterministic suggestions
CREATE OR REPLACE FUNCTION public.get_match_suggestions(p_sale_id uuid, lookback_days integer DEFAULT 180, limit_n integer DEFAULT 5)
 RETURNS TABLE(lead_id uuid, lead_name text, lead_email text, lead_phrase text, lead_submitted_at timestamp with time zone, score integer, reasons text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale record;
BEGIN
  SELECT s.id, s.email, s.email_domain, s.product_name,
         coalesce(s.date::timestamptz, s.created_at, now()) AS sale_time
  INTO v_sale
  FROM sales s WHERE s.id = p_sale_id;

  IF v_sale IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    l.id AS lead_id,
    l.name AS lead_name,
    l.email AS lead_email,
    l.phrase AS lead_phrase,
    l.submitted_at AS lead_submitted_at,
    100::int AS score,
    ARRAY(
      SELECT unnest(ARRAY[
        CASE WHEN v_sale.email IS NOT NULL AND l.email IS NOT NULL
             AND lower(btrim(v_sale.email)) = lower(btrim(l.email)) THEN 'email_exact' ELSE NULL END,
        CASE WHEN v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
             AND v_sale.email_domain = l.email_domain
             AND NOT public.is_free_email_domain(v_sale.email_domain) THEN 'domain_match: ' || v_sale.email_domain ELSE NULL END,
        CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
             AND v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%' THEN 'product contains phrase' ELSE NULL END,
        CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
             AND btrim(l.phrase) ILIKE '%' || btrim(v_sale.product_name) || '%' THEN 'phrase contains product' ELSE NULL END,
        CASE WHEN l.name IS NOT NULL AND btrim(l.name) != '' AND v_sale.product_name IS NOT NULL
             AND v_sale.product_name ILIKE '%' || btrim(l.name) || '%' THEN 'product contains name' ELSE NULL END,
        CASE WHEN l.name IS NOT NULL AND btrim(l.name) != '' AND v_sale.product_name IS NOT NULL
             AND btrim(l.name) ILIKE '%' || btrim(v_sale.product_name) || '%' THEN 'name contains product' ELSE NULL END
      ]) AS r WHERE r IS NOT NULL
    ) AS reasons
  FROM leads l
  WHERE l.submitted_at IS NOT NULL
    AND l.submitted_at <= v_sale.sale_time
    AND l.submitted_at >= v_sale.sale_time - (lookback_days || ' days')::interval
    AND (
      -- same corporate domain
      (v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
       AND v_sale.email_domain = l.email_domain
       AND NOT public.is_free_email_domain(v_sale.email_domain))
      OR
      -- phrase ILIKE product_name
      (l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
       AND v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%')
      OR
      -- product_name ILIKE phrase
      (l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
       AND btrim(l.phrase) ILIKE '%' || btrim(v_sale.product_name) || '%')
      OR
      -- lead.name ILIKE product_name
      (l.name IS NOT NULL AND btrim(l.name) != '' AND v_sale.product_name IS NOT NULL
       AND v_sale.product_name ILIKE '%' || btrim(l.name) || '%')
      OR
      -- product_name ILIKE lead.name
      (l.name IS NOT NULL AND btrim(l.name) != '' AND v_sale.product_name IS NOT NULL
       AND btrim(l.name) ILIKE '%' || btrim(v_sale.product_name) || '%')
    )
  ORDER BY l.submitted_at DESC
  LIMIT limit_n;
END;
$function$;

-- Update match_method constraint to include phrase_match
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_match_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_match_method_check
  CHECK (match_method IN ('email_exact','smart_suggested','manual','domain_plus_keywords','keywords_strict','domain_match','phrase_match'));
