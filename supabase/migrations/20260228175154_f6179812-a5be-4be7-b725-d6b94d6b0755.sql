
-- Step 1: Add status and start_date columns to shopify_capital_loans
ALTER TABLE public.shopify_capital_loans
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS start_date date;

-- Step 2: Migrate is_active to status
UPDATE public.shopify_capital_loans SET status = CASE WHEN is_active = true THEN 'active' ELSE 'paid_off' END;

-- Step 3: Drop old partial unique index on is_active
DROP INDEX IF EXISTS one_active_shopify_capital_loan;

-- Step 4: Create new partial unique index on status='active' (only 1 active loan allowed)
CREATE UNIQUE INDEX one_active_shopify_capital_loan ON public.shopify_capital_loans ((true)) WHERE status = 'active';

-- Step 5: Drop is_active column
ALTER TABLE public.shopify_capital_loans DROP COLUMN IF EXISTS is_active;

-- Step 6: Update get_shopify_capital_summary for multi-loan support
CREATE OR REPLACE FUNCTION public.get_shopify_capital_summary(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_loan record;
  v_from date;
  v_to date;
  v_total_paid_to_date numeric := 0;
  v_total_remaining numeric := 0;
  v_total_paid_in_range numeric := 0;
  v_total_payback_cap numeric := 0;
  v_total_loan_qualifying_count int := 0;
  v_active_repayment_rate numeric := 0;
  v_loan_count int := 0;
  -- per-loan vars
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
  v_from := COALESCE(p_from, '2000-01-01'::date);
  v_to   := COALESCE(p_to, current_date);

  FOR v_loan IN
    SELECT * FROM shopify_capital_loans ORDER BY start_order_number_int ASC
  LOOP
    v_loan_count := v_loan_count + 1;

    -- All-time gross from qualifying Shopify orders for this loan
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

    -- Count of loan-qualifying sales in range for this loan
    SELECT count(*) INTO v_loan_qualifying_count
    FROM sales
    WHERE order_id ~ '^#VML\d+$'
      AND NULLIF(regexp_replace(order_id, '\D', '', 'g'), '')::int >= v_loan.start_order_number_int
      AND date >= v_from AND date <= v_to;

    -- Accumulate totals
    v_total_paid_to_date := v_total_paid_to_date + v_paid_to_date;
    v_total_remaining := v_total_remaining + v_remaining;
    v_total_paid_in_range := v_total_paid_in_range + v_paid_in_range;
    v_total_payback_cap := v_total_payback_cap + v_loan.payback_cap;
    v_total_loan_qualifying_count := v_total_loan_qualifying_count + v_loan_qualifying_count;

    IF v_loan.status = 'active' THEN
      v_active_repayment_rate := v_loan.repayment_rate;
    END IF;
  END LOOP;

  IF v_loan_count = 0 THEN
    RETURN jsonb_build_object(
      'gross_revenue_since_start', 0,
      'paid_to_date', 0,
      'remaining_balance', 0,
      'paid_in_range', 0,
      'repayment_rate', 0,
      'payback_cap', 0,
      'loan_qualifying_sales_count_in_range', 0,
      'loan_count', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'gross_revenue_since_start', 0,
    'paid_to_date', v_total_paid_to_date,
    'remaining_balance', v_total_remaining,
    'paid_in_range', v_total_paid_in_range,
    'repayment_rate', v_active_repayment_rate,
    'payback_cap', v_total_payback_cap,
    'loan_qualifying_sales_count_in_range', v_total_loan_qualifying_count,
    'loan_count', v_loan_count
  );
END;
$function$;

-- Step 7: Update get_sales_counts to use status instead of is_active
CREATE OR REPLACE FUNCTION public.get_sales_counts(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT * INTO v_loan FROM shopify_capital_loans WHERE status = 'active' LIMIT 1;

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
$function$;
