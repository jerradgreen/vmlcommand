

## Plan: Revenue Reconciliation Page — Find Missing Sales

### The insight
The bank account is the source of truth. It shows $462K deposited vs only $343K in recorded sales — meaning ~$120K of sales are missing from the sales sheet. The reconciliation page should make this obvious and help identify the gaps.

### Implementation

**1. New hook: `src/hooks/useReconciliation.ts`**
- Query `sales` table: sum revenue by month (all time)
- Query `financial_transactions`: sum deposits where `txn_subcategory IN ('customer_payment', 'platform_payout')` by month
- Return monthly rows with: sales_revenue, deposits_received, gap, cumulative_gap
- Also return totals for the summary cards

**2. New page: `src/pages/Reconciliation.tsx`**
- **3 summary cards at top:**
  - "Bank Deposits" — total customer_payment + platform_payout deposits (the source of truth)
  - "Recorded Sales" — total from sales table
  - "Missing Revenue" — gap, red when deposits > sales (meaning sales sheet is incomplete)
- **Monthly breakdown table:**
  - Columns: Month | Bank Deposits | Recorded Sales | Gap | Cumulative Gap
  - Red highlight on months where deposits significantly exceed sales (those are where missing sales likely are)
  - Green/neutral when they roughly match
- **Explanatory note** at top: "If Bank Deposits exceed Recorded Sales, you likely have orders (QuickBooks, wire transfers) missing from your sales sheet."

**3. Route + navigation**
- Add `/reconciliation` route in `App.tsx`
- Add "Reconciliation" nav link in `AppLayout.tsx` sidebar

### Files
- New: `src/hooks/useReconciliation.ts`
- New: `src/pages/Reconciliation.tsx`
- Edit: `src/App.tsx` (add route)
- Edit: `src/components/AppLayout.tsx` (add nav link)

