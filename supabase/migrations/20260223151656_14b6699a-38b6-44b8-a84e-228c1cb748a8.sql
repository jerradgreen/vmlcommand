-- Add a stem-aware array intersect function for token matching
-- TITAN will match TITANS, BURGER will match BURGERS, etc.
CREATE OR REPLACE FUNCTION public.array_intersect_stem(a text[], b text[])
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::text[])
  FROM unnest(a) AS x
  WHERE EXISTS (
    SELECT 1 FROM unnest(b) AS y
    WHERE x = y
       OR (length(x) >= 4 AND length(y) >= 4 AND (y LIKE x || '%' OR x LIKE y || '%'))
  )
$function$;

-- Update get_match_suggestions to use stem-aware token matching
CREATE OR REPLACE FUNCTION public.get_match_suggestions(
  p_sale_id uuid,
  lookback_days integer DEFAULT 365,
  limit_n integer DEFAULT 5
)
RETURNS TABLE(
  lead_id uuid, lead_name text, lead_email text, lead_phrase text,
  lead_submitted_at timestamptz, score integer, reasons text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
      -- exact email
      CASE WHEN v_sale.email IS NOT NULL AND l.email IS NOT NULL
           AND lower(btrim(v_sale.email)) = lower(btrim(l.email)) THEN 100 ELSE 0 END
      +
      -- corporate domain
      CASE WHEN v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
           AND v_sale.email_domain = l.email_domain
           AND NOT public.is_free_email_domain(v_sale.email_domain) THEN 40 ELSE 0 END
      +
      -- exact name
      CASE WHEN l.name IS NOT NULL AND v_sale_name != '' AND length(v_sale_name) >= 3
           AND lower(btrim(l.name)) = v_sale_name THEN 30 ELSE 0 END
      +
      -- first name partial
      CASE WHEN l.name IS NOT NULL AND v_sale.raw_payload->>'First Name' IS NOT NULL
           AND length(v_sale.raw_payload->>'First Name') >= 2
           AND lower(btrim(l.name)) LIKE '%' || lower(btrim(v_sale.raw_payload->>'First Name')) || '%'
           AND lower(btrim(l.name)) != v_sale_name THEN 15 ELSE 0 END
      +
      -- last name partial
      CASE WHEN l.name IS NOT NULL AND v_sale.raw_payload->>'Last Name' IS NOT NULL
           AND length(v_sale.raw_payload->>'Last Name') >= 2
           AND lower(btrim(l.name)) LIKE '%' || lower(btrim(v_sale.raw_payload->>'Last Name')) || '%'
           AND lower(btrim(l.name)) != v_sale_name THEN 15 ELSE 0 END
      +
      -- stem-aware strong token overlap (TITAN ↔ TITANS)
      LEAST(
        coalesce(array_length(public.array_intersect_stem(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), 1), 0) * 10,
        40
      )
      +
      -- product ≈ phrase
      CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
           AND v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%' THEN 20 ELSE 0 END
      +
      CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
           AND btrim(l.phrase) ILIKE '%' || btrim(v_sale.product_name) || '%' THEN 20 ELSE 0 END
      +
      -- time proximity
      CASE WHEN l.submitted_at >= v_sale.sale_time - interval '14 days' THEN 15
           WHEN l.submitted_at >= v_sale.sale_time - interval '45 days' THEN 8
           WHEN l.submitted_at >= v_sale.sale_time - interval '90 days' THEN 3
           ELSE 0 END
    )::int AS score,
    ARRAY(
      SELECT v FROM (VALUES
        (CASE WHEN v_sale.email IS NOT NULL AND l.email IS NOT NULL
              AND lower(btrim(v_sale.email)) = lower(btrim(l.email)) THEN 'email_exact' ELSE NULL END),
        (CASE WHEN v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
              AND v_sale.email_domain = l.email_domain
              AND NOT public.is_free_email_domain(v_sale.email_domain) THEN 'domain: ' || v_sale.email_domain ELSE NULL END),
        (CASE WHEN l.name IS NOT NULL AND v_sale_name != '' AND length(v_sale_name) >= 3
              AND lower(btrim(l.name)) = v_sale_name THEN 'exact_name' ELSE NULL END),
        (CASE WHEN l.name IS NOT NULL AND v_sale.raw_payload->>'Last Name' IS NOT NULL
              AND length(v_sale.raw_payload->>'Last Name') >= 2
              AND lower(btrim(l.name)) LIKE '%' || lower(btrim(v_sale.raw_payload->>'Last Name')) || '%'
              AND lower(btrim(l.name)) != v_sale_name THEN 'last_name_match' ELSE NULL END),
        (CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
              AND v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%' THEN 'product≈phrase' ELSE NULL END),
        (CASE WHEN coalesce(array_length(public.array_intersect_stem(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), 1), 0) > 0
              THEN 'tokens: ' || array_to_string(public.array_intersect_stem(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), ',')
              ELSE NULL END)
      ) AS t(v) WHERE v IS NOT NULL
    ) AS reasons
  FROM leads l
  WHERE l.submitted_at >= v_sale.sale_time - (lookback_days || ' days')::interval
    AND l.submitted_at <= v_sale.sale_time
  ORDER BY score DESC
  LIMIT limit_n;
END;
$function$;