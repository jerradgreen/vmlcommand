ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_match_method_check;

ALTER TABLE public.sales ADD CONSTRAINT sales_match_method_check CHECK (match_method IN ('email_exact', 'smart_suggested', 'manual'));