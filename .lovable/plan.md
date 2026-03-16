

## Fix Report Period Logic + KPI Labels

### File: `src/components/ReportGenerator.tsx`

**1. Remove hardcoded "(30d)" from KPI labels** (lines 104, 115)

Since the report header already shows `Period: ${dateLabel}`, simplify the labels:
- `"Sales Revenue (30d)"` → `"Sales Revenue"`
- `"Gross Profit (30d)"` → `"Gross Profit"`

**2. Fix Cost Per New-Lead Sale calculation** (line 113)

Currently reads `m.costPerSale` which may not be set. Add inline calculation:
```typescript
["Cost Per New-Lead Sale", 
  (m.newLeadSalesCount ?? 0) > 0 
    ? formatCurrency(m.adsSpendTotal / m.newLeadSalesCount) 
    : "N/A"],
```

**3. Use passed-through metrics directly** — already correct

The metrics object spread from Dashboard (`{ ...m, costPerLead, revenuePerLead, contributionPerLead }`) already flows into `buildPDF`. The KPI table already reads `m.grossProfit`, `m.netProfit`, `m.costPerLead`, `m.revenuePerLead`, `m.briefCogs`, `m.grossMargin`, `m.netMargin` directly. No recomputation needed — just the label and costPerSale fixes above.

**4. No Morning Brief changes** — Morning Brief is a separate page with its own 30-day logic.

### Summary of line changes in `ReportGenerator.tsx`
- Line 104: Remove `(30d)` suffix
- Line 113: Replace `m.costPerSale` lookup with inline `adsSpendTotal / newLeadSalesCount` calculation
- Line 115: Remove `(30d)` suffix

