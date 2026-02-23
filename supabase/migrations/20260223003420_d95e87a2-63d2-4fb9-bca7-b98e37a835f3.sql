
-- =====================================================
-- 1) Add suggestion columns to sales
-- =====================================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS suggested_lead_id uuid REFERENCES public.leads(id),
  ADD COLUMN IF NOT EXISTS suggested_score integer,
  ADD COLUMN IF NOT EXISTS suggested_reasons text[];

-- =====================================================
-- 2) Rebuild order_text from raw_payload for ALL sales
--    Include: First Name, Last Name, Product Name, Attribution
--    Exclude: numeric/noise fields
-- =====================================================
UPDATE sales
SET order_text = (
  SELECT string_agg(val, ' ')
  FROM jsonb_each_text(raw_payload) AS kv(key, val)
  WHERE lower(kv.key) NOT IN (
    'date', 'price', 'profit', 'quantity', 'order id',
    'total sales', 'total profit', 'total manu cost',
    'manufacturing cost', 'revenue', 'tax', 'shipping',
    'discount', 'amount', 'qty', 'zip', 'postal', 'cost',
    'email'
  )
  AND val IS NOT NULL AND btrim(val) != ''
)
WHERE raw_payload IS NOT NULL;

-- Recompute match_text and tokens for all sales
UPDATE sales
SET match_text = public.normalize_text(
  coalesce(order_id, '') || ' ' ||
  coalesce(email, '') || ' ' ||
  coalesce(product_name, '') || ' ' ||
  coalesce(order_text, '')
),
match_tokens = public.remove_stopwords(public.tokenize_text(
  public.normalize_text(
    coalesce(order_id, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(product_name, '') || ' ' ||
    coalesce(order_text, '')
  )
)),
strong_tokens = public.strong_tokens_fn(
  public.remove_stopwords(public.tokenize_text(
    public.normalize_text(
      coalesce(order_id, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(product_name, '') || ' ' ||
      coalesce(order_text, '')
    )
  ))
);

-- =====================================================
-- 3) Updated backfill_smart_matches with relaxed rules
--    Auto-link ONLY on:
--    A) email exact
--    B) non-free domain + at least 1 strong token overlap
--    C) exact name match (First Last from sale = lead.name)
-- =====================================================
CREATE OR REPLACE FUNCTION public.backfill_smart_matches(
  lookback_days integer DEFAULT 120,
  min_score integer DEFAULT 0,
  min_gap integer DEFAULT 0
)
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
  v_sale_name text;
