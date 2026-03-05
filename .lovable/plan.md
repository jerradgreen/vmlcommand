

## Fix: Allow Multiple Payments to One Sale

### The Problem
The current code has a bug that prevents your exact scenario. When you allocate the first $3,305 FosterWeld payment to #VML18408, the code immediately marks that sale as **"paid"** (line 192-193) regardless of the amount. The sale then disappears from the "Unpaid only" list, so you can't allocate the second $3,316.24 payment to it.

### The Fix

**Step 1: Smart status calculation after allocation**
Instead of blindly marking every allocated sale as "paid", compute the correct status based on total allocations vs. estimated manufacturing cost:
- **unpaid**: no allocations yet
- **partial**: some allocations but total < estimated COGS (revenue x estimated_cogs_pct)
- **paid**: total allocations >= estimated COGS

This way, after allocating $3,305 to #VML18408 (estimated mfg = $6,500 at 50%), the sale stays as "partial" and remains visible for the second allocation.

**Step 2: Show allocation progress on the sales table**
Add a small indicator showing how much has already been allocated to each sale, so you can see at a glance that #VML18408 already has $3,305 allocated and needs more.

### Your Workflow After the Fix
1. Click the $3,305 FosterWeld payment on the left
2. Check #VML18408 on the right, switch to Manual mode, enter `3305`, save
3. Sale stays as "partial" in the list
4. Click the $3,316.24 FosterWeld payment on the left
5. Check #VML18408 again, enter `3316.24`, save
6. Sale now has $6,621.24 allocated (exceeds $6,500 estimate) and flips to "paid"

