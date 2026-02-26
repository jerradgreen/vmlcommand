

## Updated Plan: Add `marketingPctOfRevenue` to Unit Economics

Everything from the previous plan stays the same. Two small additions:

### 1. `src/hooks/useDashboardMetrics.ts`
- After computing `fullyLoadedMarketingCost`, add:
  ```ts
  const marketingPctOfRevenue = rangeRevenue > 0 ? fullyLoadedMarketingCost / rangeRevenue : 0;
  ```
- Return `marketingPctOfRevenue` alongside existing new fields.

### 2. `src/pages/Dashboard.tsx`
- On the "Fully Loaded Marketing / Sale" card, add a secondary line below the value:
  ```
  {formatPercent(m.marketingPctOfRevenue)} of revenue
  ```
  Styled as muted/small text (e.g., `text-xs text-muted-foreground`).

### Files modified
- `src/hooks/useDashboardMetrics.ts` — add `marketingPctOfRevenue` field
- `src/pages/Dashboard.tsx` — show secondary line on marketing card

