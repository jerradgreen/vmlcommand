

# Deterministic Attribution Matching -- Implementation Plan

## Overview

Simple deterministic matching system replacing the previous multi-signal scoring engine. Prioritizes clarity and simplicity over probabilistic matching.

## Auto-Link Rules

A sale is auto-linked to a lead when ANY of these match (checked in order, first match wins):

| Rule | Condition | match_method |
|------|-----------|-------------|
| A | Exact email match (case-insensitive) | `email_exact` |
| B | Same corporate domain (non-free email) | `domain_match` |
| C | `sale.product_name ILIKE '%' \|\| lead.phrase \|\| '%'` | `phrase_match` |
| D | `lead.phrase ILIKE '%' \|\| sale.product_name \|\| '%'` | `phrase_match` |

All auto-links set `match_confidence = 100` and `sale_type = 'new_lead'`.

Tie-breaker: most recent lead before the sale (`submitted_at DESC`).

## Suggestion Rules (for UI)

Return leads matching ANY of:
- Same corporate domain
- `phrase ILIKE product_name`
- `product_name ILIKE phrase`
- `lead.name ILIKE product_name`
- `product_name ILIKE lead.name`

Ordered by `submitted_at DESC`, limit 5.

## What Was Removed

- Strong tokens / token overlap scoring
- Scoring formula (weighted points system)
- Recency boost
- min_score / min_gap safety gates
- Score display in UI (pts badges)

## RPCs

| Function | Purpose |
|----------|---------|
| `backfill_email_matches()` | Exact email linking (unchanged) |
| `backfill_smart_matches(lookback_days)` | Deterministic auto-linking (rules A-D) |
| `get_match_suggestions(p_sale_id, lookback_days, limit_n)` | Read-only suggestions for UI |
| `search_leads(search_term, limit_n)` | Manual search fallback (unchanged) |

## Files Modified

| File | Change |
|------|--------|
| Migration SQL | Replaced `backfill_smart_matches` and `get_match_suggestions` RPCs |
| `src/pages/Attribution.tsx` | Removed score display, simplified RPC calls |
| `src/pages/Import.tsx` | Simplified `runAutoMatching` call |
