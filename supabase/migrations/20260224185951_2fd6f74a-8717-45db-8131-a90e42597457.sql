
-- Create financial_accounts table
CREATE TABLE public.financial_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_system text NOT NULL DEFAULT 'fintable',
  account_id text NOT NULL,
  account_name text,
  institution text,
  balance numeric(12,2),
  currency text,
  last_update timestamptz,
  raw_payload jsonb,
  ingested_at timestamptz DEFAULT now(),
  UNIQUE (source_system, account_id)
);

CREATE INDEX idx_financial_accounts_account_name ON public.financial_accounts (account_name);
CREATE INDEX idx_financial_accounts_institution ON public.financial_accounts (institution);

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to financial_accounts"
  ON public.financial_accounts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create financial_transactions table
CREATE TABLE public.financial_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_system text NOT NULL DEFAULT 'fintable',
  external_id text NOT NULL,
  txn_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  description text,
  category text,
  account_name text,
  account_id text,
  raw_payload jsonb,
  ingested_at timestamptz DEFAULT now(),
  UNIQUE (source_system, external_id)
);

CREATE INDEX idx_financial_transactions_txn_date ON public.financial_transactions (txn_date);
CREATE INDEX idx_financial_transactions_account_name ON public.financial_transactions (account_name);
CREATE INDEX idx_financial_transactions_category ON public.financial_transactions (category);

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to financial_transactions"
  ON public.financial_transactions
  FOR ALL
  USING (true)
  WITH CHECK (true);
