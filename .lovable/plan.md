

# Three Targeted Changes to Dashboard Accuracy

## Overview

Three specific corrections to improve metric accuracy and UX, without changing the overall dashboard structure.

---

## Change 1: Rename and Fix Close Rate Calculation

**Current**: "Close Rate" label, calculated as `(all sales - repeat_direct) / total leads`

**New**: "Confirmed Close Rate" label, calculated as `new_lead sales count / total leads`

This ensures only confirmed new-lead conversions are counted, avoiding inflated rates from unmatched sales.

### Files changed:
- `src/hooks/useDashboardMetrics.ts` -- Change closeRate formula from `nonRepeatSales.length / totalLeads` to `newLeadSales.length / totalLeads`
- `src/pages/Dashboard.tsx` -- Rename card title to "Confirmed Close Rate", update subtitle to "New lead sales / Leads"

---

## Change 2: Avg Days Lead to Sale (new_lead + lead_id only)

**Current**: Not yet implemented (part of the approved restructure plan, not yet built)

**New**: Add an `avgDaysLeadToSale` metric computed only from sales where `sale_type = 'new_lead'` AND `lead_id IS NOT NULL`.

### Logic:
1. From the sales already fetched in the metrics query, filter to `sale_type === 'new_lead' && lead_id !== null`
2. Batch-fetch those leads' `submitted_at` from the leads table
3. For each matched pair, compute `sale.date - lead.submitted_at` in days
4. Average the result

### Files changed:
- `src/hooks/useDashboardMetrics.ts` -- Add a follow-up query to fetch leads by IDs for matched new_lead sales, compute average days, return `avgDaysLeadToSale`
- `src/pages/Dashboard.tsx` -- Add "Avg Days Lead to Sale" MetricCard in the top metrics grid (will be repositioned in the restructure), with subtitle "new_lead sales only"
- `src/components/LeadToSaleDetailDialog.tsx` -- New component showing a table of each matched sale with lead name, submitted date, sale date, and days between

---

## Change 3: Combined Next 7 Days Due Dialog

**Current**: Bills and COGS each have separate "Next 7 Days Due" cards with separate detail dialogs.

**New**: Keep the two separate cards on the dashboard, but when either is clicked, open a single combined dialog that shows:
- Combined total (Bills Due + COGS Due)
- Bills subtotal with itemized table
- COGS subtotal with itemized table

### Files changed:
- `src/components/Next7DueDetailDialog.tsx` -- New component that fetches both `bills` and `cogs_payments` with status in ('due', 'scheduled') and due_date between today and today+7. Shows a combined total, then two sub-sections with separate tables.
- `src/pages/Dashboard.tsx` -- Replace the separate `setBillsDetail({ type: "next7_bills_due" })` and `setCogsDetail({ type: "next7_cogs_due" })` onClick handlers with a new state variable for the combined dialog. Both "Next 7 Days Bills Due" and "Next 7 Days COGS Due" cards will open this same dialog.

---

## Technical Details

### Close Rate Formula Change (`useDashboardMetrics.ts`)

```text
Before: closeRate = (sales.filter(s => s.sale_type !== 'repeat_direct').length) / totalLeads
After:  closeRate = (sales.filter(s => s.sale_type === 'new_lead').length) / totalLeads
```

### Avg Days Query Strategy

The sales data is already fetched with `lead_id` included. Filter to qualifying sales, collect unique `lead_id` values, then do a single query:

```text
supabase.from("leads").select("id, submitted_at").in("id", leadIds)
```

Then compute days for each pair and average.

### Combined Due Dialog Structure

```text
+------------------------------------------+
| Next 7 Days Due                          |
|                                          |
| Combined Total: $X,XXX                   |
|                                          |
| --- Bills Due ($X,XXX) ---               |
| [Date | Vendor | Category | Amount | ...] |
|                                          |
| --- COGS Due ($X,XXX) ---               |
| [Date | Vendor | Order ID | Amount | ...] |
+------------------------------------------+
```

