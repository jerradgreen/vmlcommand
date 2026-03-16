

## Fix: Pass Derived Metrics to Report Generator

### Root Cause
**Line 242** passes raw `m` to `ReportGenerator` — but `costPerLead`, `revenuePerLead`, and `contributionPerLead` are computed inside a JSX IIFE (lines 266-271), completely isolated from the report data flow. The hook returns `grossProfit`, `netProfit`, etc., but they flow through `m` which may have type issues with `(m as any)`.

### Changes — `src/pages/Dashboard.tsx` only

**1. Hoist derived metrics** — Move the three lead funnel calculations from the IIFE (lines 266-271) up to ~line 193, alongside `adSpendPctOfRevenue`:

```typescript
const costPerLead = m.totalLeads > 0 ? m.adsSpendTotal / m.totalLeads : null;
const revenuePerLead = m.totalLeads > 0 ? (m.newLeadSalesCount * m.avgOrderValue) / m.totalLeads : null;
const contributionPerLead = m.totalLeads > 0 && (m as any).cogsPct != null
  ? (((m.newLeadSalesCount * m.avgOrderValue) / m.totalLeads) * (1 - (m as any).cogsPct) - (m.adsSpendTotal / m.totalLeads))
  : null;
```

**2. Enrich ReportGenerator props** — Line 242, change:
```tsx
<ReportGenerator metrics={m} ...
```
to:
```tsx
<ReportGenerator metrics={{ ...m, costPerLead, revenuePerLead, contributionPerLead }} ...
```

This ensures all derived fields (`costPerLead`, `revenuePerLead`, `contributionPerLead`) plus the hook-provided fields (`grossProfit`, `netProfit`, `briefCogs`, `cogsPct`, `grossMargin`, `netMargin`, `salesRevenue`) all flow into the report payload.

**3. Simplify IIFE** — Replace the IIFE block (lines 266-279) to reference the hoisted variables directly instead of recomputing.

### No changes needed elsewhere
- `ReportGenerator.tsx` already spreads `...metrics` into the payload — all fields pass through.
- The edge function prompt already references `grossProfit`, `netProfit`, `costPerLead`, `revenuePerLead`, `briefCogs`, etc. by name.
- The KPI table in `buildPDF` already reads `m.grossProfit`, `m.netProfit`, `m.costPerLead`, `m.revenuePerLead` — they just weren't populated before.

