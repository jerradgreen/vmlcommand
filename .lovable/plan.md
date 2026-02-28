

## Plan: Add "recurring vs one-time" flag to financial transactions

This adds a simple flag so you can distinguish regular monthly costs from annual/one-time charges like the $3,500 accountant fee. The dashboard will then show **recurring overhead** separately, giving you an accurate run-rate view.

### What changes

**1. Database migration — add `is_recurring` column**
```sql
ALTER TABLE financial_transactions 
  ADD COLUMN is_recurring boolean NOT NULL DEFAULT true;
```
Default `true` so existing transactions keep working. One-time items get manually flagged `false`.

**2. `src/components/TransactionEditSheet.tsx`**
- Add a toggle: **"Recurring expense?"** (on/off) below the existing Lock toggle
- Save `is_recurring` on update

**3. Dashboard overhead card — show breakdown**
- Update the Overhead subtitle on `src/pages/Dashboard.tsx` to show `"Recurring: $X / One-time: $Y"`
- Fetch the split via an updated query or a small RPC

**4. `src/components/MetricDrilldownDialog.tsx` — overhead_txns table**
- Add an `is_recurring` badge/column to the overhead transactions drilldown table so you can see which items are flagged

**5. `get_cost_rollups` RPC — no change needed**
- Total overhead stays the same (both recurring + one-time). The split is cosmetic/informational only, so Net Profit calculations remain unchanged.

### User action needed after deploy
Flag the $3,500 accountant fee as `is_recurring = false` via the Transaction Edit sheet. The overhead card will then show the split.

