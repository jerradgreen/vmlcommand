
CREATE OR REPLACE FUNCTION public.backfill_email_matches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_count integer;
BEGIN
  WITH matched AS (
    UPDATE sales s
    SET
      lead_id = l.id,
      match_method = 'email_exact',
      match_confidence = 100,
      match_reason = 'Exact email match (backfill)',
      sale_type = 'new_lead'
    FROM leads l
    WHERE s.lead_id IS NULL
      AND s.email IS NOT NULL AND btrim(s.email) <> ''
      AND l.email IS NOT NULL AND btrim(l.email) <> ''
      AND lower(btrim(s.email)) = lower(btrim(l.email))
    RETURNING s.id
  )
  SELECT count(*) INTO matched_count FROM matched;
  
  RETURN matched_count;
END;
$$;
