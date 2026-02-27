
-- Create account_balances table
CREATE TABLE public.account_balances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_system text NOT NULL DEFAULT 'fintable',
  external_account_id text NOT NULL,
  account_name text NOT NULL,
  institution text,
  account_type text NOT NULL CHECK (account_type IN ('bank', 'credit_card')),
  balance numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_account_id, source_system)
);

-- Indexes
CREATE INDEX idx_account_balances_account_type ON public.account_balances (account_type);
CREATE INDEX idx_account_balances_updated_at ON public.account_balances (updated_at);

-- Enable RLS
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;

-- Allow all access (matches existing pattern)
CREATE POLICY "Allow all access to account_balances"
  ON public.account_balances
  FOR ALL
  USING (true)
  WITH CHECK (true);
