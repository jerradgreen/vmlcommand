

## Improve PDF Report Clarity & KPI Display

### 3 files changed — no formula changes, visualization/labeling only

### 1. `src/pages/MorningBrief.tsx`
- Add `costPerSale` to `reportMetrics`: if `newLeadSalesCount > 0`, compute `adsSpendTotal / newLeadSalesCount`; otherwise set to `null`

### 2. `src/components/ReportGenerator.tsx`

**KPI Table** — reorder to this sequence:
1. Sales Revenue (30d)
2. Bank Deposits (Cash)
3. Total Sales
4. New-Lead Sales
5. Avg Order Value
6. ROAS
7. New-Lead Close Rate
8. COGS (Actual + Estimated)
9. **Gross Profit (30d)** ← new row
10. Gross Margin
11. Ad Spend
12. **Cost Per New-Lead Sale** ← new row; display `formatCurrency(m.costPerSale)` if non-null, otherwise `"N/A"`
13. Overhead
14. Shopify Capital Paid
15. Net Profit
16. Net Margin
17. Cash in Bank (if available)
18. Net Cash Position (if available)

**Cost Breakdown Bar** — replace with 5-segment "Profit Breakdown (% of Sales Revenue)":
- Segments: COGS (blue), Ads (red), Overhead (yellow), Shopify Capital (purple), Net Profit (green)
- Each segment pct = `value / salesRevenue`
- Net Profit segment: compute as `1 - (cogsPct + adsPct + ohPct + capPct)`. If negative, **clamp bar width to 0** but **show the true negative percentage in the legend** (e.g. "Net Profit -8%")
- Rename section title: "Profit Breakdown (% of Sales Revenue)"

### 3. `supabase/functions/generate-report/index.ts`

- Add to prompt data: `grossProfit`, `costPerSale` (or "N/A" if null)
- Add system note: "Always refer to individual orders as 'sales' or 'orders', never 'units'."

