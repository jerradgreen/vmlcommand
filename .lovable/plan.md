

# Implementation Plan: Transaction Classification + Rules System

## Summary
Implementing the fully approved plan with all tweaks, fixes, corrections, and the new composite index for scale. This involves:

1. **Database migration** -- transaction_rules table, financial_transactions columns, indexes (including the new composite index), trigger for match_value_norm sync, seed 10 rules, SQL functions with null-safety
2. **Edge function update** -- ingest-transaction gets normalizeText, description_norm, account_name_norm, and RPC classification call
3. **New shared utility** -- src/lib/normalizeText.ts
4. **New UI** -- Transactions page with two tabs (Transactions + Rules), TransactionEditSheet, RuleFormDialog
5. **Routing/nav** -- Add /transactions route and nav item

## Technical Details

### Migration SQL
- CREATE transaction_rules with match_value_norm column
- ALTER financial_transactions adding txn_type, txn_category, vendor, rule_id_applied, is_locked, classified_at, description_norm, account_name_norm
- 4 indexes on transaction_rules including `idx_transaction_rules_active_priority_created ON (is_active, priority, created_at DESC)`
- 6 indexes on financial_transactions new columns
- Trigger function + trigger for auto-normalizing match_value_norm on INSERT/UPDATE
- Backfill description_norm and account_name_norm
- Seed 10 rules (5 COGS + 2 transfer + 3 autopay)
- apply_transaction_rules(p_txn_id) with coalesce null-safety and match_value_norm matching
- apply_rules_to_unclassified(p_limit)

### Edge Function Changes
- Add normalizeText helper
- Include description_norm and account_name_norm in upsert
- After upsert, select row id and call apply_transaction_rules RPC
- Wrap classification in try/catch

### New Files
- src/lib/normalizeText.ts
- src/pages/Transactions.tsx (filterable table + rules tab)
- src/components/TransactionEditSheet.tsx (edit panel with owner_draw default)
- src/components/RuleFormDialog.tsx (create/edit rules with match_field dropdown)

### Modified Files
- src/App.tsx (add /transactions route)
- src/components/AppLayout.tsx (add Transactions nav with Banknote icon)
- supabase/functions/ingest-transaction/index.ts (normalizeText + classification)