BEGIN
  SELECT count(*) INTO v_total_before
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown';

  FOR rec IN
    SELECT s.id AS sale_id, s.email, s.email_domain, s.product_name,
           s.strong_tokens AS s_strong,
           s.raw_payload,
           coalesce(s.date::timestamptz, s.created_at, now()) AS sale_time
    FROM sales s
    WHERE s.lead_id IS NULL AND s.sale_type = 'unknown'
  LOOP
    v_lead := NULL;
    v_method := NULL;
    v_reason := NULL;

    -- Build sale name from raw_payload
    v_sale_name := btrim(
      coalesce(rec.raw_payload->>'First Name', '') || ' ' ||
      coalesce(rec.raw_payload->>'Last Name', '')
    );

    -- Rule A: Exact email match
    IF rec.email IS NOT NULL AND btrim(rec.email) != '' THEN
      SELECT l.id, l.name, l.email INTO v_lead
      FROM leads l
      WHERE l.email IS NOT NULL
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
    END IF;

    -- Rule B: Non-free domain + strong token overlap >= 1
    IF v_lead.id IS NULL AND rec.email_domain IS NOT NULL
       AND NOT public.is_free_email_domain(rec.email_domain)
       AND rec.s_strong IS NOT NULL AND array_length(rec.s_strong, 1) > 0 THEN
      SELECT l.id, l.name, l.email INTO v_lead
      FROM leads l
      WHERE l.email_domain IS NOT NULL
        AND l.email_domain = rec.email_domain
        AND NOT public.is_free_email_domain(l.email_domain)
        AND l.strong_tokens IS NOT NULL
        AND array_length(public.array_intersect(rec.s_strong, l.strong_tokens), 1) >= 1
        AND l.submitted_at IS NOT NULL
        AND l.submitted_at <= rec.sale_time
        AND l.submitted_at >= rec.sale_time - (lookback_days || ' days')::interval
      ORDER BY l.submitted_at DESC
      LIMIT 1;

      IF v_lead.id IS NOT NULL THEN
        v_method := 'domain_match';
        v_reason := 'domain_match ' || rec.email_domain || ' + token overlap';
      END IF;
    END IF;

    -- Rule C: Exact name match (First Last = lead.name, case-insensitive)
    IF v_lead.id IS NULL AND v_sale_name IS NOT NULL AND length(v_sale_name) >= 3 THEN
      SELECT l.id, l.name, l.email INTO v_lead
      FROM leads l
      WHERE l.name IS NOT NULL
        AND lower(btrim(l.name)) = lower(v_sale_name)
        AND l.submitted_at IS NOT NULL
        AND l.submitted_at <= rec.sale_time
        AND l.submitted_at >= rec.sale_time - (lookback_days || ' days')::interval
      ORDER BY l.submitted_at DESC
      LIMIT 1;

      IF v_lead.id IS NOT NULL THEN
        v_method := 'manual';
        v_reason := 'exact_name_match: ' || v_sale_name;
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

