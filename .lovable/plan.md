

# Three Targeted Changes to Dashboard Accuracy — COMPLETED

All three changes have been implemented.

## Change 1: ✅ Confirmed Close Rate
- Formula changed to `newLeadSales.length / totalLeads`
- Card renamed to "Confirmed Close Rate" with subtitle "New lead sales / Leads"

## Change 2: ✅ Avg Days Lead to Sale
- Computed from `sale_type='new_lead' AND lead_id IS NOT NULL`
- New card on dashboard with detail dialog (LeadToSaleDetailDialog)

## Change 3: ✅ Combined Next 7 Days Due Dialog
- Both "Next 7 Days Bills Due" and "Next 7 Days COGS Due" cards open the same combined dialog
- Shows combined total, bills subtotal with table, COGS subtotal with table
