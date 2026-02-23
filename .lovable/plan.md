

# Add Expenses Ingestion System for Ad Spend Tracking

## Step 1: Database Migration -- Create `expenses` table

Create the `expenses` table with the specified schema, unique constraint, indexes, platform validation trigger, and open RLS policy.

```sql
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
```

## Step 2: Edge Function -- `supabase/functions/ingest-expense/index.ts`

New file following the ingest-sale pattern:

- CORS + OPTIONS handler
- `x-api-key` validation against `INGEST_API_KEY`
- Parse JSON, validate required fields: `date`, `platform`, `amount`
- Normalize platform input: lowercase, trim, replace spaces/hyphens with underscores, then map common variants (google/googleads/adwords -> google_ads, meta/facebook/instagram -> meta_ads, bing/microsoft_ads/microsoftads -> bing_ads, else -> other)
- Auto-generate `external_id` if missing using a stable hash of `date|platform|amount|notes`
- Set `source_system = 'api'`
- Upsert on `(source_system, external_id)`
- Duplicate key (23505) returns `{ ok: true, duplicate: true }` (never fails Zapier)
- No ingestion_logs writes (skip logging)
- Return `{ ok: true, external_id, platform }`

## Step 3: Update `useDashboardMetrics.ts`

Add expenses query inside `useDashboardMetrics`:

- Query `expenses` table where `category = 'ads'` for today and MTD ranges (always computed regardless of selected date filter)
- Also query MTD sales revenue
- Return 5 new fields: `todayAdSpend`, `mtdAdSpend`, `mtdRevenue`, `mtdRoas` (safe divide, 0 if no spend), `netAfterAds`

## Step 4: Update `Dashboard.tsx`

Add a new section below existing metric cards with heading "Ad Spend (MTD)" containing 5 cards:

| Card | Value | Icon |
|------|-------|------|
| Today Ad Spend | formatCurrency | DollarSign |
| MTD Ad Spend | formatCurrency | DollarSign |
| MTD Revenue | formatCurrency | DollarSign |
| MTD ROAS | `X.XXx` | TrendingUp |
| Net After Ads | formatCurrency | BarChart3 |

## Step 5: Update `Settings.tsx`

- Add `EXPENSE_URL` constant and `EXPENSE_SAMPLE` JSON
- Add third EndpointCard for "Ingest Expense" in the grid (change to 3-col layout)
- Sample payload includes: `date`, `platform`, `amount`, `external_id` (optional), `notes` (optional)

## Step 6: Deploy and verify

- Deploy `ingest-expense` function
- Test via curl: no key -> 401, valid key -> ok:true, duplicate -> ok:true (not 500)

---

## Files Changed

| File | Action |
|------|--------|
| Database migration | New `expenses` table + indexes + trigger + RLS |
| `supabase/functions/ingest-expense/index.ts` | New edge function |
| `src/hooks/useDashboardMetrics.ts` | Add expenses queries + MTD metrics |
| `src/pages/Dashboard.tsx` | Add 5 ad spend cards section |
| `src/pages/Settings.tsx` | Add expense endpoint card + sample |

