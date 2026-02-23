

# Fix: Broken Suggestion Engine (SQL Bug)

## The Problem

Every time you click "Find Suggestions" or "Generate Suggestions", it fails because the `get_match_suggestions` database function has a SQL error: **"column 'r' does not exist"**.

This means:
- No suggestions are ever shown on sale cards
- The "Generate Suggestions" bulk action silently fails
- The Link modal shows "No suggested leads found" even when matches exist

## The Root Cause

Inside the function, the "reasons" array is built with invalid SQL syntax. The fix is a one-line change to how that array is constructed.

## What Will Be Fixed

1. **Fix the `get_match_suggestions` RPC** -- rewrite the reasons array construction so it properly filters out NULL values
2. **Fix the `bulk_generate_suggestions` RPC** -- it calls `get_match_suggestions` internally, so fixing that fixes both

After this fix:
- "Find Suggestions" will return matching leads based on shared tokens (like "troy"), domain matches, name overlaps, and phrase matches
- "Generate Suggestions" will pre-populate suggestions on all unmatched sales
- The Link modal will show scored candidates with reason chips

## Technical Details

### Migration: Fix `get_match_suggestions` function

Replace the broken `ARRAY(SELECT unnest(...) AS r WHERE r IS NOT NULL)` with a properly structured subquery:

```text
ARRAY(
  SELECT v FROM (VALUES
    (CASE WHEN ... THEN 'email_exact' ELSE NULL END),
    (CASE WHEN ... THEN 'domain: ' || ... ELSE NULL END),
    ...
  ) AS t(v) WHERE v IS NOT NULL
)
```

This is a `CREATE OR REPLACE FUNCTION` so no schema changes are needed -- just the function body is updated.

### No UI changes needed

The Attribution.tsx code already handles displaying suggestions correctly. The suggestions just never arrived because the RPC was crashing.

### Files Modified

| File | Change |
|------|--------|
| New migration SQL | `CREATE OR REPLACE FUNCTION get_match_suggestions` with fixed reasons array syntax |

