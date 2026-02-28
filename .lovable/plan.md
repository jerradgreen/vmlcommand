

## Shopify Capital Loan Tracking — Implementation

### Task 1: Database Migration

Single migration creating:

1. **`shopify_capital_loans` table** with RLS, seeded with one row
2. **Partial unique index** `one_active_shopify_capital_loan ON (id) WHERE is_active = true`
3. **Performance indexes** on `sales(order_id)` and `sales(date)`
4. **RPC `get_shopify_capital_summary(p_from date, p_to date)`** — cast-safe parsing, cumulative-capped paid_in_range logic, returns jsonb with 6 fields

### Task 2: Update `src/hooks/useDashboardMetrics.ts`

- Add `supabase.rpc('get_shopify_capital_summary', { p_from: rangeFrom, p_to: rangeTo })` as a new entry in the existing `Promise.all` (line 94–117)
- Extract `shopifyCapitalRemaining`, `shopifyCapitalPaid`, `shopifyCapitalPaidInRange` from result
- Update line 176: `totalOperatingCost = cogsTotal + adsSpendTotal + overheadTotal + shopifyCapitalPaidInRange`
- Recalculate `netProfitProxy`, `profitMarginPct` using updated `totalOperatingCost`
- Add `loanPaybackPerSale = rangeSalesCount > 0 ? shopifyCapitalPaidInRange / rangeSalesCount : 0`
- Update `profitPerSale` to subtract `loanPaybackPerSale`
- Return all new fields

### Task 3: Update `src/pages/Dashboard.tsx`

- Add defaults to fallback metrics object (line 180–184): `shopifyCapitalRemaining: 0, shopifyCapitalPaid: 0, shopifyCapitalPaidInRange: 0, loanPaybackPerSale: 0`
- New **"Shopify Capital"** section between Cost Structure and Unit Economics:
  - 3 cards in a `grid md:grid-cols-3`:
    - "Shopify Capital Remaining" — `Landmark` icon
    - "Shopify Capital Paid To Date" — `DollarSign` icon
    - "Shopify Capital Paid (This Period)" — `CalendarIcon` icon
  - Subtitle: `"13% of Shopify revenue from #VML18412 forward (auto-stops at $0)"`
- Unit Economics section: add "Loan Payback / Sale" `MetricCard` showing `formatCurrency(m.loanPaybackPerSale)`
- Update Net Profit subtitle from `"Revenue − Ads − COGS − Overhead"` to `"Revenue − Ads − COGS − Overhead − Loan"`

### Task 4: Update `src/integrations/supabase/types.ts`

This file auto-updates after migration. The new RPC signature will be:
```
get_shopify_capital_summary: { Args: { p_from: string; p_to: string }; Returns: Json }
```

### Validation

After deployment, run:
```sql
SELECT * FROM get_shopify_capital_summary('2025-01-01'::date, current_date);
```

