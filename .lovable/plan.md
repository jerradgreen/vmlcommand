

# Add API Key Protection to Ingestion Endpoints

## Overview

Add a shared secret (`INGEST_API_KEY`) that both edge functions check via the `x-api-key` header. Update the Settings page to document this requirement.

---

## 1. Store the Secret

Use the secrets tool to prompt you for the `INGEST_API_KEY` value. This will be stored securely and accessible to edge functions via `Deno.env.get("INGEST_API_KEY")`.

---

## 2. Update Edge Functions

Both `ingest-lead/index.ts` and `ingest-sale/index.ts` get the same change:

- Add `x-api-key` to the CORS `Access-Control-Allow-Headers` list
- Immediately after the OPTIONS check, read `req.headers.get("x-api-key")` and compare against `Deno.env.get("INGEST_API_KEY")`
- If missing or mismatched, return `{ ok: false, error: "Unauthorized" }` with status 401
- `verify_jwt` remains `false` in config.toml (unchanged)

---

## 3. Update Settings Page

Add a new section between the endpoint cards and the Debugging card:

- A card titled "Authentication" explaining that all requests require the `x-api-key` header
- Show the header name with a copy button
- A note: "Set this same value in your Zapier Webhook headers under Custom Headers."

---

## Technical Details

### Files to modify

| File | Change |
|------|--------|
| `supabase/functions/ingest-lead/index.ts` | Add `x-api-key` to CORS headers; add API key check after OPTIONS |
| `supabase/functions/ingest-sale/index.ts` | Same API key check |
| `src/pages/Settings.tsx` | Add Authentication card documenting the required header |

### No other changes needed
- `config.toml` stays the same (`verify_jwt = false`)
- No database changes
- No new files

