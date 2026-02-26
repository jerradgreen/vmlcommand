## Plan: Unit Economics Section (CPO + Profit Per Sale)

### Implemented

1. **DB RPC `get_marketing_rollup(p_from date, p_to date)`** — returns scalar `numeric`.
   - Sums `abs(amount)` from `financial_transactions` where `txn_type='business'` and `txn_category IN ('advertising_media','advertising_tools','contractor_payments','creative_services','seo')`.
   - Null-safe: `coalesce(p_from, '2000-01-01'::date)`, `coalesce(p_to, current_date)`.

2. **`src/hooks/useDashboardMetrics.ts`** — calls RPC, returns:
   - `fullyLoadedMarketingCost`, `fullyLoadedCPO`, `revenuePerSale`, `contributionMarginPerSale`, `profitPerSale`, `marketingPctOfRevenue`
   - All use safe division (0 when no sales or no revenue).

3. **`src/pages/Dashboard.tsx`** — "Unit Economics" section with 4 cards:
   - Fully Loaded Marketing / Sale (CPO) — with `{X}% of revenue` secondary line
   - Revenue / Sale
   - Contribution Margin / Sale
   - Profit / Sale (green/red conditional)

### Future: True CAC
- Requires tracking new customers (first purchase). `fullyLoadedCAC = marketing / newCustomers`.
