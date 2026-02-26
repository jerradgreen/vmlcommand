

## Analysis: Where Should Revenue Come From?

You have three options. Here's the tradeoff:

### Option A: Keep sales sheet as source, manually fill gaps
- **Pro**: Sales records carry product names, customer emails, attribution data
- **Con**: You'll always be chasing missing entries; ~$94k gap today, more tomorrow
- **Verdict**: Not sustainable

### Option B: Switch dashboard revenue to bank deposits
- **Pro**: Always accurate — bank is the source of truth, no manual upkeep
- **Con**: You lose product-level detail; deposits are lump sums (e.g., Shopify batches multiple orders into one payout)
- **Verdict**: Good for total revenue accuracy, but you lose granularity

### Option C (Recommended): Hybrid — use deposits as the revenue number, but keep sales for attribution

Use bank deposits (`customer_payment` + `platform_payout`) as the official revenue figure on the dashboard, while keeping the sales table for lead attribution, close rates, and product-level reporting. Add a "Coverage" indicator showing what % of deposits have matching sales records.

This way:
- **Revenue is always correct** (comes from bank)
- **Attribution still works** for the sales you do have recorded
- **The gap is visible** so you know how much detail you're missing
- **No manual catch-up required** for the total number to be right

### Implementation Plan

**Step 1 — Add a deposit-based revenue query to `useDashboardMetrics.ts`**
- Query `financial_transactions` for `customer_payment` + `platform_payout` deposits within the date range
- Return `depositRevenue` alongside existing `rangeRevenue` (sales-based)

**Step 2 — Update Dashboard revenue card**
- Change the Revenue card to show deposit-based revenue as the primary number
- Add a subtitle like "87% matched to sales records" showing coverage
- Keep sales-based metrics (AOV, close rate, etc.) using the sales table since those need order-level data

**Step 3 — Update profit calculation**
- `netProfitProxy` should use deposit revenue instead of sales revenue
- Profit margin % likewise

**Step 4 — Add coverage indicator to Reconciliation page**
- Show a percentage badge: "Sales coverage: 74%" so you know at a glance how complete your sales records are

### Files modified
- `src/hooks/useDashboardMetrics.ts` — add deposit revenue query, update profit calc
- `src/pages/Dashboard.tsx` — swap revenue card to deposit-based, add coverage subtitle
- `src/pages/Reconciliation.tsx` — add coverage percentage indicator

