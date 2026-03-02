

## Add Web Search to Financial AI Chat

### What Changes
Add a `search_web` tool to the `financial-chat` edge function using the Perplexity API, and expand the system prompt with tax consultant capabilities. The AI will be able to:
1. Query your database for actual numbers (existing `run_sql` tool)
2. Search the web for current tax rates, IRS rules, deadlines, and regulations (new `search_web` tool)
3. Combine both to give data-backed, current tax and financial advice

### Implementation Steps

1. **Connect Perplexity** -- link the Perplexity connector so the API key is available as an environment variable in edge functions.

2. **Update `supabase/functions/financial-chat/index.ts`**:
   - Expand the system prompt with a tax consultant persona (deductions, estimated taxes, entity structures, sales tax, year-end planning, self-employment tax)
   - Add a second tool `search_web` alongside `run_sql` -- calls Perplexity's `sonar` model to search for current tax/financial information
   - Include instructions for the AI to use `search_web` when questions involve current rates, deadlines, or recent law changes
   - Add disclaimer instructions: always recommend consulting a licensed CPA for final decisions
   - Handle the new tool call in the tool-calling loop

3. **Redeploy the `financial-chat` edge function**

### Technical Detail
- Perplexity API called via `https://api.perplexity.ai/chat/completions` with the `sonar` model
- The `search_web` tool takes a `query` string parameter
- Results include citations which the AI can reference in its answers
- No frontend changes needed -- the chat component already handles streaming responses
- No database changes needed

