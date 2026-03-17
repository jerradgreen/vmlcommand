

## Fix: "No allocations to save" Error in Manual Mode

### Problem
When you switch to Manual mode and click "Save Allocations" without typing an amount into the input field, `manualAmounts[id]` is `undefined`/`""`, which becomes `0`. The save logic then filters out all zero-amount allocations and throws "No allocations to save."

There's also a UX issue: the manual amount input field only renders when a sale is checked **and** mode is manual — but if you switch to manual *after* checking sales, the inputs appear but are empty with no guidance.

### Fix

1. **Better error message**: Instead of the generic "No allocations to save", show "Please enter an amount for at least one selected sale" when in manual mode and all amounts are zero/empty.

2. **Pre-fill manual amounts**: When switching to manual mode, auto-populate each selected sale's amount field with the auto-split value (remaining ÷ selected count) so the user has a starting point to adjust rather than blank fields.

3. **Validate before mutating**: Check for empty/zero amounts client-side before calling the mutation, with a clear toast message.

