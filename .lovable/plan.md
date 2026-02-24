

# Updated Plan: Dashboard Date-Range Fix + Fintable Ingestion (with 3 Patches)

## Overview

Implements the previously approved plan with three patches applied: credit card display logic, date normalization in edge functions, and raw_payload fallback handling.

---

## Part A -- Fix "All Time" Date Range

**`src/hooks/useDashboardMetrics.ts`** (line 69)

Change fallback from MTD to `"2000-01-01"`:
```text
Before: const rangeFrom = from ? format(from, "yyyy-MM-dd") : mtdFrom;
After:  const rangeFrom = from ? format(from, "yyyy-MM-dd") : "2000-01-01";
```

Also fix `rangeDateFrom` default case in `Dashboard.tsx` (line 203) to `"2000-01-01"`.

---

## Part B -- Database Migration

Create two tables: `financial_accounts` and `financial_transactions` with the schema from the approved plan (UUIDs, unique constraints, indexes, open RLS policies).

---

## Part C -- Edge Functions (with all 3 patches applied)

### `supabase/functions/ingest-account/index.ts`

- CORS + OPTIONS, x-api-key validation
- Require `account_id` and `balance`
- **Patch 2 (date normalization)**: If `last_update` is provided and matches `MM/DD/YYYY`, convert to ISO before insert
- **Patch 3 (raw_payload)**: If `body.raw_payload` exists, store it; else store entire `body` as `raw_payload`
- Upsert on `(source_system, account_id)`

### `supabase/functions/ingest-transaction/index.ts`

- CORS + OPTIONS, x-api-key validation
- Require `txn_date`, `amount`, `description`
- **Patch 2 (date normalization)**: Accept `txn_date` in `YYYY-MM-DD` or `MM/DD/YYYY`; normalize to `YYYY-MM-DD`
- **Patch 3 (raw_payload)**: If `body.raw_payload` exists, use it; else store entire `body` as `raw_payload`
- **Improved external_id** (from previous approval): check raw_payload for stable ID keys (`id`, `transaction_id`, `txn_id`, `entry_id`, `plaid_transaction_id`); fallback to enriched SHA-256 hash including `account_id`, `pending`, `posted_at`
- Upsert on `(source_system, external_id)`; return `{ ok: true, duplicate: true }` on 23505

### `supabase/config.toml`

Add both functions with `verify_jwt = false`.

---

## Part D -- Settings Page

Add two new `EndpointCard` entries for "Ingest Account" and "Ingest Transaction" with sample payloads.

---

## Part E -- Cash Metrics Hook (with Patch 1)

### `src/hooks/useCashMetrics.ts` (new file)

Account classification via regex:
```text
const CREDIT_PATTERN = /card|visa|mastercard|discover|amex/i;
```

Returns:
- `cashInBank` -- sum of balances for "bank" classified accounts
- `cardsTotalRaw` -- sum of balances for "credit" classified accounts (stored as-is, typically negative)
- `cardsOwedDisplay` -- `Math.abs(cardsTotalRaw)` (always positive for display)
- `netCashPosition` -- `cashInBank + cardsTotalRaw` (signed math)
- `totalInflow` -- sum of positive transaction amounts in selected date range
- `totalOutflow` -- `Math.abs(sum of negative transaction amounts)` in selected date range
- `isLoading`

Balances ignore date picker; transactions respect it.

---

## Part F -- Dashboard Cash & Survival Cards (with Patch 1)

Add 5 cards to Cash & Survival section:

1. **Cash in Bank** -- displays `cashInBank` (always current)
2. **Credit Cards Owed** -- displays `cardsOwedDisplay` (positive number)
3. **Net Cash Position** -- displays `netCashPosition` (uses signed math: `cashInBank + cardsTotalRaw`)
4. **Total Inflow** -- respects date picker
5. **Total Outflow** -- respects date picker

All show "--" when no financial data exists.

---

## Date Normalization Helper (shared by both edge functions)

```text
function normalizeDate(raw: string): string | null {
  // Try MM/DD/YYYY
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, mm, dd, yyyy] = mdyMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}
```

---

## File Summary

| File | Action |
|------|--------|
| `src/hooks/useDashboardMetrics.ts` | Fix All Time rangeFrom to "2000-01-01" |
| `src/pages/Dashboard.tsx` | Fix rangeDateFrom default; add 5 cash cards |
| `src/hooks/useCashMetrics.ts` | New hook with account classification + Patch 1 display logic |
| `src/pages/Settings.tsx` | Add 2 endpoint cards |
| `supabase/functions/ingest-account/index.ts` | New edge function with Patches 2+3 |
| `supabase/functions/ingest-transaction/index.ts` | New edge function with improved dedup + Patches 2+3 |
| `supabase/config.toml` | Add verify_jwt=false for both new functions |
| Database migration | Create financial_accounts + financial_transactions tables |

