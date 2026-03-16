

## Fix: Add Sales-Based Profit Waterfall to `useDashboardMetrics`

### Clarification Confirmed

`adjustedCogsTotal` (line 268) = `cogsTotal` (cash bank transactions) + `accruedMfgRemaining` — this is the **old cash-mixed** COGS field.

`briefCogs` must be = `allocatedMfgTotal` + `accruedMfgRemaining` — the **sales-based** COGS per established logic. These are **not identical**.

### Change: `src/hooks/useDashboardMetrics.ts`

**Add after line 288** (after run-rate calculations, before the return object):

```typescript
// Sales-based profit waterfall (briefCogs = actual allocated + estimated accrued)
const briefCogs = allocatedMfgTotal + accruedMfgRemaining;
const salesRevenue = rangeRevenue;
const grossProfit = salesRevenue - briefCogs;
const grossMargin = salesRevenue > 0 ? grossProfit / salesRevenue : 0;
const cogsPct = salesRevenue > 0 ? briefCogs / salesRevenue : 0;
const netProfit = grossProfit - adsSpendTotal - overheadTotal - shopifyCapitalPaidInRange;
const netMargin = salesRevenue > 0 ? netProfit / salesRevenue : 0;
```

**Add to the return object** (after line 350): `briefCogs`, `salesRevenue`, `grossProfit`, `grossMargin`, `cogsPct`, `netProfit`, `netMargin`.

### What This Does

- `briefCogs` is explicitly `allocatedMfgTotal + accruedMfgRemaining` — no aliasing to `adjustedCogsTotal`
- COGS subtracted exactly once
- Full waterfall: Revenue → Gross Profit → Net Profit (after Ads, Overhead, Capital)
- The old `adjusted*` fields remain untouched for any legacy consumers
- `ReportGenerator` and edge function already read `grossProfit`, `netProfit`, `briefCogs`, `cogsPct`, `grossMargin`, `netMargin` — all will now be populated from the hook

### No other file changes needed

The Morning Brief's inline computation (in `MorningBrief.tsx`) becomes redundant but harmless since its spread is overwritten. No UI changes.

