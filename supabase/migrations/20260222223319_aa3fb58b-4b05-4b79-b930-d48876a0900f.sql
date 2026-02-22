
-- ============================================================
-- Multi-Signal Attribution Matching Migration
-- ============================================================

-- A. Helper Functions
-- -----------------------------------------------------------

-- 1) normalize_text
CREATE OR REPLACE FUNCTION public.normalize_text(t text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- 2) extract_domain
CREATE OR REPLACE FUNCTION public.extract_domain(email text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE WHEN email IS NOT NULL AND position('@' in email) > 0
    THEN lower(split_part(btrim(email), '@', 2))
    ELSE NULL
  END
$$;

-- 3) is_free_email_domain
CREATE OR REPLACE FUNCTION public.is_free_email_domain(domain text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(domain, '') = ANY(ARRAY[
    'gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com',
    'icloud.com','me.com','msn.com','live.com','comcast.net'
  ])
$$;

-- 4) tokenize_text
CREATE OR REPLACE FUNCTION public.tokenize_text(t text)
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(tok), ARRAY[]::text[])
  FROM unnest(string_to_array(public.normalize_text(t), ' ')) AS tok
  WHERE length(tok) >= 2
    AND (tok ~ '[a-z]' OR (length(tok) BETWEEN 2 AND 3 AND tok ~ '^\d+$'))
$$;

-- 5) remove_stopwords
CREATE OR REPLACE FUNCTION public.remove_stopwords(tokens text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(tok), ARRAY[]::text[])
  FROM unnest(tokens) AS tok
  WHERE tok NOT IN (
    'vintage','marquee','marquees','letter','letters','light','lights','sign','signs',
    'custom','quote','request','please','check','spelling','before','submitting',
    'with','and','the','of','for','to','in','on','at','from','by','size',
    'inch','inches','ft','feet','event','style','wall','hanging','stand','up',
    'indoor','outdoor','both','logo','layered','an','a'
  )
$$;

-- 6) strong_tokens_fn
CREATE OR REPLACE FUNCTION public.strong_tokens_fn(tokens text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT tok), ARRAY[]::text[])
  FROM unnest(tokens) AS tok
  WHERE
    -- tokens >= 4 chars with at least one letter
    (length(tok) >= 4 AND tok ~ '[a-z]')
    OR
    -- mixed letter+digit tokens of any length
    (tok ~ '[a-z]' AND tok ~ '[0-9]')
    OR
    -- acronyms: all letters, length >= 3
    (length(tok) >= 3 AND tok ~ '^[a-z]+$' AND length(tok) <= 6)
$$;

-- 7) array_intersect
CREATE OR REPLACE FUNCTION public.array_intersect(a text[], b text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(x), ARRAY[]::text[])
  FROM unnest(a) AS x
  WHERE x = ANY(b)
$$;


-- B. New Columns
-- -----------------------------------------------------------

-- leads columns
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS match_text text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS match_tokens text[];
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS strong_tokens text[];
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_domain text GENERATED ALWAYS AS (public.extract_domain(email)) STORED;

-- sales columns
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS order_text text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS match_text text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS match_tokens text[];
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS strong_tokens text[];
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS email_domain text GENERATED ALWAYS AS (public.extract_domain(email)) STORED;


-- C. Triggers
-- -----------------------------------------------------------

-- Leads trigger function
CREATE OR REPLACE FUNCTION public.leads_compute_tokens()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.match_text := public.normalize_text(
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.email, '') || ' ' ||
    coalesce(NEW.phrase, '') || ' ' ||
    coalesce(NEW.sign_style, '') || ' ' ||
    coalesce(NEW.size_text, '') || ' ' ||
    coalesce(NEW.notes, '')
  );
  NEW.match_tokens := public.remove_stopwords(public.tokenize_text(NEW.match_text));
  NEW.strong_tokens := public.strong_tokens_fn(NEW.match_tokens);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_leads_compute_tokens
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_compute_tokens();

-- Sales trigger function
CREATE OR REPLACE FUNCTION public.sales_compute_tokens()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.match_text := public.normalize_text(
    coalesce(NEW.order_id, '') || ' ' ||
    coalesce(NEW.email, '') || ' ' ||
    coalesce(NEW.product_name, '') || ' ' ||
    coalesce(NEW.order_text, '')
  );
  NEW.match_tokens := public.remove_stopwords(public.tokenize_text(NEW.match_text));
  NEW.strong_tokens := public.strong_tokens_fn(NEW.match_tokens);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_compute_tokens
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_compute_tokens();


