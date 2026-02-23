

# Realtime Ingestion (Revised)

## Overview

Two webhook endpoints for Zapier, a per-sale matching RPC, an ingestion log table, and a settings page to display URLs/payloads.

---

## 1. Database Migration

### New columns on `leads`
- `source_system text NOT NULL DEFAULT 'cognito'`
- `external_id text`
- `ingested_at timestamptz DEFAULT now()`
- Unique constraint on `(source_system, external_id)`

### New columns on `sales`
- `source_system text NOT NULL DEFAULT 'google_sheets'`
- `external_id text`
- `ingested_at timestamptz DEFAULT now()`
- Unique constraint on `(source_system, external_id)`

### New table: `ingestion_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| source_system | text | `'cognito'` or `'google_sheets'` |
| external_id | text | The external_id from the payload |
| status | text | `'ok'` or `'error'` |
| error_message | text | Nullable, error details |
| created_at | timestamptz | Default `now()` |

RLS: permissive allow-all (same pattern as leads/sales, no auth in this app).

### New RPC: `match_sale_by_id(p_sale_id uuid)`

Targets a single sale and attempts matching in order:
1. **Email exact match** -- find a lead with identical email, link it
2. **Smart match** -- reuse the domain + token + name logic from `backfill_smart_matches` but scoped to just this one sale

If a match is found, updates `lead_id`, `match_method`, `match_confidence`, `match_reason`, and `sale_type` on that single row. Returns a JSON summary.

---

## 2. Edge Functions

### A) `ingest-lead` (POST)

- Requires `external_id` explicitly in the JSON body (will reject if missing)
- Does NOT generate `lead_id` -- lets the database assign UUID via `gen_random_uuid()`
- Sets `cognito_form` from payload or defaults to `'webhook'`
- Sets `cognito_entry_number` from `external_id`
- Maps fields: `name`, `email`, `phone`, `phrase`, `sign_style`, `size_text`, `budget_text`, `notes`, `submitted_at`
- Stores full payload in `raw_payload`
- Upserts using `ON CONFLICT (source_system, external_id)`
- Writes a row to `ingestion_logs` with status `'ok'` or `'error'`
- Returns `{ ok: true, external_id }`

### B) `ingest-sale` (POST)

- Requires `external_id` explicitly in the JSON body (will reject if missing)
- Maps fields: `order_id`, `date`, `email`, `product_name`, `revenue`, `order_text`
- Stores full payload in `raw_payload`
- Upserts using `ON CONFLICT (source_system, external_id)`
- After successful upsert, calls `match_sale_by_id(p_sale_id)` for just this sale -- no global backfill
- Writes a row to `ingestion_logs`
- Returns `{ ok: true, external_id, order_id, match_result }`

### Both functions
- CORS headers included
- `verify_jwt = false` in config.toml (Zapier has no JWT)
- Use `SUPABASE_SERVICE_ROLE_KEY` for database writes
- Validate input, reject empty/missing `external_id`

---

## 3. Settings Page (`/settings`)

- Displays the two POST webhook URLs (constructed from project URL)
- Copy-to-clipboard buttons
- Expandable sample JSON payloads showing required fields (including `external_id`)
- Note about the `ingestion_logs` table for debugging silent Zapier failures
- New "Settings" nav item with gear icon in sidebar

---

## 4. No Changes to Existing Logic

Dashboard, Import, Attribution, Leads, Sales pages remain untouched. Existing CSV import and global backfill functions are not modified.

---

## Technical Details

### Files to create
| File | Purpose |
|------|---------|
| `supabase/functions/ingest-lead/index.ts` | Lead webhook endpoint |
| `supabase/functions/ingest-sale/index.ts` | Sale webhook endpoint |
| `src/pages/Settings.tsx` | Admin settings page |
| Migration SQL | Schema changes + `match_sale_by_id` RPC + `ingestion_logs` table |

### Files to modify
| File | Change |
|------|--------|
| `supabase/config.toml` | Add `[functions.ingest-lead]` and `[functions.ingest-sale]` with `verify_jwt = false` |
| `src/components/AppLayout.tsx` | Add Settings nav item |
| `src/App.tsx` | Add `/settings` route |

