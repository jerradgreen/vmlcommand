
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'manual',
  external_id text,
  date date NOT NULL,
  platform text NOT NULL,
  category text NOT NULL DEFAULT 'ads',
  amount numeric(12,2) NOT NULL,
  notes text,
  raw_payload jsonb,
  ingested_at timestamptz DEFAULT now()
);

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_source_external_unique UNIQUE (source_system, external_id);

CREATE INDEX idx_expenses_date ON public.expenses (date);
CREATE INDEX idx_expenses_platform ON public.expenses (platform);

CREATE OR REPLACE FUNCTION public.validate_expense_platform()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.platform NOT IN ('google_ads', 'meta_ads', 'bing_ads', 'other') THEN
    RAISE EXCEPTION 'Invalid platform: %', NEW.platform;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_expense_platform
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.validate_expense_platform();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to expenses"
  ON public.expenses FOR ALL USING (true) WITH CHECK (true);