-- =====================================================
-- 4) Broader suggestion RPC with scoring
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_match_suggestions(
  p_sale_id uuid,
  lookback_days integer DEFAULT 365,
  limit_n integer DEFAULT 5
)
RETURNS TABLE(
  lead_id uuid,
  lead_name text,
  lead_email text,
  lead_phrase text,
  lead_submitted_at timestamptz,
  score integer,
  reasons text[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale record;
  v_sale_name text;
BEGIN
  SELECT s.id, s.email, s.email_domain, s.product_name,
         s.strong_tokens AS s_strong,
         s.match_tokens AS s_tokens,
         s.raw_payload,
         coalesce(s.date::timestamptz, s.created_at, now()) AS sale_time
  INTO v_sale
  FROM sales s WHERE s.id = p_sale_id;

  IF v_sale IS NULL THEN RETURN; END IF;

  v_sale_name := lower(btrim(
    coalesce(v_sale.raw_payload->>'First Name', '') || ' ' ||
    coalesce(v_sale.raw_payload->>'Last Name', '')
  ));

  RETURN QUERY
  SELECT
    l.id AS lead_id,
    l.name AS lead_name,
    l.email AS lead_email,
    l.phrase AS lead_phrase,
    l.submitted_at AS lead_submitted_at,
    (
      -- email exact: +100
      CASE WHEN v_sale.email IS NOT NULL AND l.email IS NOT NULL
           AND lower(btrim(v_sale.email)) = lower(btrim(l.email)) THEN 100 ELSE 0 END
      +
      -- domain match (non-free): +40
      CASE WHEN v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
           AND v_sale.email_domain = l.email_domain
           AND NOT public.is_free_email_domain(v_sale.email_domain) THEN 40 ELSE 0 END
      +
      -- name match: +30
      CASE WHEN l.name IS NOT NULL AND v_sale_name != '' AND length(v_sale_name) >= 3
           AND lower(btrim(l.name)) = v_sale_name THEN 30 ELSE 0 END
      +
      -- partial name overlap (first or last name in lead name): +15
      CASE WHEN l.name IS NOT NULL AND v_sale.raw_payload->>'First Name' IS NOT NULL
           AND length(v_sale.raw_payload->>'First Name') >= 2
           AND lower(btrim(l.name)) LIKE '%' || lower(btrim(v_sale.raw_payload->>'First Name')) || '%'
           AND lower(btrim(l.name)) != v_sale_name THEN 15 ELSE 0 END
      +
      CASE WHEN l.name IS NOT NULL AND v_sale.raw_payload->>'Last Name' IS NOT NULL
           AND length(v_sale.raw_payload->>'Last Name') >= 2
           AND lower(btrim(l.name)) LIKE '%' || lower(btrim(v_sale.raw_payload->>'Last Name')) || '%'
           AND lower(btrim(l.name)) != v_sale_name THEN 15 ELSE 0 END
      +
      -- strong token overlap: +10 each, cap 40
      LEAST(
        coalesce(array_length(public.array_intersect(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), 1), 0) * 10,
        40
      )
      +
      -- phrase/product overlap
      CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
           AND v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%' THEN 20 ELSE 0 END
      +
      CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
           AND btrim(l.phrase) ILIKE '%' || btrim(v_sale.product_name) || '%' THEN 20 ELSE 0 END
      +
      -- recency bonus
      CASE WHEN l.submitted_at >= v_sale.sale_time - interval '14 days' THEN 15
           WHEN l.submitted_at >= v_sale.sale_time - interval '45 days' THEN 8
           WHEN l.submitted_at >= v_sale.sale_time - interval '90 days' THEN 3
           ELSE 0 END
    )::int AS score,
    -- Reasons array
    ARRAY(
      SELECT unnest(ARRAY[
        CASE WHEN v_sale.email IS NOT NULL AND l.email IS NOT NULL
             AND lower(btrim(v_sale.email)) = lower(btrim(l.email)) THEN 'email_exact' ELSE NULL END,
        CASE WHEN v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
             AND v_sale.email_domain = l.email_domain
             AND NOT public.is_free_email_domain(v_sale.email_domain) THEN 'domain: ' || v_sale.email_domain ELSE NULL END,
        CASE WHEN l.name IS NOT NULL AND v_sale_name != '' AND length(v_sale_name) >= 3
             AND lower(btrim(l.name)) = v_sale_name THEN 'exact_name' ELSE NULL END,
        CASE WHEN l.name IS NOT NULL AND v_sale.raw_payload->>'Last Name' IS NOT NULL
             AND length(v_sale.raw_payload->>'Last Name') >= 2
             AND lower(btrim(l.name)) LIKE '%' || lower(btrim(v_sale.raw_payload->>'Last Name')) || '%'
             AND lower(btrim(l.name)) != v_sale_name THEN 'last_name_match' ELSE NULL END,
        CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
             AND v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%' THEN 'product≈phrase' ELSE NULL END,
        CASE WHEN coalesce(array_length(public.array_intersect(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), 1), 0) > 0
             THEN 'tokens: ' || array_to_string(public.array_intersect(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), ',') ELSE NULL END,
        CASE WHEN l.submitted_at >= v_sale.sale_time - interval '14 days' THEN 'recent (<14d)'
             WHEN l.submitted_at >= v_sale.sale_time - interval '45 days' THEN 'recent (<45d)'
             ELSE NULL END
      ]) AS r WHERE r IS NOT NULL
    ) AS reasons
  FROM leads l
  WHERE l.submitted_at IS NOT NULL
    AND l.submitted_at <= v_sale.sale_time
    AND l.submitted_at >= v_sale.sale_time - (lookback_days || ' days')::interval
    AND (
      -- email exact
      (v_sale.email IS NOT NULL AND l.email IS NOT NULL
       AND lower(btrim(v_sale.email)) = lower(btrim(l.email)))
      OR
      -- domain match (non-free)
      (v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
       AND v_sale.email_domain = l.email_domain
       AND NOT public.is_free_email_domain(v_sale.email_domain))
      OR
      -- exact name match
      (l.name IS NOT NULL AND v_sale_name != '' AND length(v_sale_name) >= 3
       AND lower(btrim(l.name)) = v_sale_name)
      OR
      -- partial name (last name)
      (l.name IS NOT NULL AND v_sale.raw_payload->>'Last Name' IS NOT NULL
       AND length(v_sale.raw_payload->>'Last Name') >= 3
       AND lower(btrim(l.name)) LIKE '%' || lower(btrim(v_sale.raw_payload->>'Last Name')) || '%')
      OR
      -- strong token overlap >= 1
      (l.strong_tokens IS NOT NULL AND v_sale.s_strong IS NOT NULL
       AND l.strong_tokens && v_sale.s_strong)
      OR
      -- phrase/product overlap
      (l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
       AND (v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%'
            OR btrim(l.phrase) ILIKE '%' || btrim(v_sale.product_name) || '%'))
    )
  ORDER BY score DESC, l.submitted_at DESC
  LIMIT limit_n;
END;
$function$;

-- =====================================================
-- 5) Bulk pre-suggest RPC: fills suggested_lead_id/score/reasons
--    on ALL unmatched sales without linking them
-- =====================================================
CREATE OR REPLACE FUNCTION public.bulk_generate_suggestions(
  lookback_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
  v_suggested int := 0;
  rec record;
  v_best record;
BEGIN
  SELECT count(*) INTO v_total
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown';

  FOR rec IN
    SELECT id FROM sales
    WHERE lead_id IS NULL AND sale_type = 'unknown'
  LOOP
    SELECT s.lead_id, s.score, s.reasons INTO v_best
    FROM public.get_match_suggestions(rec.id, lookback_days, 1) s
    LIMIT 1;

    IF v_best.lead_id IS NOT NULL THEN
      UPDATE sales SET
        suggested_lead_id = v_best.lead_id,
        suggested_score = v_best.score,
        suggested_reasons = v_best.reasons
      WHERE id = rec.id;
      v_suggested := v_suggested + 1;
    ELSE
      UPDATE sales SET
        suggested_lead_id = NULL,
        suggested_score = NULL,
        suggested_reasons = NULL
      WHERE id = rec.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_unmatched', v_total,
    'with_suggestions', v_suggested,
    'no_suggestions', v_total - v_suggested
  );
END;
$function$;

-- =====================================================
-- 6) Diagnostics RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_attribution_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_no_suggestion int;
  v_free_count int;
  v_corp_count int;
  v_no_email int;
  v_total_unmatched int;
  v_with_suggestion int;
  v_top_tokens jsonb;
