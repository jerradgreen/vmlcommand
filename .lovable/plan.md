

## Add Lead Funnel KPIs: Cost Per Lead & Revenue Per Lead

### 3 files changed — additive only, no existing logic modified

### 1. `src/pages/MorningBrief.tsx` (lines 74-89)
Add two computed metrics to `reportMetrics`:
```
costPerLead = totalLeads > 0 ? adsSpendTotal / totalLeads : null
revenuePerLead = totalLeads > 0 ? (newLeadSalesCount * avgOrderValue) / totalLeads : null
```

### 2. `src/components/ReportGenerator.tsx` (lines 103-120)
Insert two rows into the KPI table after "New-Lead Close Rate" and before "Cost Per New-Lead Sale":
- `["Cost Per Lead", m.costPerLead != null ? formatCurrency(m.costPerLead) : "N/A"]`
- `["Revenue Per Lead (New Leads)", m.revenuePerLead != null ? formatCurrency(m.revenuePerLead) : "N/A"]`

Final KPI order:
1. Sales Revenue (30d)
2. Bank Deposits (Cash)
3. Total Sales
4. New-Lead Sales
5. Avg Order Value
6. ROAS
7. New-Lead Close Rate
8. **Cost Per Lead** ← new
9. **Revenue Per Lead (New Leads)** ← new
10. Cost Per New-Lead Sale
11. COGS (Actual + Estimated)
12. Gross Profit (30d)
13. Gross Margin
14. Ad Spend
15. Overhead
16. Shopify Capital Paid
17. Net Profit
18. Net Margin
19. Cash in Bank
20. Net Cash Position

### 3. `supabase/functions/generate-report/index.ts` (lines 45-56)
Add to SALES & MARKETING section of the prompt:
```
- Cost Per Lead: $${metrics.costPerLead ?? "N/A"}
- Revenue Per Lead (New Leads): $${metrics.revenuePerLead ?? "N/A"}
```
Add note to system message: "Cost Per Lead and Revenue Per Lead are lead funnel efficiency metrics measuring ad spend efficiency and revenue yield per Cognito form submission."

