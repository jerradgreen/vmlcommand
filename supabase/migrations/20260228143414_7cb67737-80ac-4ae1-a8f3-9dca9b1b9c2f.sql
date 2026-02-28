
-- New RPC: get_sales_counts
CREATE OR REPLACE FUNCTION public.get_sales_counts(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_all int;
  v_shopify int;
  v_loan_qualifying int;
  v_loan record;
BEGIN
  SELECT count(*) INTO v_all
  FROM sales
  WHERE date >= COALESCE(p_from, '2000-01-01'::date)
    AND date <= COALESCE(p_to, current_date);

  SELECT count(*) INTO v_shopify
  FROM sales
  WHERE order_id ~ '^#VML\d+$'
    AND date >= COALESCE(p_from, '2000-01-01'::date)
    AND date <= COALESCE(p_to, current_date);

  SELECT * INTO v_loan FROM shopify_capital_loans WHERE is_active = true LIMIT 1;

  IF v_loan IS NOT NULL THEN
    SELECT count(*) INTO v_loan_qualifying
    FROM sales
    WHERE order_id ~ '^#VML\d+$'
      AND NULLIF(regexp_replace(order_id, '\D', '', 'g'), '')::int >= v_loan.start_order_number_int
      AND date >= COALESCE(p_from, '2000-01-01'::date)
      AND date <= COALESCE(p_to, current_date);
  ELSE
    v_loan_qualifying := 0;
  END IF;

  RETURN jsonb_build_object(
    'all_sales_count', v_all,
    'shopify_sales_count', v_shopify,
    'loan_qualifying_sales_count', v_loan_qualifying
  );
END;
$$;

-- Update get_shopify_capital_summary to also return loan_qualifying_sales_count_in_range
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
  v_loan_qualifying_count int;
BEGIN
  SELECT * INTO v_loan FROM shopify_capital_loans WHERE is_active = true LIMIT 1;
  IF v_loan IS NULL THEN
    RETURN jsonb_build_object(
      'gross_revenue_since_start', 0,
      'paid_to_date', 0,
      'remaining_balance', 0,
      'paid_in_range', 0,
      'repayment_rate', 0,
      'payback_cap', 0,
      'loan_qualifying_sales_count_in_range', 0
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

  -- Count of loan-qualifying sales in range
  SELECT count(*) INTO v_loan_qualifying_count
  FROM sales
  WHERE order_id ~ '^#VML\d+$'
    AND NULLIF(regexp_replace(order_id, '\D', '', 'g'), '')::int >= v_loan.start_order_number_int
    AND date >= v_from AND date <= v_to;

  RETURN jsonb_build_object(
    'gross_revenue_since_start', v_gross_all,
    'paid_to_date', v_paid_to_date,
    'remaining_balance', v_remaining,
    'paid_in_range', v_paid_in_range,
    'repayment_rate', v_loan.repayment_rate,
    'payback_cap', v_loan.payback_cap,
    'loan_qualifying_sales_count_in_range', v_loan_qualifying_count
  );
END;
$$;