BEGIN
  SELECT count(*) INTO v_total_unmatched
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown';

  SELECT count(*) INTO v_no_suggestion
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown' AND suggested_lead_id IS NULL;

  SELECT count(*) INTO v_with_suggestion
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown' AND suggested_lead_id IS NOT NULL;

  SELECT count(*) INTO v_free_count
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown'
    AND email_domain IS NOT NULL AND public.is_free_email_domain(email_domain);

  SELECT count(*) INTO v_corp_count
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown'
    AND email_domain IS NOT NULL AND NOT public.is_free_email_domain(email_domain);

  SELECT count(*) INTO v_no_email
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown'
    AND (email IS NULL OR btrim(email) = '');

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_tokens
  FROM (
    SELECT tok, count(*) AS cnt
    FROM sales, unnest(strong_tokens) AS tok
    WHERE lead_id IS NULL AND sale_type = 'unknown'
    GROUP BY tok ORDER BY cnt DESC LIMIT 20
  ) t;

  v_result := jsonb_build_object(
    'total_unmatched', v_total_unmatched,
    'with_suggestion', v_with_suggestion,
    'no_suggestion', v_no_suggestion,
    'free_email_domain', v_free_count,
    'corporate_domain', v_corp_count,
    'no_email', v_no_email,
    'top_tokens', v_top_tokens
  );

  RETURN v_result;
END;
$function$;

-- =====================================================
-- 7) Index for suggested_lead_id lookups
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sales_suggested_lead ON sales(suggested_lead_id) WHERE suggested_lead_id IS NOT NULL;
