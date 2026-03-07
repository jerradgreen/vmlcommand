

# Limit Accrual COGS Estimate to 2026+ Sales Only

## Problem
The accrued manufacturing COGS estimate (50% of revenue for unreconciled sales) currently applies to ALL sales in the date range, including 2025 orders. This inflates COGS significantly because hundreds of 2025 sales were never reconciled and don't need to be. You only want accrual estimates starting from January 1, 2026.

## Root Cause
The `get_accrued_mfg_cogs_rollup` database function queries all sales in the requested date range with no minimum date floor. When the dashboard or report uses a range like 1/1/25–3/7/26, it includes ~$217k of accrued estimates from 2025 sales that will never be reconciled.

## Changes

### 1. Update `get_accrued_mfg_cogs_rollup` RPC (database migration)
Add a date floor so the function only considers sales on or after `2026-01-01` for the accrual estimate:
- Change the `range_sales` CTE `WHERE` clause from `s.date >= COALESCE(p_from, '2000-01-01')` to `s.date >= GREATEST(COALESCE(p_from, '2000-01-01'), '2026-01-01')`
- This means: even if the user selects a range starting in 2025, the accrual overlay only kicks in for 2026+ sales
- Cash COGS from `get_cost_rollups` (actual bank transactions) remains unchanged and will still include all 2025 manufacturing payments

### 2. No frontend changes needed
The dashboard and report code already call the RPC and display whatever it returns. Once the RPC stops including 2025 sales in the estimate, the numbers will automatically correct everywhere — dashboard cards, report PDF, and the COGS reconciliation page.

## Expected Result
- The ~$217k accrued estimate from 2025 sales will drop to $0 (or near it) for those orders
- Only 2026 sales with unreconciled manufacturing will contribute to the accrual overlay
- Cash COGS (actual wire payments in 2025) will still show correctly
- The total "Adjusted COGS" in the report should drop significantly and better reflect reality

