
# Import Enhancements + Attribution Inbox Upgrade

## Changes to `src/pages/Import.tsx`

### 1. Dry Run Mode
- Add `dryRun` boolean state (default: `true`)
- Add a checkbox/switch toggle labeled "Dry Run (no database writes)"
- Single primary button behavior:
  - When `dryRun=true`: button labeled "Run Dry Run", runs all parsing/validation/dedup but no upsert
  - When `dryRun=false`: button labeled "Confirm Import", performs the real upsert
- After dry run completes, show a callout/alert: "Dry run complete. Turn OFF Dry Run to import."
- Add `dryRunComplete` state to track whether a dry run has finished
- Show a summary card after dry run: total parsed, valid, skipped (with reasons), would-insert count, in-file duplicates
- Show collapsible "Transformed Payload Preview" with the first 10 JSON objects that would be sent

### 2. Cognito Form Mapping Presets
- Create new file `src/lib/cognitoMappings.ts` with a `FORM_COLUMN_MAPPINGS` object keyed by form name
- Each form defines candidate column names for: entry_number, submitted_at, name, email, phone, phrase, sign_style, size_text, budget_text, status, notes
- Forms like `rental_guide_download` omit phrase/size/budget candidates (those fields stay null)
- Refactor `handleLeadsFiles` to use the selected form's mapping preset instead of hardcoded column candidates

### 3. Transform Validator Panel
- After parsing, run validation on every row and store results in a `validationIssues` state array of `{rowIndex, field, reason, level}` objects
- **Leads validation:**
  - `lead_id`: required (error) -- rows without entry number already skipped
  - `submitted_at`: required, must be parseable as date (error)
  - `email`: recommended but NOT required; if missing/invalid, set email_norm to null and flag as **warning** (row still importable)
- **Sales validation:**
  - `order_id`: required (error)
  - `revenue`: required, must be valid number (error)
  - `date`: required, must be parseable as date (error)
  - `email`: required (error) -- needed for matching
- Show a "Validation Issues" card listing row numbers and failure reasons, color-coded (red for errors, amber for warnings)
- Error rows are excluded from "would insert" count; warning rows are included

### 4. Duplicate Counting
- In-file duplicate detection using a Set on lead_id / order_id (already partially done)
- During real import (`dryRun=false`), use `ignoreDuplicates: true` on upsert; compare returned count vs sent count to determine DB-level duplicates
- Report in summary: "X in-file duplicates skipped, Y already in database"

### 5. Matching Preview (Sales Dry Run)
- When sales CSV is parsed and dry run completes, query the `leads` table for count
- If leads table has 0 rows: show "No leads in database yet. Import leads first." and skip match computation
- If leads exist: query `leads` for `email_norm` values, compute how many parsed sales would auto-match within the 60-day window
- Show a "Matching Preview" card: "X of Y sales would auto-match to existing leads"

---

## New file: `src/lib/cognitoMappings.ts`
- Exports `FORM_COLUMN_MAPPINGS` record keyed by cognito form name
- Each entry is an object with arrays of candidate column names for each field
- Example: `general_quote` maps email to `["Email", "Email Address"]`, phrase to `["Phrase", "Text", "Custom Text", "Message"]`
- `rental_guide_download` has empty arrays for phrase, sign_style, size_text, budget_text

---

## Changes to `src/pages/Attribution.tsx`

### Dismiss with localStorage Persistence
- Add `dismissedIds` state initialized from `localStorage.getItem("vml-dismissed-sales")`
- When Dismiss is clicked, add the sale's `order_id` to the Set and persist to localStorage
- Filter out dismissed sales from the visible list by default
- Add a "Show dismissed" toggle (switch) at the top of the page
- When toggled on, show dismissed sales with a visual indicator (e.g., muted/strikethrough styling)

---

## Changes to `src/components/AppLayout.tsx`

### Unmatched Sales Badge
- Add a `useQuery` to fetch count of unmatched sales (`sale_type='unknown'`, `lead_id IS NULL`)
- Show a small numeric badge next to "Attribution Inbox" nav item when count > 0

---

## Technical Details

### Validation rules summary

| Table | Field | Level | Rule |
|-------|-------|-------|------|
| leads | lead_id | error | Must be non-empty |
| leads | submitted_at | error | Must be parseable as date |
| leads | email | warning | If missing, email_norm = null; flag but allow |
| sales | order_id | error | Must be non-empty |
| sales | revenue | error | Must be valid number |
| sales | date | error | Must be parseable as date |
| sales | email | error | Must be non-empty |

### Files modified
- `src/pages/Import.tsx` -- major rework with dry run, validation, matching preview, cognito presets
- `src/pages/Attribution.tsx` -- dismiss with localStorage, show dismissed toggle
- `src/components/AppLayout.tsx` -- unmatched sales count badge

### New files
- `src/lib/cognitoMappings.ts` -- form column mapping presets
