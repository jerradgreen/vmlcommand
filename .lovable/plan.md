

## Plan: Add Sign Style Performance Section to Dashboard

### Approach change from previous plan
Metrics are computed by **direct style-based aggregation** — no `lead_id` linkage needed. Leads are counted from the `leads` table grouped by normalized `sign_style`, sales/revenue from the `sales` table grouped by normalized `sign_style`. Close rate is simply `Sales / Leads` within each bucket.

### 6-bucket normalization (unchanged)
Case-insensitive keyword matching on `sign_style`:
- **Rental Inventory Package** — "rental", "package"
- **Event Style Letters** — "event"
- **3D Layered Logo Sign** — "layered", "logo"
- **Wall Hanging Letters** — "wall", "hanging"
- **Mobile Vendors** — "mobile", "vendor"
- **Unknown** — null, empty, or unmatched

### Files

**1. `src/hooks/useSignStyleMetrics.ts`** (new)
- Accepts date range from dashboard
- Query 1: `leads` table → `sign_style` field → normalize → count per bucket
- Query 2: `sales` table → `sign_style`, `revenue` → normalize → count + sum revenue per bucket
- No `lead_id` join — both queries are independent aggregations
- Returns `{ style, leads, sales, closeRate, revenue, revenuePerLead, avgSaleValue }[]` sorted by revenue desc
- N/A for divide-by-zero cases

**2. `src/pages/Dashboard.tsx`**
- Import hook + table components
- Add "Sign Style Performance" section after Lead Funnel Economics
- Compact `Table` with columns: Style | Leads | Sales | Close Rate | Revenue | Rev/Lead | Avg Sale
- Uses existing `formatCurrency` / `formatPercent` helpers
- No changes to any existing cards or calculations

