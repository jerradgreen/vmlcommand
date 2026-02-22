

# Multi-Signal Attribution Matching -- Implementation Plan

## Overview

Move the smart matching engine from client-side JavaScript to server-side SQL. Add richer sales text extraction, tighter candidate filtering, proper backfill, indexes, and a manual "Link to lead" UI with search fallback.

## What Will Change

### For You (the User)
- After importing sales, auto-matching will link more sales to leads using keyword/domain/timing signals (not just email)
- The Attribution Inbox will show server-computed suggestions with scores and reasoning
- A new "Link" button on each sale card opens a modal where you can confirm a suggested lead or search manually
- A "Backfill Smart Matches" button lets you re-run matching on all existing unmatched sales

### What Gets Built

---

## 1. Database Migration

### A. Helper Functions (9 functions)

| Function | Purpose |
|----------|---------|
| `normalize_text(t text)` | Lowercase, strip non-alphanumeric, collapse whitespace |
| `extract_domain(email text)` | Returns domain part after @ |
| `is_free_email_domain(domain text)` | True for gmail, yahoo, hotmail, etc. (10 providers) |
| `tokenize_text(t text)` | Split into tokens, drop < 2 chars, keep 2-3 digit numbers |
| `remove_stopwords(tokens text[])` | Remove ~40 industry stopwords |
| `strong_tokens_fn(tokens text[])` | Keep tokens >= 4 chars with at least one letter, mixed alphanumeric, or acronyms >= 3 chars. Excludes numeric-only tokens |
| `array_intersect(a text[], b text[])` | Common elements between two arrays |
| `backfill_smart_matches(lookback_days, min_score, min_gap)` | Auto-link high-confidence matches |
| `get_match_suggestions(sale_id, lookback_days, limit_n)` | Read-only scoring for UI suggestions |
| `search_leads(search_term, limit_n)` | Manual search fallback |

### B. New Columns

**leads:** `match_text text`, `match_tokens text[]`, `strong_tokens text[]`, `email_domain text GENERATED ALWAYS AS (extract_domain(email)) STORED`

**sales:** `order_text text`, `match_text text`, `match_tokens text[]`, `strong_tokens text[]`, `email_domain text GENERATED ALWAYS AS (extract_domain(email)) STORED`

### C. Triggers

- `BEFORE INSERT OR UPDATE` on leads: computes match_text from name/email/phrase/sign_style/size_text/notes, then tokenizes
- `BEFORE INSERT OR UPDATE` on sales: computes match_text from order_id/email/product_name/order_text, then tokenizes

### D. Explicit Backfill (no trigger hack)

The migration runs direct UPDATE statements to populate all existing rows:
- Leads: concatenate text fields and compute tokens
- Sales: build `order_text` from raw_payload by concatenating ALL string values (excluding keys matching revenue/total/tax/shipping/discount/amount/qty/quantity/zip/postal/phone/price/cost/profit/manufacturing), then compute tokens

### E. Indexes

- B-tree on `leads(email_domain)`, `sales(email_domain)`, `leads(submitted_at)`, `sales(date)`
- GIN on `leads(strong_tokens)`, `sales(strong_tokens)`

### F. Constraint Update

Add `'domain_plus_keywords'` and `'keywords_strict'` to the `sales_match_method_check` constraint.

### G. Scoring Formula (used in both RPCs)

```text
Email exact match:              +100
Corporate domain match:          +50
Strong token overlap:            +15 each (cap 45)
General token overlap:            +3 each (cap 25)
Sign style exact match:          +15
Size number overlap:             +10
Recency <= 14 days:              +10
Recency 15-45 days:               +5
```

### H. Candidate Filtering (tightened)

A lead becomes a candidate ONLY if one of:
- Email exact match (case-insensitive trimmed)
- Strong token overlap >= 2
- Corporate domain match AND strong overlap >= 1

### I. Auto-Link Safety Gates

ALL must hold:
1. Top score >= 95 (default)
2. Gap to second-best >= 20 (or no second)
3. At least one of: email_exact, strong_overlap >= 2, domain + strong >= 1

Tie-breaker: when scores are equal, pick the most recent lead before the sale (ORDER BY score DESC, submitted_at DESC).

### J. match_reason

Each auto-linked sale gets a human-readable `match_reason` like: `"domain_match midpennbank.com; strong_overlap=2 (mpb, midpenn); recency=12d"`

---

## 2. Import Flow Changes (src/pages/Import.tsx)

### Sales Importer: Build `order_text`

When parsing sales CSV rows, build `order_text` by concatenating descriptive column values while excluding noise columns (revenue, total, tax, shipping, discount, amount, qty, quantity, zip, postal, phone, price, cost, profit, manufacturing). Only include values that contain at least one letter.

Add `order_text` to the `ParsedSale` interface and include it in the upsert payload.

### Post-Import Auto-Matching

After sales import, call both RPCs:
1. `backfill_email_matches()` (existing exact email)
2. `backfill_smart_matches({ lookback_days: 120, min_score: 95, min_gap: 20 })`

Show toast with combined results.

---

## 3. Attribution Inbox Changes (src/pages/Attribution.tsx)

### Remove Client-Side Smart Matching
- Remove import of `getSmartSuggestions` / `shouldAutoApply` from `smartMatch.ts`
- Remove the `candidateLeads` query (no more fetching 2000 leads)
- Remove the `suggestionsMap` memo

### Add "Backfill Smart Matches" Button
Calls `backfill_smart_matches` RPC, shows toast with linked_count, refreshes inbox.

### Add "Link" Button per Sale Card
Opens a dialog that:
1. Loads suggestions from `get_match_suggestions(sale_id)` RPC
2. Shows each suggestion with: lead name, email, phrase, submitted_at, score, reason chips, "Confirm Link" button
3. If no suggestions, shows a search box (manual fallback) calling `search_leads(term)` RPC
4. "Confirm Link" updates the sale (match_method='manual', sale_type='new_lead') and refreshes

### Sale Card Suggestions
Each sale card still shows inline suggestions loaded on-demand from `get_match_suggestions`.

---

## Technical Details

### Sales `date` column
The existing `date` column (type `date`) is kept. RPCs use `coalesce(s.date::timestamptz, s.created_at, now())` for sale_time.

### order_text exclusion rules (Import)
Columns are excluded if their normalized header matches: revenue, total, tax, shipping, discount, amount, qty, quantity, zip, postal, phone, price, cost, profit, manufacturing. Additionally, values that are purely numeric or money-like (matching `/^[\$\d,.\-\s]+$/`) are excluded.

### strong_tokens_fn rules
- Tokens >= 4 chars that contain at least one letter
- Mixed letter+digit tokens of any length (e.g., "jrla2026")
- Tokens >= 3 chars that are all letters (acronyms like "mpb", "agls")
- Excludes: numeric-only tokens (sizes handled by separate size-overlap scoring)

### Files Modified

| File | Change |
|------|--------|
| New migration SQL | Helper functions, columns, triggers, explicit backfill, indexes, constraint update, 3 RPCs |
| `src/pages/Import.tsx` | Add order_text to ParsedSale, smart column filtering, include in upsert, call backfill_smart_matches after import |
| `src/pages/Attribution.tsx` | Remove client-side matching, add server-side suggestions via RPC, Link modal with search fallback, Backfill Smart Matches button |
| `src/integrations/supabase/types.ts` | Auto-updated with new columns/RPCs |

