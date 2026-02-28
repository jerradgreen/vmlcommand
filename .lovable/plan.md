

## Answers to Your Two Questions

### 1) Adjusted (Accrual) View removal — Already done ✅

The separate "Adjusted (Accrual) View" section was already removed in a prior edit. The current `Dashboard.tsx` (lines 295-303) shows a single "Cost Structure (Leak Detection)" section that already uses:
- `adjustedCogsTotal` with "Cash $X + Accrued $Y" subtitle
- `adjustedCogsPct` for COGS %
- `adjustedTotalOperatingCost` for Total Operating Cost

No further work needed here.

### 2) Projections / Scenario Sandbox — Not in scope

There is no Projections or Scenario Sandbox workstream anywhere in the current codebase or plan. It is **not** part of the current implementation scope (multi-loan Shopify Capital + standardized drilldowns).

If you want it, it would need a separate phase/plan. That workstream would involve building a what-if simulator where you adjust inputs (ad spend, close rate, AOV, closer cost/commission) and see projected revenue, profit, and margins. Happy to plan that once the current work is shipped.

