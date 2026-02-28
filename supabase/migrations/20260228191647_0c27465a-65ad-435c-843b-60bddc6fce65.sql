ALTER TABLE public.financial_transactions 
  ADD COLUMN is_recurring boolean NOT NULL DEFAULT true;