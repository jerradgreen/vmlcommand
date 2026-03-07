

# COGS Audit View

## Problem
Your COGS total seems too high ($415k on ~$467k revenue). You need to quickly see every transaction classified under COGS parent categories (cogs, shipping_cogs, merchant_fees, packaging) and identify misclassified ones.

## Solution
Add a **"COGS group" preset filter** to the Transactions page and a **summary bar** showing the total dollar amount of the current filter, so you can:
1. One-click filter to all COGS transactions
2. See the running total of what you're looking at
3. Sort by amount to find the biggest offenders
4. Use the existing bulk-label bar to reclassify mistakes in batch

## Changes

### 1. Add preset "cost group" filter dropdown (Transactions page)
- New dropdown: **"Cost Group"** with options: `All`, `COGS`, `Ads`, `Overhead`, `Transfers`, `Uncategorized`
- Selecting "COGS" filters to `txn_category in (cogs, shipping_cogs, merchant_fees, packaging)`
- This replaces the single-category filter approach for auditing — the individual category filter remains for drilling deeper within a group

### 2. Add filter total summary bar
- Below filters, show: **"Showing 342 transactions · Total: $415,902"**
- Uses the `count` already returned by the query plus a sum from the filtered results
- Immediately tells you if the filtered total matches the dashboard number

### 3. Add sortable Amount column
- Click the "Amount" column header to sort by amount descending
- Surfaces the largest transactions first so you can spot outliers quickly

### 4. Add date range filter
- Two date inputs (From / To) so you can match the exact range you're comparing against (1/1/25 – 3/6/26)
- Currently the page shows all transactions with no date constraint

## Files Modified
1. **`src/pages/Transactions.tsx`** — Add cost group dropdown, date range inputs, amount sort toggle, and filter summary bar
2. **`src/lib/categoryTaxonomy.ts`** — Export a helper `getCostGroupCategories(group)` that returns the array of parent categories for each group (already has the constants, just needs a lookup function)

