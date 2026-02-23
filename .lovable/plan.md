

# Implement API Key Protection

## Step 1: Add Secret
Prompt you for the `INGEST_API_KEY` value using the secrets tool. This will be securely stored and accessible to edge functions via `Deno.env.get("INGEST_API_KEY")`.

## Step 2: Update `supabase/functions/ingest-lead/index.ts`
- Add `x-api-key` to the CORS `Access-Control-Allow-Headers` string
- Insert API key validation immediately after the OPTIONS check (before JSON parsing):
  - Read `req.headers.get("x-api-key")`
  - Compare against `Deno.env.get("INGEST_API_KEY")`
  - Return 401 with `{ ok: false, error: "Unauthorized" }` if missing or wrong

## Step 3: Update `supabase/functions/ingest-sale/index.ts`
- Same two changes as ingest-lead

## Step 4: Update `src/pages/Settings.tsx`
- Add an "Authentication" card between the endpoint cards and the Debugging card
- Show the required header name (`x-api-key`) with a copy button
- Include a note: "Set this same value in your Zapier Webhook headers under Custom Headers."

## No Other Changes
- `config.toml` unchanged (`verify_jwt = false` stays)
- No database changes
- No new files

