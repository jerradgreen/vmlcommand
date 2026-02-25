

# Fix Pack Implementation Plan (Updated with DB-Side Aggregation)

## Key Change: Server-Side Aggregation via RPC

Instead of pulling all `financial_transactions` rows to the client and summing in JS, we will create a single database function `get_cost_rollups(p_from date, p_to date)` that returns `cogs_total`, `ads_spend_total`, and `overhead_total` as pre-computed aggregates. This eliminates the row-count limit problem and reduces network payload.

---

## Database Migration

### 1. New RPC: `get_cost_rollups`

```sql
CREATE OR REPLACE FUNCTION public.get_cost_rollups(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cogs numeric;
  v_ads numeric;
  v_overhead numeric;
BEGIN
  -- NOTE: txn_category='transfer' is NOT an expense and must be excluded from expense totals.
  -- All cost rollups enforce: txn_type='business', txn_category IS NOT NULL, txn_category != 'transfer'

  SELECT coalesce(sum(abs(amount)), 0) INTO v_cogs
  FROM financial_transactions
  WHERE txn_type = 'business'
    AND txn_category IS NOT NULL
    AND txn_category != 'transfer'
    AND txn_category IN ('cogs','shipping_cogs','merchant_fees','packaging')
    AND txn_date >= p_from AND txn_date <= p_to;

  SELECT coalesce(sum(abs(amount)), 0) INTO v_ads
  FROM financial_transactions
  WHERE txn_type = 'business'
    AND txn_category IS NOT NULL
    AND txn_category != 'transfer'
    AND txn_category IN ('advertising_media')
    AND txn_date >= p_from AND txn_date <= p_to;

  SELECT coalesce(sum(abs(amount)), 0) INTO v_overhead
  FROM financial_transactions
  WHERE txn_type = 'business'
    AND txn_category IS NOT NULL
    AND txn_category != 'transfer'
    AND txn_category IN ('software','subscriptions','contractor_payments','office_expense',
      'rent','utilities','insurance','equipment','creative_services','seo',
      'advertising_tools','education','taxes','bank_fees','interest')
    AND txn_date >= p_from AND txn_date <= p_to;

  RETURN jsonb_build_object(
    'cogs_total', v_cogs,
    'ads_spend_total', v_ads,
    'overhead_total', v_overhead
  );
END;
$$;
```

### 2. Add `txn_subcategory` columns + update `apply_transaction_rules`

```sql
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS txn_subcategory text;
ALTER TABLE transaction_rules ADD COLUMN IF NOT EXISTS assign_subcategory text;
CREATE INDEX IF NOT EXISTS idx_ft_txn_subcategory ON financial_transactions(txn_subcategory);
```

Update `apply_transaction_rules` to set `txn_subcategory = coalesce(v_rule.assign_subcategory, txn_subcategory)` when a rule matches.

---

## Files Changed

### 1. `src/lib/categoryTaxonomy.ts` — NEW
Exports:
- `COGS_PARENT_CATS`, `ADS_PARENT_CATS`, `OVERHEAD_PARENT_CATS` arrays
- `BUSINESS_CATEGORIES` and `PERSONAL_CATEGORIES` maps (parent → subcategories[])
- `getSubcategories(parent)` helper
- `getAllParentCategories()` helper

### 2. `src/hooks/useDashboardMetrics.ts` — REWRITE cost section
- Replace all `bills`, `cogs_payments`, `expenses` queries with a single `supabase.rpc("get_cost_rollups", { p_from: rangeFrom, p_to: rangeTo })` call
- Extract `cogsTotal`, `adsSpendTotal`, `overheadTotal` from the RPC response (already positive via `abs()` in SQL)
- Compute derived: `totalOperatingCost = cogsTotal + adsSpendTotal + overheadTotal`
- `netProfitProxy = rangeRevenue - totalOperatingCost`
- `profitMarginPct = rangeRevenue > 0 ? netProfitProxy / rangeRevenue : 0`
- Keep legacy table queries as fallback: if RPC returns all zeros AND legacy has data, use legacy sums
- Fix `rangeTo` default: use `format(now, "yyyy-MM-dd")` instead of `mtdTo` (they're the same value but semantically clearer)
- Return renamed fields: `cogsTotal`, `adsSpendTotal`, `overheadTotal`, `totalOperatingCost`, `netProfitProxy`, `profitMarginPct`
- Keep `yesterdayAdSpend` from `expenses` table (ad-specific, no change)
- Keep `next7BillsDue` / `next7CogsDue` from legacy tables (future-dated, not in financial_transactions)

### 3. `src/pages/Dashboard.tsx` — Update metric references
- Update the default `m` object to use new field names
- Replace derived calculations with direct fields from metrics (e.g., `m.totalOperatingCost` instead of computing inline)
- Update `ProfitDetailDialog` props: `mtdCogsPaid` → `m.cogsTotal`, `mtdBillsPaid` → `m.overheadTotal`, `mtdAdSpend` → `m.adsSpendTotal`
- Update category filter dropdown in transactions section to use taxonomy

### 4. `src/components/ProfitDetailDialog.tsx` — Update prop names
- Rename props to `cogsTotal`, `adsSpendTotal`, `overheadTotal` to match new naming

### 5. `src/components/TransactionEditSheet.tsx` — Cascading category selects
- Import taxonomy from `categoryTaxonomy.ts`
- Add `txnSubcategory` state
- Replace flat 5-option category `<Select>` with parent category select (filtered by txnType) + optional subcategory select
- Save includes `txn_subcategory`
- Prefill for rule creation includes `assign_subcategory`

### 6. `src/components/RuleFormDialog.tsx` — Cascading category selects
- Import taxonomy
- Add `assignSubcategory` state
- Replace flat category select with cascading parent + subcategory
- Save payload includes `assign_subcategory`

### 7. `src/pages/Transactions.tsx` — Updated category filter
- Replace hardcoded 4-option category filter with all parent categories from taxonomy

---

## Guardrails Confirmed

All cost rollups in the RPC enforce:
- `txn_type = 'business'`
- `txn_category IS NOT NULL`
- `txn_category != 'transfer'`
- Results are `abs(sum(amount))` — always positive for display
- Safe division: all ratios return 0 when revenue is 0
- "All Time" defaults `rangeFrom` to `'2000-01-01'`
- Code comments document transfer exclusion