-- D. Explicit Backfill
-- -----------------------------------------------------------

-- Backfill leads
UPDATE public.leads SET
  match_text = public.normalize_text(
    coalesce(name, '') || ' ' || coalesce(email, '') || ' ' ||
    coalesce(phrase, '') || ' ' || coalesce(sign_style, '') || ' ' ||
    coalesce(size_text, '') || ' ' || coalesce(notes, '')
  ),
  match_tokens = public.remove_stopwords(public.tokenize_text(
    public.normalize_text(
      coalesce(name, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(phrase, '') || ' ' || coalesce(sign_style, '') || ' ' ||
      coalesce(size_text, '') || ' ' || coalesce(notes, '')
    )
  )),
  strong_tokens = public.strong_tokens_fn(public.remove_stopwords(public.tokenize_text(
    public.normalize_text(
      coalesce(name, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(phrase, '') || ' ' || coalesce(sign_style, '') || ' ' ||
      coalesce(size_text, '') || ' ' || coalesce(notes, '')
    )
  )));

-- Backfill sales order_text from raw_payload (all string values, excluding noise keys)
UPDATE public.sales SET
  order_text = (
    SELECT string_agg(val, ' ')
    FROM jsonb_each_text(coalesce(raw_payload, '{}'::jsonb)) AS kv(k, val)
    WHERE lower(k) NOT IN ('revenue','total','tax','shipping','discount','amount','qty','quantity','zip','postal','phone','price','cost','profit','manufacturing','order_id','date','email','email_norm')
      AND val ~ '[a-zA-Z]'
  )
WHERE raw_payload IS NOT NULL;

UPDATE public.sales SET
  match_text = public.normalize_text(
    coalesce(order_id, '') || ' ' || coalesce(email, '') || ' ' ||
    coalesce(product_name, '') || ' ' || coalesce(order_text, '')
  ),
  match_tokens = public.remove_stopwords(public.tokenize_text(
    public.normalize_text(
      coalesce(order_id, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(product_name, '') || ' ' || coalesce(order_text, '')
    )
  )),
  strong_tokens = public.strong_tokens_fn(public.remove_stopwords(public.tokenize_text(
    public.normalize_text(
      coalesce(order_id, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(product_name, '') || ' ' || coalesce(order_text, '')
    )
  )));


-- E. Indexes
-- -----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_email_domain ON public.leads(email_domain);
CREATE INDEX IF NOT EXISTS idx_sales_email_domain ON public.sales(email_domain);
CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON public.leads(submitted_at);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);
CREATE INDEX IF NOT EXISTS idx_leads_strong_tokens ON public.leads USING GIN(strong_tokens);
CREATE INDEX IF NOT EXISTS idx_sales_strong_tokens ON public.sales USING GIN(strong_tokens);


-- F. Constraint Update
-- -----------------------------------------------------------
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_match_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_match_method_check
  CHECK (match_method IS NULL OR match_method IN ('email_exact','smart_suggested','manual','domain_plus_keywords','keywords_strict'));


-- G-I. RPCs
-- -----------------------------------------------------------

-- backfill_smart_matches
CREATE OR REPLACE FUNCTION public.backfill_smart_matches(
  lookback_days int DEFAULT 120,
  min_score int DEFAULT 95,
  min_gap int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_before int;
  v_linked int := 0;
  rec record;
  top1 record;
  top2 record;
  v_gap int;
  v_match_method text;
  v_reason text;
BEGIN
  SELECT count(*) INTO v_total_before
  FROM sales WHERE lead_id IS NULL AND sale_type = 'unknown';

  FOR rec IN
    SELECT s.id AS sale_id,
           s.email AS sale_email,
           s.email_domain AS sale_email_domain,
           s.strong_tokens AS sale_strong,
           s.match_tokens AS sale_tokens,
           coalesce(s.date::timestamptz, s.created_at, now()) AS sale_time
    FROM sales s
    WHERE s.lead_id IS NULL AND s.sale_type = 'unknown'
  LOOP
    -- Find top 2 candidates
    SELECT INTO top1
      l.id AS lead_id,
      l.name AS lead_name,
      l.email AS lead_email,
      l.email_domain AS lead_email_domain,
      l.strong_tokens AS lead_strong,
      l.match_tokens AS lead_tokens,
      l.sign_style AS lead_sign_style,
      l.size_text AS lead_size_text,
      l.submitted_at AS lead_submitted_at,
      -- compute score inline
      (
        CASE WHEN rec.sale_email IS NOT NULL AND l.email IS NOT NULL
             AND lower(btrim(rec.sale_email)) = lower(btrim(l.email)) THEN 100 ELSE 0 END
        +
        CASE WHEN rec.sale_email_domain IS NOT NULL AND l.email_domain IS NOT NULL
             AND rec.sale_email_domain = l.email_domain
             AND NOT public.is_free_email_domain(rec.sale_email_domain) THEN 50 ELSE 0 END
        +
        least(45, cardinality(public.array_intersect(rec.sale_strong, l.strong_tokens)) * 15)
        +
        least(25, cardinality(public.array_intersect(rec.sale_tokens, l.match_tokens)) * 3)
        +
        CASE WHEN l.sign_style IS NOT NULL AND EXISTS (
          SELECT 1 FROM sales ss WHERE ss.id = rec.sale_id
            AND ss.match_text LIKE '%' || lower(l.sign_style) || '%'
        ) THEN 15 ELSE 0 END
        +
        CASE WHEN l.size_text IS NOT NULL AND l.size_text ~ '\d' AND EXISTS (
          SELECT 1 FROM sales ss WHERE ss.id = rec.sale_id
            AND ss.match_text ~ (regexp_replace(l.size_text, '[^0-9]', '', 'g'))
        ) THEN 10 ELSE 0 END
        +
        CASE WHEN extract(epoch FROM (rec.sale_time - l.submitted_at))/86400 <= 14 THEN 10
             WHEN extract(epoch FROM (rec.sale_time - l.submitted_at))/86400 <= 45 THEN 5
             ELSE 0 END
      ) AS score,
      -- email_exact flag
      (rec.sale_email IS NOT NULL AND l.email IS NOT NULL
       AND lower(btrim(rec.sale_email)) = lower(btrim(l.email))) AS email_exact,
      -- strong_overlap count
      cardinality(public.array_intersect(rec.sale_strong, l.strong_tokens)) AS strong_overlap,
      -- domain_match flag
      (rec.sale_email_domain IS NOT NULL AND l.email_domain IS NOT NULL
       AND rec.sale_email_domain = l.email_domain
       AND NOT public.is_free_email_domain(rec.sale_email_domain)) AS domain_match
    FROM leads l
    WHERE l.submitted_at IS NOT NULL
      AND l.submitted_at <= rec.sale_time
      AND l.submitted_at >= rec.sale_time - (lookback_days || ' days')::interval
      AND (
        -- candidate filter: email_exact OR strong>=2 OR domain+strong>=1
        (rec.sale_email IS NOT NULL AND l.email IS NOT NULL
         AND lower(btrim(rec.sale_email)) = lower(btrim(l.email)))
        OR
        (cardinality(public.array_intersect(rec.sale_strong, l.strong_tokens)) >= 2)
        OR
        (rec.sale_email_domain IS NOT NULL AND l.email_domain IS NOT NULL
         AND rec.sale_email_domain = l.email_domain
         AND NOT public.is_free_email_domain(rec.sale_email_domain)
         AND cardinality(public.array_intersect(rec.sale_strong, l.strong_tokens)) >= 1)
      )
    ORDER BY score DESC, l.submitted_at DESC
    LIMIT 1;

    IF top1 IS NULL OR top1.score < min_score THEN
      CONTINUE;
    END IF;

    -- Check safety: must have real signal
    IF NOT (top1.email_exact OR top1.strong_overlap >= 2 OR (top1.domain_match AND top1.strong_overlap >= 1)) THEN
      CONTINUE;
    END IF;

    -- Get second best for gap check
    SELECT INTO top2
      (
        CASE WHEN rec.sale_email IS NOT NULL AND l.email IS NOT NULL
             AND lower(btrim(rec.sale_email)) = lower(btrim(l.email)) THEN 100 ELSE 0 END
        + CASE WHEN rec.sale_email_domain IS NOT NULL AND l.email_domain IS NOT NULL
               AND rec.sale_email_domain = l.email_domain
               AND NOT public.is_free_email_domain(rec.sale_email_domain) THEN 50 ELSE 0 END
        + least(45, cardinality(public.array_intersect(rec.sale_strong, l.strong_tokens)) * 15)
        + least(25, cardinality(public.array_intersect(rec.sale_tokens, l.match_tokens)) * 3)
        + CASE WHEN extract(epoch FROM (rec.sale_time - l.submitted_at))/86400 <= 14 THEN 10
               WHEN extract(epoch FROM (rec.sale_time - l.submitted_at))/86400 <= 45 THEN 5
               ELSE 0 END
      ) AS score
    FROM leads l
    WHERE l.submitted_at IS NOT NULL
      AND l.submitted_at <= rec.sale_time
      AND l.submitted_at >= rec.sale_time - (lookback_days || ' days')::interval
      AND l.id != top1.lead_id
      AND (
        (rec.sale_email IS NOT NULL AND l.email IS NOT NULL
         AND lower(btrim(rec.sale_email)) = lower(btrim(l.email)))
        OR
        (cardinality(public.array_intersect(rec.sale_strong, l.strong_tokens)) >= 2)
        OR
        (rec.sale_email_domain IS NOT NULL AND l.email_domain IS NOT NULL
         AND rec.sale_email_domain = l.email_domain
         AND NOT public.is_free_email_domain(rec.sale_email_domain)
         AND cardinality(public.array_intersect(rec.sale_strong, l.strong_tokens)) >= 1)
      )
    ORDER BY score DESC, l.submitted_at DESC
    LIMIT 1;

    v_gap := CASE WHEN top2 IS NULL THEN 999 ELSE top1.score - coalesce(top2.score, 0) END;

    IF v_gap < min_gap THEN
      CONTINUE;
    END IF;

    -- Determine match_method
    v_match_method := CASE
      WHEN top1.email_exact THEN 'email_exact'
      WHEN top1.domain_match THEN 'domain_plus_keywords'
      ELSE 'keywords_strict'
    END;

    -- Build reason
    v_reason := '';
    IF top1.email_exact THEN v_reason := 'email_exact ' || coalesce(rec.sale_email, ''); END IF;
    IF top1.domain_match THEN
      v_reason := v_reason || CASE WHEN v_reason != '' THEN '; ' ELSE '' END
        || 'domain_match ' || coalesce(rec.sale_email_domain, '');
    END IF;
    IF top1.strong_overlap > 0 THEN
      v_reason := v_reason || CASE WHEN v_reason != '' THEN '; ' ELSE '' END
        || 'strong_overlap=' || top1.strong_overlap
        || ' (' || array_to_string(public.array_intersect(rec.sale_strong, top1.lead_strong), ', ') || ')';
    END IF;
    v_reason := v_reason || '; recency='
      || round(extract(epoch FROM (rec.sale_time - top1.lead_submitted_at))/86400) || 'd';

    UPDATE sales SET
      lead_id = top1.lead_id,
      match_method = v_match_method,
      match_confidence = top1.score,
      match_reason = v_reason,
      sale_type = 'new_lead'
    WHERE id = rec.sale_id;

    v_linked := v_linked + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'total_unmatched_before', v_total_before,
    'linked_count', v_linked,
    'still_unmatched_after', v_total_before - v_linked
  );
END;
$$;


-- get_match_suggestions
CREATE OR REPLACE FUNCTION public.get_match_suggestions(
  p_sale_id uuid,
  lookback_days int DEFAULT 180,
  limit_n int DEFAULT 5
)
RETURNS TABLE(
  lead_id uuid,
  lead_name text,
  lead_email text,
  lead_phrase text,
  lead_submitted_at timestamptz,
  score int,
  reasons text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
BEGIN
  SELECT s.id, s.email, s.email_domain, s.strong_tokens, s.match_tokens, s.match_text,
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
    (
      CASE WHEN v_sale.email IS NOT NULL AND l.email IS NOT NULL
           AND lower(btrim(v_sale.email)) = lower(btrim(l.email)) THEN 100 ELSE 0 END
      + CASE WHEN v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
             AND v_sale.email_domain = l.email_domain
             AND NOT public.is_free_email_domain(v_sale.email_domain) THEN 50 ELSE 0 END
      + least(45, cardinality(public.array_intersect(v_sale.strong_tokens, l.strong_tokens)) * 15)
      + least(25, cardinality(public.array_intersect(v_sale.match_tokens, l.match_tokens)) * 3)
      + CASE WHEN l.sign_style IS NOT NULL AND v_sale.match_text LIKE '%' || lower(l.sign_style) || '%' THEN 15 ELSE 0 END
      + CASE WHEN l.size_text IS NOT NULL AND l.size_text ~ '\d' AND v_sale.match_text ~ (regexp_replace(l.size_text, '[^0-9]', '', 'g')) THEN 10 ELSE 0 END
      + CASE WHEN extract(epoch FROM (v_sale.sale_time - l.submitted_at))/86400 <= 14 THEN 10
             WHEN extract(epoch FROM (v_sale.sale_time - l.submitted_at))/86400 <= 45 THEN 5
             ELSE 0 END
    )::int AS score,
    ARRAY(
      SELECT unnest(ARRAY[
        CASE WHEN v_sale.email IS NOT NULL AND l.email IS NOT NULL
             AND lower(btrim(v_sale.email)) = lower(btrim(l.email)) THEN 'email_exact' ELSE NULL END,
        CASE WHEN v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
             AND v_sale.email_domain = l.email_domain
             AND NOT public.is_free_email_domain(v_sale.email_domain) THEN 'domain_match: ' || v_sale.email_domain ELSE NULL END,
        CASE WHEN cardinality(public.array_intersect(v_sale.strong_tokens, l.strong_tokens)) > 0
             THEN 'strong_overlap=' || cardinality(public.array_intersect(v_sale.strong_tokens, l.strong_tokens))
                  || ' (' || array_to_string(public.array_intersect(v_sale.strong_tokens, l.strong_tokens), ', ') || ')'
             ELSE NULL END,
        CASE WHEN cardinality(public.array_intersect(v_sale.match_tokens, l.match_tokens)) > 0
             THEN 'token_overlap=' || cardinality(public.array_intersect(v_sale.match_tokens, l.match_tokens)) ELSE NULL END,
        CASE WHEN l.sign_style IS NOT NULL AND v_sale.match_text LIKE '%' || lower(l.sign_style) || '%'
             THEN 'sign_style_match' ELSE NULL END,
        'recency=' || round(extract(epoch FROM (v_sale.sale_time - l.submitted_at))/86400) || 'd'
      ]) AS r WHERE r IS NOT NULL
    ) AS reasons
  FROM leads l
  WHERE l.submitted_at IS NOT NULL
    AND l.submitted_at <= v_sale.sale_time
    AND l.submitted_at >= v_sale.sale_time - (lookback_days || ' days')::interval
    AND (
      (v_sale.email IS NOT NULL AND l.email IS NOT NULL
       AND lower(btrim(v_sale.email)) = lower(btrim(l.email)))
      OR
      (cardinality(public.array_intersect(v_sale.strong_tokens, l.strong_tokens)) >= 2)
      OR
      (v_sale.email_domain IS NOT NULL AND l.email_domain IS NOT NULL
       AND v_sale.email_domain = l.email_domain
       AND NOT public.is_free_email_domain(v_sale.email_domain)
       AND cardinality(public.array_intersect(v_sale.strong_tokens, l.strong_tokens)) >= 1)
    )
  ORDER BY score DESC, l.submitted_at DESC
  LIMIT limit_n;
END;
$$;


-- search_leads
CREATE OR REPLACE FUNCTION public.search_leads(
  search_term text,
  limit_n int DEFAULT 20
)
RETURNS TABLE(
  lead_id uuid,
  lead_text_id text,
  lead_name text,
  lead_email text,
  lead_phrase text,
  lead_submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term text;
BEGIN
  v_term := '%' || lower(btrim(search_term)) || '%';
  RETURN QUERY
  SELECT l.id, l.lead_id, l.name, l.email, l.phrase, l.submitted_at
  FROM leads l
  WHERE lower(coalesce(l.name, '')) LIKE v_term
     OR lower(coalesce(l.email, '')) LIKE v_term
     OR lower(coalesce(l.phrase, '')) LIKE v_term
     OR lower(coalesce(l.lead_id, '')) LIKE v_term
  ORDER BY l.submitted_at DESC
  LIMIT limit_n;
END;
$$;
