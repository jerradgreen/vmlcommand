

## Plan: Update VML18423 to Wall Hanging + Recalculate YTD Accrual

### Step 1: Fix sale style (data update)
Update `sales` table: set `sign_style = 'Wall Hanging'` for order_id `#VML18423`.

### Step 2: Recalculate YTD manufacturing accrual
Re-run the accrual query for all manufactured styles (Layered/Logo, Wall Hanging, Mobile Vendor, Event Style) from 2026-01-01 onward, now including both VML18422 (Layered) and VML18423 (Wall Hanging) in their correct buckets.

No code or schema changes needed — data update only.

