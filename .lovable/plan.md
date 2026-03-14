

## Smooth Bulk Ad Spend Entries — One-Time Fix

**What**: After populating `adSpend` from the expenses table (lines 551-558), add a post-processing block that detects months with sparse entries and redistributes their totals evenly across all days of that month within the display range.

**How** (single change in `src/hooks/useDashboardMetrics.ts`, after line 558):

1. Group `sortedDisplayDates` by `YYYY-MM`
2. For each month-group, count days with non-zero `adSpend`
3. If ≤ 3 non-zero days exist but the group has ≥ 7 total days:
   - Find the last non-zero day; check if there's a run of ≥ 3 consecutive non-zero days at the end of the month (that's the "daily cutoff")
   - Sum all adSpend before that cutoff, divide by count of days before cutoff, assign evenly
   - Leave days at/after cutoff untouched
4. If no daily cutoff found (entire month is bulk like January), spread entire sum across all days in that month

This handles January (1 entry → spread across all Jan days in range) and Feb 1-21 (1 bulk entry redistributed across 21 days, while Feb 22+ daily entries stay as-is).

**Scope**: ~30 lines added to one file, no new components or reusable abstractions.

