CREATE OR REPLACE FUNCTION public.get_accrued_mfg_cogs_rollup(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH range_sales AS (
    SELECT
      s.id AS sale_id,
      COALESCE(s.revenue, 0) * s.estimated_cogs_pct AS estimated_mfg
    FROM public.sales s
    WHERE s.date >= GREATEST(COALESCE(p_from, '2000-01-01'::date), '2026-01-01'::date)
      AND s.date <= COALESCE(p_to, current_date)
  ),
  sale_allocs AS (
    SELECT
      rs.sale_id,
      rs.estimated_mfg,
      COALESCE(SUM(ca.allocated_amount), 0) AS allocated_mfg
    FROM range_sales rs
    LEFT JOIN public.cogs_allocations ca ON ca.sale_id = rs.sale_id
    GROUP BY rs.sale_id, rs.estimated_mfg
  )
  SELECT jsonb_build_object(
    'estimated_mfg_total', COALESCE(SUM(estimated_mfg), 0),
    'allocated_mfg_total', COALESCE(SUM(allocated_mfg), 0),
    'accrued_mfg_remaining_total', COALESCE(SUM(GREATEST(estimated_mfg - allocated_mfg, 0)), 0),
    'unpaid_count', COUNT(*) FILTER (WHERE allocated_mfg = 0),
    'partial_count', COUNT(*) FILTER (WHERE allocated_mfg > 0 AND allocated_mfg < estimated_mfg),
    'paid_count', COUNT(*) FILTER (WHERE allocated_mfg >= estimated_mfg AND estimated_mfg > 0)
  ) INTO v_result
  FROM sale_allocs;

  RETURN v_result;
END;
$function$;