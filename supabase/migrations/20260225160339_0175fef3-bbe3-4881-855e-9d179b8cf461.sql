-- Fix normalization order for transaction rule matching so uppercase values don't become empty
CREATE OR REPLACE FUNCTION public.transaction_rules_normalize_match_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.match_type <> 'regex' THEN
    NEW.match_value_norm := public.normalize_text(NEW.match_value);
  ELSE
    NEW.match_value_norm := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill existing non-regex rules that were normalized incorrectly
UPDATE public.transaction_rules
SET match_value_norm = public.normalize_text(match_value)
WHERE match_type <> 'regex';