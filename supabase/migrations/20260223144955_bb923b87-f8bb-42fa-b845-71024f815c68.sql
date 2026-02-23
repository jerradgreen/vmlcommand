
CREATE OR REPLACE FUNCTION public.get_match_suggestions(p_sale_id uuid, lookback_days integer DEFAULT 365, limit_n integer DEFAULT 5)
 RETURNS TABLE(lead_id uuid, lead_name text, lead_email text, lead_phrase text, lead_submitted_at timestamp with time zone, score integer, reasons text[])
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
      CASE WHEN v_sale.email IS NOT NULL AND l.email IS NOT NULL
           AND lower(btrim(v_sale.email)) = lower(btrim(l.email)) THEN 100 ELSE 0 END
      +
      CASE WHEN v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
           AND v_sale.email_domain = l.email_domain
           AND NOT public.is_free_email_domain(v_sale.email_domain) THEN 40 ELSE 0 END
      +
      CASE WHEN l.name IS NOT NULL AND v_sale_name != '' AND length(v_sale_name) >= 3
           AND lower(btrim(l.name)) = v_sale_name THEN 30 ELSE 0 END
      +
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
      LEAST(
        coalesce(array_length(public.array_intersect(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), 1), 0) * 10,
        40
      )
      +
      CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
           AND v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%' THEN 20 ELSE 0 END
      +
      CASE WHEN l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
           AND btrim(l.phrase) ILIKE '%' || btrim(v_sale.product_name) || '%' THEN 20 ELSE 0 END
      +
      CASE WHEN l.submitted_at >= v_sale.sale_time - interval '14 days' THEN 15
           WHEN l.submitted_at >= v_sale.sale_time - interval '45 days' THEN 8
           WHEN l.submitted_at >= v_sale.sale_time - interval '90 days' THEN 3
           ELSE 0 END
    )::int AS score,
    -- Fixed reasons array: use VALUES subquery instead of broken unnest alias
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
        (CASE WHEN coalesce(array_length(public.array_intersect(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), 1), 0) > 0
              THEN 'tokens: ' || array_to_string(public.array_intersect(coalesce(v_sale.s_strong, ARRAY[]::text[]), coalesce(l.strong_tokens, ARRAY[]::text[])), ',') ELSE NULL END),
        (CASE WHEN l.submitted_at >= v_sale.sale_time - interval '14 days' THEN 'recent (<14d)'
              WHEN l.submitted_at >= v_sale.sale_time - interval '45 days' THEN 'recent (<45d)'
              ELSE NULL END)
      ) AS t(v) WHERE v IS NOT NULL
    ) AS reasons
  FROM leads l
  WHERE l.submitted_at IS NOT NULL
    AND l.submitted_at <= v_sale.sale_time
    AND l.submitted_at >= v_sale.sale_time - (lookback_days || ' days')::interval
    AND (
      (v_sale.email IS NOT NULL AND l.email IS NOT NULL
       AND lower(btrim(v_sale.email)) = lower(btrim(l.email)))
      OR
      (v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
       AND v_sale.email_domain = l.email_domain
       AND NOT public.is_free_email_domain(v_sale.email_domain))
      OR
      (l.name IS NOT NULL AND v_sale_name != '' AND length(v_sale_name) >= 3
       AND lower(btrim(l.name)) = v_sale_name)
      OR
      (l.name IS NOT NULL AND v_sale.raw_payload->>'Last Name' IS NOT NULL
       AND length(v_sale.raw_payload->>'Last Name') >= 3
       AND lower(btrim(l.name)) LIKE '%' || lower(btrim(v_sale.raw_payload->>'Last Name')) || '%')
      OR
      (l.strong_tokens IS NOT NULL AND v_sale.s_strong IS NOT NULL
       AND l.strong_tokens && v_sale.s_strong)
      OR
      (l.phrase IS NOT NULL AND btrim(l.phrase) != '' AND v_sale.product_name IS NOT NULL
       AND (v_sale.product_name ILIKE '%' || btrim(l.phrase) || '%'
            OR btrim(l.phrase) ILIKE '%' || btrim(v_sale.product_name) || '%'))
    )
  ORDER BY score DESC, l.submitted_at DESC
  LIMIT limit_n;
END;
$function$;
