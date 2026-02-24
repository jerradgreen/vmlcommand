

# Add Bills/Overhead + COGS/Manufacturer Payments

## Overview

Add two new data tables (bills and cogs_payments), two ingestion endpoints, and new dashboard sections showing overhead costs, COGS, and a profit proxy metric. All metric cards will be clickable with detail dialogs.

---

## Step 1: Database Migration

Create two new tables:

**bills** -- tracks overhead/recurring business expenses
- Fields: id, source_system, external_id, date, vendor, category (default 'overhead'), amount, status (paid/scheduled/due), due_date, notes, raw_payload, ingested_at
- Unique constraint on (source_system, external_id)
- Indexes on date, due_date, status
- Open RLS policy (matches existing pattern)

**cogs_payments** -- tracks manufacturer/production costs
- Fields: id, source_system, external_id, date, vendor (default 'manufacturer'), sale_id (FK to sales), order_id, category (default 'cogs'), amount, status (paid/scheduled/due), due_date, notes, raw_payload, ingested_at
- Unique constraint on (source_system, external_id)
- Indexes on date, due_date, status
- Open RLS policy

---

## Step 2: Edge Functions

### A) `supabase/functions/ingest-bill/index.ts`
- CORS + OPTIONS, x-api-key validation
- Required: date, vendor, amount
- Optional: category, status, due_date, notes, external_id
- Auto-generates external_id via SHA-256 hash if missing
- Upserts on (source_system, external_id), graceful on duplicates

### B) `supabase/functions/ingest-cogs/index.ts`
- Same CORS + API key pattern
- Required: date, amount
- Optional: vendor, sale_id, order_id, category, status, due_date, notes, external_id
- Auto-generates external_id via SHA-256 hash if missing
- Upserts on (source_system, external_id), graceful on duplicates

Both added to config.toml with `verify_jwt = false`.

---

## Step 3: Settings Page

Add two new EndpointCards to `Settings.tsx`:
- **Ingest Bill** with sample payload (date, vendor, amount, status, due_date, notes)
- **Ingest COGS** with sample payload (date, amount, order_id, vendor, category, status, due_date, notes)

Grid changes to accommodate 5 cards (responsive layout).

---

## Step 4: Dashboard Metrics

Update `useDashboardMetrics.ts` to add 6 new queries (all MTD, always computed):

| Metric | Query |
|--------|-------|
| mtdBillsPaid | bills where status='paid', date in MTD range |
| mtdCogsPaid | cogs_payments where status='paid', date in MTD range |
| next7BillsDue | bills where status in ('due','scheduled'), coalesce(due_date,date) between today and today+7 |
| next7CogsDue | cogs_payments where status in ('due','scheduled'), coalesce(due_date,date) between today and today+7 |
| mtdNetAfterAdsAndBills | mtdRevenue - mtdAdSpend - mtdBillsPaid |
| mtdProfitProxy | mtdRevenue - mtdAdSpend - mtdBillsPaid - mtdCogsPaid |

---

## Step 5: Dashboard UI

Add three new sections to `Dashboard.tsx` below Ad Spend:

**Overhead (MTD)**
- MTD Bills Paid (clickable)
- Next 7 Days Bills Due (clickable)

**COGS / Manufacturer (MTD)**
- MTD COGS Paid (clickable)
- Next 7 Days COGS Due (clickable)

**Profit Proxy (MTD)**
- Net After Ads & Bills (clickable)
- Profit Proxy (clickable -- shows full breakdown: Revenue, Ads, Bills, COGS)

---

## Step 6: Detail Dialogs

Create two new detail dialog components (or extend existing pattern):

**BillsDetailDialog** -- shows table of bills for the selected metric (MTD paid or next 7 due), columns: Date, Vendor, Category, Amount, Status, Due Date, Notes

**CogsDetailDialog** -- shows table of COGS payments for selected metric, columns: Date, Vendor, Order ID, Category, Amount, Status, Due Date, Notes

**ProfitDetailDialog** -- shows summary breakdown (Revenue - Ads - Bills - COGS = Profit Proxy) with links to each sub-total

---

## Step 7: Deploy and Verify

Deploy both `ingest-bill` and `ingest-cogs` edge functions. Test authentication (401 without key, ok with key, duplicates handled gracefully).

---

## Files Changed

| File | Action |
|------|--------|
| Database migration | New bills + cogs_payments tables |
| `supabase/functions/ingest-bill/index.ts` | New |
| `supabase/functions/ingest-cogs/index.ts` | New |
| `supabase/config.toml` | Add function configs (auto-managed) |
| `src/hooks/useDashboardMetrics.ts` | Add 6 new metrics |
| `src/pages/Dashboard.tsx` | Add 3 new sections with 6 cards |
| `src/pages/Settings.tsx` | Add 2 endpoint cards |
| `src/components/BillsDetailDialog.tsx` | New |
| `src/components/CogsDetailDialog.tsx` | New |
| `src/components/ProfitDetailDialog.tsx` | New |

