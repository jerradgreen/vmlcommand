

# Attribution Matching -- Implementation Plan

## Overview

Simple, productive attribution system: strict auto-linking + broad pre-computed suggestions for fast manual confirmation.

## Auto-Link Rules (strict, safe)

| Rule | Condition | match_method |
|------|-----------|-------------|
| A | Exact email match (case-insensitive) | `email_exact` |
| B | Non-free domain match + ≥1 strong token overlap | `domain_match` |
| C | Exact name match (sale First+Last = lead.name) | `manual` |

All auto-links set `match_confidence = 100` and `sale_type = 'new_lead'`.

## Suggestion Scoring (for UI, no auto-link)

| Signal | Points |
|--------|--------|
| Email exact | +100 |
| Corporate domain match | +40 |
| Exact name match | +30 |
| Partial name (first/last) | +15 each |
| Strong token overlap | +10 each (cap 40) |
| Phrase/product overlap | +20 each direction |
| Recency ≤14d | +15 |
| Recency 15-45d | +8 |
| Recency 46-90d | +3 |

## Pre-Suggest System

- `bulk_generate_suggestions(lookback_days)` fills `suggested_lead_id`, `suggested_score`, `suggested_reasons` on each unmatched sale
- UI shows top suggestion on each card with one-click Confirm
- "More Options" expands to show all candidates from `get_match_suggestions`

## Diagnostics RPC

`get_attribution_diagnostics()` returns: unmatched count, with/without suggestions, free/corporate/no-email breakdown, top 20 tokens.

## RPCs

| Function | Purpose |
|----------|---------|
| `backfill_email_matches()` | Exact email linking |
| `backfill_smart_matches(lookback_days)` | Safe auto-linking (email + domain+tokens + exact name) |
| `bulk_generate_suggestions(lookback_days)` | Pre-compute best candidate per unmatched sale |
| `get_match_suggestions(p_sale_id, lookback_days, limit_n)` | On-demand scored suggestions |
| `get_attribution_diagnostics()` | Debug stats |
| `search_leads(search_term, limit_n)` | Manual search fallback |

## Sales Columns Added

| Column | Purpose |
|--------|---------|
| `suggested_lead_id` | Pre-computed best candidate (no link) |
| `suggested_score` | Score of best candidate |
| `suggested_reasons` | Array of reason strings |

## order_text Rebuild

All sales `order_text` rebuilt from `raw_payload` using ALL text values except noise fields (Date, Price, Profit, Quantity, Order ID, totals, costs, Email).
