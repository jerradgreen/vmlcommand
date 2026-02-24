
-- bills table
CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'manual',
  external_id text,
  date date NOT NULL,
  vendor text NOT NULL,
  category text NOT NULL DEFAULT 'overhead',
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  due_date date,
  notes text,
  raw_payload jsonb,
  ingested_at timestamptz DEFAULT now()
);

ALTER TABLE public.bills
  ADD CONSTRAINT bills_source_external_unique UNIQUE (source_system, external_id);

CREATE INDEX idx_bills_date ON public.bills(date);
CREATE INDEX idx_bills_due_date ON public.bills(due_date);
CREATE INDEX idx_bills_status ON public.bills(status);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to bills"
  ON public.bills FOR ALL USING (true) WITH CHECK (true);

-- cogs_payments table
CREATE TABLE public.cogs_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'manual',
  external_id text,
  date date NOT NULL,
  vendor text NOT NULL DEFAULT 'manufacturer',
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  order_id text,
  category text NOT NULL DEFAULT 'cogs',
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  due_date date,
  notes text,
  raw_payload jsonb,
  ingested_at timestamptz DEFAULT now()
);

ALTER TABLE public.cogs_payments
  ADD CONSTRAINT cogs_source_external_unique UNIQUE (source_system, external_id);

CREATE INDEX idx_cogs_date ON public.cogs_payments(date);
CREATE INDEX idx_cogs_due_date ON public.cogs_payments(due_date);
CREATE INDEX idx_cogs_status ON public.cogs_payments(status);

ALTER TABLE public.cogs_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to cogs_payments"
  ON public.cogs_payments FOR ALL USING (true) WITH CHECK (true);
