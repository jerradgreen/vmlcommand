

## Fix PDF Report & Morning Brief — Consistent Revenue Basis for Profitability

### Root Problem

`briefCogs30d` is scoped to **sales in the 30d window** (allocated + estimated mfg cost per sale), but profitability currently divides it by `depositRevenue` (cash collected in the 30d window). These are different timing bases — a sale booked today may not produce a deposit for weeks. This distorts COGS %, Gross Profit, and margins.

### Fix: Use Sales-Based Revenue for Profitability

The field `rangeRevenue` already exists — it's `SUM(revenue)` from the `sales` table for the reporting window. This is the correct match for `briefCogs` since both are scoped to the same sales.

**New profitability formulas (all three windows):**

```
salesRevenue30d  = m30d.rangeRevenue    // booked sales revenue
briefCogs30d     = m30d.allocatedMfgTotal + m30d.accruedMfgRemaining
grossProfit30d   = salesRevenue30d - briefCogs30d
grossMargin30d   = grossProfit30d / salesRevenue30d
cogsPct30d       = briefCogs30d / salesRevenue30d
netProfit30d     = grossProfit30d - adsSpendTotal - overheadTotal - shopifyCapitalPaidInRange
netMargin30d     = netProfit30d / salesRevenue30d
```

Same pattern for 12m and MTD windows.

`depositRevenue` remains used **only** for cash-based metrics: Cash in Bank, Net Cash Position, ROAS, Manufacturing Coverage Ratio — all clearly labeled as cash metrics.

### Changes

#### 1. `src/components/CeoMorningBrief.tsx`

- **Lines 119-128**: Replace `m.depositRevenue` with `m.rangeRevenue` (and equivalents for 12m/MTD) in all profitability calculations
- Update `Metrics` interface to include `rangeRevenue`, `shopifyCapitalPaidInRange`
- Rename/re-label: `grossMargin30d` stays as gross margin; add `netMargin30d` as true net margin
- Include `shopifyCapitalPaidInRange` in net profit calculation
- Profitability section labels: "Sales Revenue (30d)" not "Deposits"
- Keep `depositRevenue` for: ROAS, Mfg Coverage Ratio, Cash Forecast — labeled as "Cash" metrics

#### 2. `src/pages/MorningBrief.tsx`

- Compute corrected report metrics before passing to `ReportGenerator`:
  ```
  salesRevenue = m30d.rangeRevenue
  briefCogs = allocatedMfgTotal + accruedMfgRemaining
  grossProfit = salesRevenue - briefCogs
  grossMargin = grossProfit / salesRevenue
  netProfit = grossProfit - ads - overhead - shopifyCapitalPaidInRange
  netMargin = netProfit / salesRevenue
  closeRate = newLeadSalesCount / totalLeads  (labeled "New-Lead Close Rate")
  ```
- Pass these as overrides in `reportMetrics` object to `ReportGenerator`

#### 3. `src/components/ReportGenerator.tsx`

- **KPI table**:
  - "Sales Revenue (30d)" using `m.salesRevenue` — replaces "Revenue (Bank Deposits)"
  - "Bank Deposits (Cash)" as separate cash line using `m.depositRevenue`
  - "COGS (Actual + Estimated)" using `m.briefCogs`
  - "Gross Margin" using `m.grossMargin` (not "Profit Margin")
  - "Net Profit" using `m.netProfit` (after ads + overhead + loan remittance)
  - "Net Margin" using `m.netMargin`
  - "New-Lead Close Rate" — labeled explicitly, uses `m.closeRate`
  - "New-Lead Sales" shown alongside close rate so the math reconciles
- **Cost breakdown bar**: Use `m.salesRevenue` as the 100% base, `m.briefCogs` for COGS segment
- Include Shopify Capital paid in the cost bar or net profit line

#### 4. `supabase/functions/generate-report/index.ts`

- Replace all `adjustedCogsTotal` / `adjustedCogsPct` references with `briefCogs` / `cogsPct`
- Replace `depositRevenue` in profitability lines with `salesRevenue`
- Keep `depositRevenue` labeled as "Bank Deposits (Cash)" — separate from profitability
- Add `New-Lead Sales: ${metrics.newLeadSalesCount}` line so close rate reconciles
- Rename close rate line to "New-Lead Close Rate"
- Add `Shopify Capital Paid: $${metrics.shopifyCapitalPaidInRange}` to the prompt
- Add note: "COGS and profitability metrics are based on booked sales revenue, not cash deposits. Cash metrics are shown separately."

### Summary of Label Corrections

| Old Label | New Label |
|-----------|-----------|
| Revenue (Bank Deposits) — used for profit | Sales Revenue (30d) |
| Adjusted COGS | COGS (Actual + Estimated) |
| Profit Margin | Gross Margin |
| (missing) | Net Margin |
| Close Rate | New-Lead Close Rate |
| (missing) | New-Lead Sales |
| (missing) | Shopify Capital Paid (in net profit) |

### Files Modified

| File | Changes |
|------|---------|
| `src/components/CeoMorningBrief.tsx` | Switch profitability from `depositRevenue` to `rangeRevenue`, add loan remittance to net profit, fix labels |
| `src/pages/MorningBrief.tsx` | Compute corrected report metrics with sales-based revenue, pass to ReportGenerator |
| `src/components/ReportGenerator.tsx` | Update KPI table, cost bar, and labels to use corrected metrics |
| `supabase/functions/generate-report/index.ts` | Update AI prompt with corrected metric names and sales-based profitability |

