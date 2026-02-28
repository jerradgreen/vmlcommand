
-- ═══ Shopify Capital Loans table ═══
CREATE TABLE public.shopify_capital_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text DEFAULT 'Shopify Capital',
  start_order_number_int int NOT NULL,
  repayment_rate numeric NOT NULL,
  payback_cap numeric NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.shopify_capital_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to shopify_capital_loans"
  ON public.shopify_capital_loans FOR ALL USING (true) WITH CHECK (true);

-- Partial unique index: only one active loan allowed
CREATE UNIQUE INDEX one_active_shopify_capital_loan
  ON public.shopify_capital_loans (id)
  WHERE is_active = true;

-- Seed with initial loan
INSERT INTO public.shopify_capital_loans (start_order_number_int, repayment_rate, payback_cap)
VALUES (18412, 0.13, 16650);

-- ═══ Performance indexes on sales ═══
CREATE INDEX IF NOT EXISTS idx_sales_order_id ON public.sales(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);

-- ═══ RPC: get_shopify_capital_summary ═══
CREATE OR REPLACE FUNCTION public.get_shopify_capital_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_loan record;
  v_from date;
  v_to date;
  v_gross_all numeric;
  v_gross_through_end numeric;
  v_gross_before_start numeric;
  v_paid_to_date numeric;
  v_paid_up_to_end numeric;
  v_paid_before_start numeric;
  v_paid_in_range numeric;
  v_remaining numeric;
BEGIN
  SELECT * INTO v_loan FROM shopify_capital_loans WHERE is_active = true LIMIT 1;
  IF v_loan IS NULL THEN
    RETURN jsonb_build_object(
      'gross_revenue_since_start', 0,
      'paid_to_date', 0,
      'remaining_balance', 0,
      'paid_in_range', 0,
      'repayment_rate', 0,
      'payback_cap', 0
    );
  END IF;

  v_from := COALESCE(p_from, '2000-01-01'::date);
  v_to   := COALESCE(p_to, current_date);

  -- All-time gross from qualifying Shopify orders
  SELECT COALESCE(SUM(revenue), 0) INTO v_gross_all
  FROM sales
  WHERE order_id ~ '^#VML\d+$'
    AND NULLIF(regexp_replace(order_id, '\D', '', 'g'), '')::int >= v_loan.start_order_number_int;

  v_paid_to_date := LEAST(v_gross_all * v_loan.repayment_rate, v_loan.payback_cap);
  v_remaining    := GREATEST(0, v_loan.payback_cap - v_paid_to_date);

  -- Gross through end of range
  SELECT COALESCE(SUM(revenue), 0) INTO v_gross_through_end
  FROM sales
  WHERE order_id ~ '^#VML\d+$'
    AND NULLIF(regexp_replace(order_id, '\D', '', 'g'), '')::int >= v_loan.start_order_number_int
    AND date <= v_to;

  -- Gross before start of range
  SELECT COALESCE(SUM(revenue), 0) INTO v_gross_before_start
  FROM sales
  WHERE order_id ~ '^#VML\d+$'
    AND NULLIF(regexp_replace(order_id, '\D', '', 'g'), '')::int >= v_loan.start_order_number_int
    AND date < v_from;

  v_paid_up_to_end    := LEAST(v_gross_through_end * v_loan.repayment_rate, v_loan.payback_cap);
  v_paid_before_start := LEAST(v_gross_before_start * v_loan.repayment_rate, v_loan.payback_cap);
  v_paid_in_range     := GREATEST(0, v_paid_up_to_end - v_paid_before_start);

  RETURN jsonb_build_object(
    'gross_revenue_since_start', v_gross_all,
    'paid_to_date', v_paid_to_date,
    'remaining_balance', v_remaining,
    'paid_in_range', v_paid_in_range,
    'repayment_rate', v_loan.repayment_rate,
    'payback_cap', v_loan.payback_cap
  );
END;
$$;
