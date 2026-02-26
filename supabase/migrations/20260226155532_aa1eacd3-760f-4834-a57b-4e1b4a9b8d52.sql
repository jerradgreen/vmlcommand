CREATE OR REPLACE FUNCTION public.get_marketing_rollup(p_from date, p_to date)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(sum(abs(amount)), 0)::numeric
  FROM public.financial_transactions
  WHERE txn_type = 'business'
    AND txn_category IN ('advertising_media','advertising_tools','contractor_payments','creative_services','seo')
    AND txn_date >= coalesce(p_from, '2000-01-01'::date)
    AND txn_date <= coalesce(p_to, current_date);
$$;