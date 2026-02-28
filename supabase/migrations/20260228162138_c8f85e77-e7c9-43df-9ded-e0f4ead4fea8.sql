
-- 1) Create cogs_allocations table
CREATE TABLE public.cogs_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  financial_transaction_id uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  vendor_name text,
  allocated_amount numeric NOT NULL,
  allocation_date date NOT NULL DEFAULT current_date,
  notes text
);

-- Indexes
CREATE INDEX idx_cogs_allocations_sale_id ON public.cogs_allocations(sale_id);
CREATE INDEX idx_cogs_allocations_financial_transaction_id ON public.cogs_allocations(financial_transaction_id);

-- Validation trigger (allocated_amount >= 0)
CREATE OR REPLACE FUNCTION public.validate_cogs_allocation_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.allocated_amount < 0 THEN
    RAISE EXCEPTION 'allocated_amount must be >= 0, got %', NEW.allocated_amount;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_cogs_allocation_amount
BEFORE INSERT OR UPDATE ON public.cogs_allocations
FOR EACH ROW EXECUTE FUNCTION public.validate_cogs_allocation_amount();

-- RLS
ALTER TABLE public.cogs_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to cogs_allocations" ON public.cogs_allocations FOR ALL USING (true) WITH CHECK (true);

-- 2) Alter sales table
ALTER TABLE public.sales
  ADD COLUMN estimated_cogs_pct numeric NOT NULL DEFAULT 0.50,
  ADD COLUMN manufacturing_status text NOT NULL DEFAULT 'unpaid';

-- 3) RPC: get_accrued_mfg_cogs_rollup
CREATE OR REPLACE FUNCTION public.get_accrued_mfg_cogs_rollup(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH range_sales AS (
    SELECT
      s.id AS sale_id,
      COALESCE(s.revenue, 0) * s.estimated_cogs_pct AS estimated_mfg
    FROM public.sales s
    WHERE s.date >= COALESCE(p_from, '2000-01-01'::date)
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
$$;
