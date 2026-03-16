

## Add Lead Funnel Metrics to Dashboard

### File: `src/pages/Dashboard.tsx`

**1. Compute derived metrics** (after existing derived vars ~line 194):

```typescript
const costPerLead = m.totalLeads > 0 ? m.adsSpendTotal / m.totalLeads : null;
const revenuePerLead = m.totalLeads > 0 ? (m.newLeadSalesCount * m.avgOrderValue) / m.totalLeads : null;
const contributionPerLead = m.totalLeads > 0 && m.cogsPct != null
  ? (((m.newLeadSalesCount * m.avgOrderValue) / m.totalLeads) * (1 - m.cogsPct) - (m.adsSpendTotal / m.totalLeads))
  : null;
```

`contributionPerLead` returns `null` (displays "N/A") unless both `totalLeads > 0` **and** `cogsPct` is defined. No fallback to 0.

**2. Insert "Lead Funnel Economics" section** after Ad Performance, before Cost Structure:

- Section header: "Lead Funnel Economics" / "What does each lead cost and produce?"
- 3-column grid with `MetricCard` + `Users` icon:
  - **Cost Per Lead** — `formatCurrency` or "N/A" — subtitle: "Ad Spend ÷ Leads"
  - **Revenue Per Lead (Est.)** — `formatCurrency` or "N/A" — subtitle: "New-lead revenue ÷ Leads"
  - **Contribution Per Lead** — `formatCurrency` or "N/A" — subtitle: "Est. gross profit per lead after ad cost"

No changes to existing cards or calculations.

