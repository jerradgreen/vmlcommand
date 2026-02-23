
-- 1. New columns on leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'cognito',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz DEFAULT now();

-- Unique constraint (partial: external_id NOT NULL)
ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_external_unique UNIQUE (source_system, external_id);

-- 2. New columns on sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'google_sheets',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz DEFAULT now();

ALTER TABLE public.sales
  ADD CONSTRAINT sales_source_external_unique UNIQUE (source_system, external_id);

-- 3. ingestion_logs table
CREATE TABLE public.ingestion_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_system text NOT NULL,
  external_id text,
  status text NOT NULL DEFAULT 'ok',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingestion_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to ingestion_logs"
  ON public.ingestion_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. match_sale_by_id RPC
CREATE OR REPLACE FUNCTION public.match_sale_by_id(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale record;
  v_lead record;
  v_method text;
  v_reason text;
  v_sale_name text;
BEGIN
  SELECT s.id, s.email, s.email_domain, s.product_name,
         s.strong_tokens AS s_strong,
         s.raw_payload,
         coalesce(s.date::timestamptz, s.created_at, now()) AS sale_time
  INTO v_sale
  FROM sales s WHERE s.id = p_sale_id;

  IF v_sale IS NULL THEN
    RETURN jsonb_build_object('matched', false, 'reason', 'sale not found');
  END IF;

  -- Already matched?
  IF (SELECT lead_id FROM sales WHERE id = p_sale_id) IS NOT NULL THEN
    RETURN jsonb_build_object('matched', true, 'reason', 'already matched');
  END IF;

  v_sale_name := lower(btrim(
    coalesce(v_sale.raw_payload->>'First Name', '') || ' ' ||
    coalesce(v_sale.raw_payload->>'Last Name', '')
  ));

  -- Rule A: Exact email match
  IF v_sale.email IS NOT NULL AND btrim(v_sale.email) != '' THEN
    SELECT l.id, l.name, l.email INTO v_lead
    FROM leads l
    WHERE l.email IS NOT NULL
      AND lower(btrim(v_sale.email)) = lower(btrim(l.email))
    ORDER BY l.submitted_at DESC NULLS LAST
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
      v_method := 'email_exact';
      v_reason := 'email_exact ' || coalesce(v_sale.email, '');
    END IF;
  END IF;

  -- Rule B: Non-free domain + strong token overlap
  IF v_lead.id IS NULL AND v_sale.email_domain IS NOT NULL
     AND NOT public.is_free_email_domain(v_sale.email_domain)
     AND v_sale.s_strong IS NOT NULL AND array_length(v_sale.s_strong, 1) > 0 THEN
    SELECT l.id, l.name, l.email INTO v_lead
    FROM leads l
    WHERE l.email_domain IS NOT NULL
      AND l.email_domain = v_sale.email_domain
      AND NOT public.is_free_email_domain(l.email_domain)
      AND l.strong_tokens IS NOT NULL
      AND array_length(public.array_intersect(v_sale.s_strong, l.strong_tokens), 1) >= 1
    ORDER BY l.submitted_at DESC NULLS LAST
    LIMIT 1;

    IF v_lead.id IS NOT NULL THEN
      v_method := 'domain_match';
      v_reason := 'domain_match ' || v_sale.email_domain || ' + token overlap';
    END IF;
  END IF;

  -- Rule C: Exact name match
  IF v_lead.id IS NULL AND v_sale_name IS NOT NULL AND length(v_sale_name) >= 3 THEN
    SELECT l.id, l.name, l.email INTO v_lead
    FROM leads l
    WHERE l.name IS NOT NULL
      AND lower(btrim(l.name)) = v_sale_name
    ORDER BY l.submitted_at DESC NULLS LAST
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
    WHERE id = p_sale_id;

    RETURN jsonb_build_object(
      'matched', true,
      'method', v_method,
      'lead_id', v_lead.id,
      'reason', v_reason
    );
  END IF;

  RETURN jsonb_build_object('matched', false, 'reason', 'no match found');
END;
$$;
