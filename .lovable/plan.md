

## Plan: Fix Misclassified Transactions + Add Rule Audit View

### The Problem
Your rules have a serious false-positive issue. The `contains` match on short/common words is catching unrelated transactions:

- **"Ace" rule** (171 txns as personal): Caught 77 Shopify payouts (SHOPPAYINSTALL contains "ace"), 64 Facebook ad charges (FACEBK contains "ace"), plus only 19 actual Ace Hardware purchases
- **"Intuit" rule** (64 txns as software): Caught 6 customer payment deposits ($46,620 total) that should be `transfer/customer_payment`
- **"WIRE" rule** (17 txns as cogs): Caught 2 inbound customer wire payments ($65,630) that should be `transfer/customer_payment`
- **"Shell"** (165 txns), **"apple"** (92 txns), **"UPS"** (10 txns) — these seem correct but are high volume

1,691 of 2,190 transactions were classified by rules, so the blast radius is large.

### Step 1 — Database: Fix the worst false positives now

Run SQL updates to:

1. **Fix 77 Shopify payouts** caught by "Ace" rule → set to `business / transfer / platform_payout / Shopify`
2. **Fix 64 Facebook ad charges** caught by "Ace" rule → set to `business / advertising_media / meta_ads`
3. **Fix 6 Intuit deposits** (positive amounts) caught by "Intuit" rule → set to `business / transfer / customer_payment`
4. **Fix 2 inbound wire transfers** caught by "WIRE" rule → set to `business / transfer / customer_payment`

### Step 2 — Database: Add a higher-priority Shopify payout rule

Insert a new rule: `contains "SHOPPAYINSTALL"` at priority 5, assigning `business / transfer / platform_payout / Shopify` — so this always wins over "Ace" in the future.

### Step 3 — UI: Add "Rule Audit" filter to Transactions page

Add a new filter dropdown: **"Classified by Rule"** that lets you pick a specific rule and see all transactions it touched. This lets you:
- Review each rule's impact
- Spot false positives
- Bulk-select and relabel the bad ones using the existing Bulk Label Bar

The dropdown will show rules sorted by how many transactions they affected (e.g., "Ace — 171 txns", "Shell — 165 txns").

### Step 4 — Deactivate the "Ace" rule

Deactivate (not delete) the "Ace" rule since it's too generic. The actual Ace Hardware transactions (19) can be relabeled manually or with a more specific rule like "Carolina Forest Ace".

### Files modified
- New migration: fix false positives + insert Shopify rule + deactivate "Ace" rule
- `src/pages/Transactions.tsx` — add "Classified by Rule" filter dropdown

