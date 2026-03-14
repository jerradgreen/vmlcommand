

## Adjustments to New Lead Metric

### 1. Rename
Label changes from **"Profit Per Lead"** to **"Contribution Per Lead"** — shorter, accurate, and reflects that overhead/capital are excluded.

### 2. N/A guard
When `totalLeads === 0`, display **"N/A"** instead of `$0`. The calculation only runs when leads > 0.

### 3. Grid scope confirmation
The `grid-cols-3` change applies **only** to the lead funnel sub-grid (Cost Per Lead / Revenue Per Lead / Contribution Per Lead). The main Key Numbers grid (Sales Revenue, Net Profit, Cash in Bank, Close Rate) remains `grid-cols-2` / responsive as-is.

### Single file: `src/components/CeoMorningBrief.tsx`
- Label: `"Contribution Per Lead"`
- Sub-text: `"Est. gross profit per lead after ad cost"`
- Value: `totalLeads > 0 ? formatCurrency(revenuePerLead * (1 - cogsPct30d) - costPerLeadVal) : "N/A"`
- Color: green if positive, red if negative, muted if N/A

