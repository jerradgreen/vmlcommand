

## Problem

1,903 leads have no `sign_style` value, but many of them came through form-specific Cognito forms that tell us exactly what style they're asking about. Currently, the `normalizeStyle` function only looks at the `sign_style` column and ignores the `cognito_form` column — so those leads all fall into "Unknown."

Here's the breakdown of leads with **no sign_style** by form:
- `general_quote` → 1,241 (can't infer — truly unknown without manual review)
- `event_style` → 348 → **Event Style Letters**
- `wall_hanging` → 105 → **Wall Hanging Letters**
- `Event Style letters quote form` → 99 → **Event Style Letters**
- `rental_guide_download` → 26 → **Rental Inventory Package**
- `layered_logo` → 25 → **3D Layered Logo Sign**
- `Individual Wall-Hanging letters/numbers` → 16 → **Wall Hanging Letters**
- `mobile_vendor` → 9 → **Mobile Vendors**
- `3D Logo Layered Sign Form` → 9 → **3D Layered Logo Sign**
- `Custom Vintage Marquee Lights...` → 8 → **Rental Inventory Package**
- `Mobile Vendor Sign Form` → 7 → **Mobile Vendors**
- `"Not Sure"...` → 6 → **Unknown**
- `not_sure` → 4 → **Unknown**

This means ~650 leads can be rescued from "Unknown" just by looking at the form name.

## Plan

### 1. Update `normalizeStyle` to accept both `sign_style` and `cognito_form`

In `src/hooks/useSignStyleMetrics.ts`:

- Change the function signature to `normalizeStyle(signStyle, cognitoForm)`.
- First, try to match on `sign_style` using the existing keyword logic.
- If that returns "Unknown" (i.e., `sign_style` was null/empty/unrecognized), fall back to matching on `cognito_form` using the **same keyword list** — since the keywords ("event", "wall", "mobile", "rental", "layered", "logo", "3d") already cover all the form names naturally.
- `general_quote` and `not_sure` won't match any keyword, so they correctly stay "Unknown."

### 2. Fetch `cognito_form` alongside `sign_style` in the leads query

Update the leads `select` from `"sign_style"` to `"sign_style, cognito_form"` so we have both fields available for normalization.

### 3. Pass both fields during aggregation

When counting leads into buckets, call `normalizeStyle(row.sign_style, row.cognito_form)` instead of just `normalizeStyle(row.sign_style)`.

### Expected Impact

- ~650 leads move from "Unknown" to their correct style bucket
- ~1,241 `general_quote` leads with no `sign_style` remain "Unknown" (you'd need to manually review those or inspect their `raw_payload` for clues)
- No database migration needed — this is purely a client-side normalization change
- Sales normalization is unaffected (sales don't have `cognito_form`)

