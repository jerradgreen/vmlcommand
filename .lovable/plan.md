

## Plan: Add Unique Customers metric to Sign Style Performance

### Problem
Close rate currently uses total sales (124), which double-counts repeat buyers. Using unique customers (by email or lead_id) gives a true conversion rate.

### Changes

#### 1. Hook: `src/hooks/useSignStyleMetrics.ts`

**Data fetching**: Update sales query to also fetch `email` and `lead_id`:
```
select("sign_style, revenue, email, lead_id")
```
Also paginate sales like leads (to handle future growth past 1000).

**Aggregation**: For each style bucket, track a `Set` of unique customers. A customer is identified by `lead_id` if present, otherwise `email` (lowercased/trimmed), otherwise skip (can't deduplicate).

**Interface update**: Add `customers` (unique count) to `SignStyleRow`. Update `closeRate` formula to `customers / leads`.

```typescript
export interface SignStyleRow {
  style: StyleBucket;
  leads: number;
  sales: number;        // total transactions
  customers: number;    // unique buyers
  closeRate: number | null;  // customers / leads
  revenue: number;
  revenuePerLead: number | null;
  avgSaleValue: number | null;  // revenue / sales (total)
}
```

#### 2. Dashboard UI: `src/pages/Dashboard.tsx`

- Rename "Sales" header → "Sales (Total)"
- Add "Customers" column after it
- Close Rate now uses `row.closeRate` (already recalculated in hook)
- Display `row.customers` in the new column

Column order: Style | Leads | Sales (Total) | Customers | Close Rate | Revenue | Rev/Lead | Avg Sale

