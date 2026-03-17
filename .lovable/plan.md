

## Plan: Add raw_payload keyword fallback for lead style classification

### What changes

**File: `src/hooks/useSignStyleMetrics.ts`**

1. **Update leads query** to also fetch `raw_payload` (the phrase field specifically).

2. **Extend `normalizeStyle`** to accept an optional third parameter: the phrase text from `raw_payload->>'What word(s) will you spell? Or numbers?'`.

3. **Add a third fallback layer** in `normalizeStyle`: after `sign_style` and `cognito_form` both fail to match, check the phrase text using a **restricted keyword list** (no "marquee"):
   - `"rental"`, `"package"` → Rental Inventory Package
   - `"logo"` → 3D Layered Logo Sign
   - `"event"`, `"wedding"`, `"birthday"` → Event Style Letters
   - `"wall"`, `"hanging"` → Wall Hanging Letters
   - `"mobile"`, `"vendor"` → Mobile Vendors

   This reuses the same `STYLE_KEYWORDS` list (which already doesn't contain "marquee"), so no special handling needed — the existing keywords naturally cover these cases.

4. **For the `cognito_form` fallback specifically**, also add `"marquee"` + `"rental"` co-occurrence check: if the cognito_form name contains both "marquee" and ("rental" or "vintage"), map to Rental. The existing cognito form name `"Custom Vintage Marquee Lights..."` would match because the keyword list already has `"rental"` and `"package"` — but actually that form name doesn't contain "rental". Let me re-check.

Actually, looking at the data again: the form `"Custom Vintage Marquee Lights..."` has 8 leads. The user wants those mapped to Rental only if both "marquee" AND "rental" appear. That form name doesn't have "rental" in it — so those 8 would stay Unknown unless I add a special rule. Let me just add `"vintage"` as a keyword for Rental in the cognito_form fallback? No — the user said marquee is too broad and only wants marquee+rental combo.

**Simpler approach**: Add `"vintage"` to the Rental keywords list. The `"Custom Vintage Marquee Lights"` form contains "vintage" and would match Rental. And "vintage" is specific enough that it won't cause false positives.

Wait, let me re-read: "apply ONLY the ones that have marquee and have rental in the same form as rental category." So they want: if a form/text has BOTH marquee AND rental → Rental. The form "Custom Vintage Marquee Lights" doesn't have "rental" in it, so it wouldn't match. Those 8 stay Unknown.

So the actual plan is simpler — just add the raw_payload phrase as a third fallback using the existing keyword list (which doesn't include "marquee").

### Changes summary

1. **Leads query**: `select("sign_style, cognito_form, raw_payload")` 
2. **Extract phrase**: `row.raw_payload?.['What word(s) will you spell? Or numbers?']` plus `row.raw_payload?.['Message-Anything else?']`
3. **`normalizeStyle` signature**: add optional `phraseText?: string` param
4. **Third fallback**: after cognito_form fails, try matching phraseText against the same `STYLE_KEYWORDS` list
5. **Aggregation call**: `normalizeStyle(row.sign_style, row.cognito_form, phraseText)`

### Expected impact
- ~135 "rental/package" keyword leads rescued  
- ~94 "logo" leads rescued
- ~50 "event/wedding/birthday" leads rescued
- ~32 "wall/hanging" leads rescued
- ~6 "mobile/vendor" leads rescued
- "marquee"-only leads (~205) stay Unknown (as requested)
- 8 "Custom Vintage Marquee Lights" form leads stay Unknown (no "rental" in form name)

No database changes needed.

