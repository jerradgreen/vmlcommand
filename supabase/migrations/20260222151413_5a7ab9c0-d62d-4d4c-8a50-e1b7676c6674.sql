
-- =============================================
-- VML Command Center — Phase 1 Database Schema
-- =============================================

-- Leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE,
  cognito_form TEXT NOT NULL,
  cognito_entry_number TEXT NOT NULL,
  submitted_at TIMESTAMPTZ,
  status TEXT,
  name TEXT,
  email TEXT,
  email_norm TEXT GENERATED ALWAYS AS (lower(trim(email))) STORED,
  phone TEXT,
  phrase TEXT,
  sign_style TEXT,
  size_text TEXT,
  budget_text TEXT,
  notes TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leads indexes
CREATE INDEX idx_leads_submitted_at ON public.leads (submitted_at);
CREATE INDEX idx_leads_email_norm ON public.leads (email_norm);

-- Sales table
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  date DATE,
  email TEXT,
  email_norm TEXT GENERATED ALWAYS AS (lower(trim(email))) STORED,
  product_name TEXT,
  revenue NUMERIC,
  lead_id UUID REFERENCES public.leads(id),
  match_confidence INTEGER,
  match_method TEXT CHECK (match_method IN ('email_exact', 'phrase_suggested', 'manual')),
  match_reason TEXT,
  sale_type TEXT NOT NULL DEFAULT 'unknown' CHECK (sale_type IN ('new_lead', 'repeat_direct', 'unknown')),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales indexes
CREATE INDEX idx_sales_date ON public.sales (date);
CREATE INDEX idx_sales_email_norm ON public.sales (email_norm);
CREATE INDEX idx_sales_lead_id ON public.sales (lead_id);

-- Enable RLS (tables are accessible without auth for this CEO dashboard — single-user app)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single-user CEO dashboard, no auth in Phase 1)
CREATE POLICY "Allow all access to leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);
