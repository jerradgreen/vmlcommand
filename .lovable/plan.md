

## Confirmation of All 5 Safeguards

### 1) RPC Performance — Confirmed

The `get_accrued_mfg_cogs_rollup` RPC will:

- **Filter sales by date FIRST** in the CTE (`WHERE date >= p_from AND date <= p_to`), then LEFT JOIN `cogs_allocations` on `sale_id`. Sales date filtering happens before any allocation join.
- **Indexes used:**
  - `idx_sales_date` already exists on `sales(date)` — confirmed in DB.
  - `cogs_allocations(sale_id)` index will be created in the migration.
- **All aggregation in SQL** — the RPC returns a single JSON row with all 6 fields pre-computed. No JS-side aggregation.

### 2) Editable Estimated COGS % — Confirmed

- `estimated_cogs_pct` is a per-row column on `sales` (default 0.50).
- The COGS Reconciliation right panel will display this value per sale and allow inline editing (click to change, saves directly to the row).
- The RPC uses each sale's individual `estimated_cogs_pct`, not a global constant: `SUM(revenue * estimated_cogs_pct)`.
- You can set 0.42 for layered signs, 0.55 for event letters, etc.

### 3) Sales Date Range in Reconciliation UI — Confirmed

- The right panel will have a **date range picker** (not just a fixed 120-day window).
- Default: last 120 days. User can expand to any range or select "All Time".
- A quick filter toggle for "Show unpaid only" will also be available, ensuring older unpaid sales surface regardless of date.

### 4) Safeguard Against Over-Allocation — Confirmed

Three validations will be enforced:

**A) Transaction cannot be over-allocated:**
- UI computes `remainingUnallocated = abs(txn.amount) - SUM(existing allocations for txn)` and caps new allocations at this value.
- The allocation save handler validates `SUM(new allocations) <= remainingUnallocated` before insert.

**B) Sale cannot exceed estimated manufacturing:**
- Each sale's allocation is capped at `remaining_mfg = GREATEST(revenue * estimated_cogs_pct - existing_allocations, 0)`.
- Auto-split mode caps each sale at its `remaining_mfg`.
- Manual mode validates per-sale entry ≤ `remaining_mfg`.

**C) Status recalculates on delete:**
- When an allocation is deleted, the UI re-queries the sale's total allocations and updates `manufacturing_status`:
  - `unpaid` if total allocations = 0
  - `partial` if 0 < total < estimated
  - `paid` if total ≥ estimated

### 5) Sanity Check Scenario — Confirmed

Walk-through of your test case:

```
Sale: revenue $10,000, estimated_cogs_pct = 0.50
  → estimated_mfg = $5,000
  → allocated_mfg = $0 (initially)
  → remaining_mfg = $5,000
  → manufacturing_status = 'unpaid'

Wire: $12,000 manufacturing payment
  → allocated = $0, remaining_unallocated = $12,000

Action: Allocate $5,000 from wire to this sale

After allocation:
  Sale:
    allocated_mfg = $5,000
    remaining_mfg = GREATEST($5,000 - $5,000, 0) = $0
    manufacturing_status = 'paid' ✓

  Wire:
    allocated = $5,000
    remaining_unallocated = $7,000 (available for other sales)

Dashboard adjusted metrics:
  This sale contributes $0 to accrued_mfg_remaining_total ✓
  adjustedCogsTotal = cashCogsTotal + accruedMfgRemaining (reduced by $5,000) ✓
  adjustedNetProfit increases accordingly ✓
```

The $12,000 wire is already counted in cash COGS (via `get_cost_rollups`). The accrual overlay only adds the **unpaid remainder** on top. Once allocated_mfg ≥ estimated_mfg, that sale adds $0 to the accrual — no double counting.

---

### Implementation Plan (6 tasks)

**Task 1: Database migration**
- Create `cogs_allocations` table with indexes on `(sale_id)` and `(financial_transaction_id)`
- ALTER `sales`: add `estimated_cogs_pct numeric NOT NULL DEFAULT 0.50`, `manufacturing_status text NOT NULL DEFAULT 'unpaid'`
- Insert 3 transaction rules for Foster Weld, Wowork, Fushun Lusheng (contains match, priority 50)
- Create RPC `get_accrued_mfg_cogs_rollup(p_from, p_to)` — CTE filters sales by date first, LEFT JOINs allocations, returns 6 fields
- RLS on `cogs_allocations`: permissive ALL with `true` (matches existing pattern)

**Task 2: Update `useDashboardMetrics.ts`**
- Add `get_accrued_mfg_cogs_rollup` call in `Promise.all`
- Compute `accruedMfgRemaining`, `adjustedCogsTotal`, `adjustedNetProfit`, `adjustedProfitMarginPct`, `adjustedCogsPct`
- Return all new fields (no existing fields changed)

**Task 3: Update `Dashboard.tsx`**
- Add defaults for new fields in fallback object
- Add "Adjusted (Accrual) View" section with 4 cards: Adjusted COGS, Adjusted COGS %, Adjusted Net Profit, Adjusted Profit Margin
- Show unpaid/partial/paid counts as small text

**Task 4: Create `CogsReconciliation.tsx`**
- Left panel: manufacturing transactions with allocated/remaining display
- Right panel: sales with date range picker, estimated/allocated/remaining per sale, editable `estimated_cogs_pct`
- Batch allocation with auto-split (proportional) and manual modes
- Validation: no negative, no over-allocation on transaction or sale side
- Status recomputation on save and delete
- Delete allocation support with automatic status reflow

**Task 5: Add route and nav**
- Add `/cogs-reconciliation` route in `App.tsx`
- Add nav item in `AppLayout.tsx` (Factory icon, after Reconciliation)

**Task 6: Update types**
- `types.ts` auto-updates after migration for new table and RPC signatures

