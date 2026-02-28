

## Plan: Fix Net Profit per Sale reconciliation

### 1. `src/hooks/useDashboardMetrics.ts` (lines 228-230)
Replace piecemeal calculation with:
```ts
const profitPerSale = rangeSalesCount > 0 ? adjustedNetProfit / rangeSalesCount : 0;
```
Remove `loanPaybackPerSaleAvg` (line 229).

### 2. `src/lib/metricSpecs.ts` (lines 259-269)
Replace `np_per_sale` formula with:
```ts
np_per_sale: {
  title: "Net Profit per Sale",
  formula: [
    { label: "Adjusted Net Profit", valueKey: "adjustedNetProfit", sign: "info" },
    { label: "÷ Sales Count", valueKey: "_totalSales", sign: "info" },
    { label: "Net Profit per Sale", valueKey: "profitPerSale", sign: "=" },
  ],
  mixesDepositsAndSales: true,
},
```

### 3. `src/pages/Dashboard.tsx` (line 285)
Change subtitle from `"Revenue − COGS − marketing − loan (avg)"` to `"Adjusted Net Profit ÷ Sales Count"`.

### 4. `src/components/MetricDrilldownDialog.tsx`
Remove `_loanPerSaleAvg` from `resolveValue` if present, ensure `_totalSales` resolves to `totalSales`.

