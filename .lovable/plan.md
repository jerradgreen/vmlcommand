

## Make Trend Charts Reactive to Data Changes

### Problem
The trend charts use `useTrendData` which caches results via React Query. When you delete leads (or any data), the charts don't refresh until a full page reload.

### Plan

**Step 1: Add query invalidation after data mutations**
- When leads are deleted (from the Leads page), invalidate the `trend-data` and `dashboard-metrics` query keys so the charts automatically recalculate.
- Update the Leads page to call `queryClient.invalidateQueries({ queryKey: ["trend-data"] })` and `queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] })` after any deletion.

**Step 2: Make trend chart points clickable (leads chart)**
- When a user clicks a data point on the Leads Trend chart, open a dialog showing the individual leads for that day.
- This lets you inspect who the leads are and decide if any need removal.
- The dialog will include a "Delete" button per lead, and after deletion the charts will auto-refresh.

**Step 3: Delete the Greg Goldschmidt duplicate**
- Run a migration to delete the duplicate entry (keep the earlier "Greg Goldschmidt" at 16:24, remove "Gregory Goldschmidt" at 16:33).

### Technical Details
- The `TrendChart` component will get an optional `onPointClick` callback
- A new `TrendLeadDetailDialog` component will query leads for a specific date and allow deletion
- React Query's `invalidateQueries` ensures all cached metrics and trends re-fetch after any mutation

