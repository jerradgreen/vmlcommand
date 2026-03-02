

## AI Financial Chat for Dashboard

### What We're Building
A chat widget on the Dashboard page where you can ask natural-language questions about your financial data — transactions, revenue, costs, projections, vendor totals, etc. The AI will query your database and return answers, just like the questions you've been asking me.

### Architecture

```text
┌─────────────────────────────────┐
│  Dashboard Page                 │
│  ┌───────────────────────────┐  │
│  │ Existing metric cards...  │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 💬 Financial AI Chat      │  │
│  │  Collapsible card/panel   │  │
│  │  Message history          │  │
│  │  Input box + send button  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
         │
         ▼  (streamed SSE)
┌─────────────────────────────────┐
│  Edge Function: financial-chat  │
│  1. Receives user question      │
│  2. Builds system prompt with   │
│     - DB schema context         │
│     - Available tables/columns  │
│     - SQL tool for querying     │
│  3. Calls Lovable AI gateway    │
│     (google/gemini-3-flash)     │
│  4. Uses tool-calling to run    │
│     read-only SQL queries       │
│  5. Streams final answer back   │
└─────────────────────────────────┘
```

### Implementation Steps

1. **Create edge function `supabase/functions/financial-chat/index.ts`**
   - System prompt describing the full database schema (financial_transactions, sales, leads, bills, cogs_payments, etc.) with column names and category taxonomies
   - Tool-calling with a `run_sql` tool that executes read-only SELECT queries against the database using the service role key
   - Safety: only allow SELECT statements, reject anything with INSERT/UPDATE/DELETE/DROP
   - Streams the AI response back via SSE
   - Uses Lovable AI gateway with `google/gemini-3-flash-preview`

2. **Create `src/components/FinancialChat.tsx`**
   - Collapsible card at the bottom of the dashboard
   - Message list with user/assistant bubbles, markdown rendering
   - Input field with send button
   - Token-by-token streaming display
   - Conversation history maintained in local state (sent with each request for context)

3. **Update `src/pages/Dashboard.tsx`**
   - Add the `FinancialChat` component at the bottom of the dashboard

4. **Update `supabase/config.toml`**
   - Add `[functions.financial-chat]` with `verify_jwt = false`

### Technical Details

**System prompt** will include:
- Complete schema of `financial_transactions` (columns, category taxonomy like `cogs`, `advertising_media`, `domestic_manufacturing`, etc.)
- Schema of `sales`, `leads`, `bills`, `cogs_payments`, `shopify_capital_loans`
- Instructions on how amounts work (negative = outflow, positive = inflow for transactions)
- The `txn_type`, `txn_category`, `txn_subcategory` taxonomy so the AI knows how to filter
- Date formatting conventions
- Instructions to use `ABS(amount)` for cost totals, format as currency, etc.

**SQL tool-calling flow:**
- AI receives the question, decides what SQL to run
- Edge function executes the SQL (read-only, validated) using Supabase service role
- Results are passed back to the AI to formulate a natural-language answer
- Final answer is streamed to the client

**Safety guardrails:**
- SQL validation: regex check that query starts with SELECT (no mutations)
- Row limit enforcement (LIMIT 1000 appended if not present)
- Service role used server-side only, never exposed to client

