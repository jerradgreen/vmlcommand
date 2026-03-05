

## Fix Misclassified Transactions

### What I Found

Looking at the specific transactions you mentioned:

1. **Venmo $282.09** (id: `227e038f`) — currently classified as `shipping_cogs` / `freight_international`. This should be `contractor_payments` like the other Venmo/Alex Gilmore transactions.

2. **ADP Fees** — already correctly classified as `merchant_fees` / `adp`. No change needed there.

The COGS breakdown (YTD from 2025):
- **cogs**: $221,225 (manufacturing — wire transfers, Foster Weld, Best Neon Sign)
- **shipping_cogs**: $11,139 (includes the misclassified $282 Venmo)
- **merchant_fees**: $537

### Plan

**Step 1: Fix the Venmo transaction data**
Update the Venmo transaction `227e038f` to:
- `txn_category` → `contractor_payments`
- `txn_subcategory` → `freelance_labor`
- `vendor` → `Alex Gilmore`

**Step 2: Update/create transaction rules to prevent recurrence**
Check if the existing Venmo rule is too broad (matching all Venmo transactions as shipping). If so, update or add a more specific rule so future Venmo transactions default to `contractor_payments` instead of `shipping_cogs`.

**Step 3: Investigate the 80% COGS concern**
The $221K in COGS is the bulk. I'll query the deposit revenue to show you the actual COGS % breakdown so we can verify whether it's truly 80% or if there are additional misclassified transactions inflating it.

