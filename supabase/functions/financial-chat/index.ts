import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a financial analyst AI assistant for a neon sign business. You have access to a PostgreSQL database via a tool called "run_sql". You can ONLY run SELECT queries.

## Database Schema

### financial_transactions
The main transaction ledger. Each row is a bank/card transaction.
Columns: id (uuid), txn_date (date), amount (numeric — negative=outflow, positive=inflow), description (text), vendor (text), account_name (text), account_id (text), txn_type (text — 'business' or 'personal'), txn_category (text), txn_subcategory (text), source_system (text), external_id (text), is_locked (bool), is_recurring (bool), category (text — legacy), description_norm (text), account_name_norm (text).

IMPORTANT: For cost/expense totals, always use ABS(amount) since outflows are stored as negative numbers.
IMPORTANT: txn_category='transfer' is NOT an expense — always exclude it from expense totals.
IMPORTANT: txn_category='revenue' rows are deposit/income transactions.

#### Category Taxonomy (txn_type='business'):
- COGS categories: cogs (subcats: domestic_manufacturing, international_manufacturing, domestic_supplier, overseas_supplier, raw_materials, custom_parts), shipping_cogs (freight_international, freight_domestic, ltl_shipping, parcel_shipping), merchant_fees (shopify_payments, stripe, paypal, adp, other), packaging (boxes, foam, tape, labels, misc)
- Advertising: advertising_media (google_ads, meta_ads, bing_ads, other)
- Overhead: software, subscriptions, contractor_payments, office_expense, rent, utilities, insurance, equipment, creative_services, seo, advertising_tools, education, taxes, bank_fees, interest
- Non-expense: transfer (credit_card_payment, owner_transfer, internal_transfer, loan_repayment, platform_payout, owner_contribution, customer_payment), revenue, other_income

#### Personal categories (txn_type='personal'):
owner_draw, mortgage, groceries, auto, family, personal_misc

### sales
Shopify orders and custom sales.
Columns: id (uuid), order_id (text — e.g. "#VML1234"), date (date), revenue (numeric), email (text), product_name (text), sale_type (text — 'new_lead', 'repeat_direct', 'unknown'), lead_id (uuid — FK to leads), match_method (text), match_confidence (int), manufacturing_status (text — 'unpaid', 'partial', 'paid'), estimated_cogs_pct (numeric — default 0.50), source_system (text).

### leads
Quote requests from Cognito Forms.
Columns: id (uuid), lead_id (text), name (text), email (text), phone (text), phrase (text — the neon sign text), sign_style (text), size_text (text), budget_text (text), submitted_at (timestamptz), status (text), cognito_form (text), cognito_entry_number (text).

### bills
Overhead bills/invoices.
Columns: id (uuid), vendor (text), amount (numeric), date (date), due_date (date), status (text — 'paid','scheduled','due'), category (text), notes (text).

### cogs_payments
Manufacturing cost payments.
Columns: id (uuid), vendor (text), amount (numeric), date (date), due_date (date), status (text), category (text), order_id (text), sale_id (uuid — FK to sales).

### shopify_capital_loans
Columns: id (uuid), name (text), payback_cap (numeric), repayment_rate (numeric), start_order_number_int (int), start_date (date), status (text — 'active','paid_off').

### account_balances
Current bank/card balances.
Columns: id (uuid), account_name (text), account_type (text), balance (numeric), institution (text), external_account_id (text).

### cogs_allocations
Links transactions to sales for COGS tracking.
Columns: id (uuid), sale_id (uuid), financial_transaction_id (uuid), allocated_amount (numeric), vendor_name (text), allocation_date (date).

## Instructions
- Always format currency as USD with commas (e.g. $12,345.67)
- Use ABS(amount) for expense/cost totals from financial_transactions
- Exclude txn_category='transfer' from expense calculations
- When asked about "manufacturing" costs, look at txn_subcategory IN ('domestic_manufacturing', 'international_manufacturing')
- When asked about vendors, use the vendor column in financial_transactions
- For revenue, use the sales table (SUM of revenue column) or financial_transactions where txn_category='revenue'
- Always add LIMIT 1000 if the user doesn't specify a limit
- Present data clearly with totals, breakdowns, and context
- If you're unsure about a query, explain your assumptions
- Today's date is ${new Date().toISOString().split("T")[0]}
`;

function validateSQL(sql: string): boolean {
  const trimmed = sql.trim().replace(/^[\s\n\r]+/, "");
  if (!/^SELECT\b/i.test(trimmed)) return false;
  const forbidden =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC)\b/i;
  if (forbidden.test(trimmed)) return false;
  return true;
}

function ensureLimit(sql: string): string {
  if (!/\bLIMIT\b/i.test(sql)) {
    return sql.replace(/;?\s*$/, " LIMIT 1000");
  }
  return sql;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const tools = [
      {
        type: "function",
        function: {
          name: "run_sql",
          description:
            "Execute a read-only SQL SELECT query against the PostgreSQL database. Returns rows as JSON array.",
          parameters: {
            type: "object",
            properties: {
              sql: {
                type: "string",
                description: "A valid SELECT SQL query",
              },
            },
            required: ["sql"],
            additionalProperties: false,
          },
        },
      },
    ];

    // Initial AI call with tools
    let aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    let maxIterations = 5;
    let finalResponse: Response | null = null;

    while (maxIterations-- > 0) {
      const aiResp = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: aiMessages,
            tools,
            stream: false,
          }),
        }
      );

      if (!aiResp.ok) {
        const status = aiResp.status;
        const text = await aiResp.text();
        console.error("AI gateway error:", status, text);
        if (status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: "AI gateway error" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const aiData = await aiResp.json();
      const choice = aiData.choices[0];
      const msg = choice.message;

      // If the AI wants to call tools
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        aiMessages.push(msg);

        for (const toolCall of msg.tool_calls) {
          if (toolCall.function.name === "run_sql") {
            let args: { sql: string };
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch {
              aiMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: "Invalid tool arguments" }),
              });
              continue;
            }

            if (!validateSQL(args.sql)) {
              aiMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  error: "Only SELECT queries are allowed. No mutations permitted.",
                }),
              });
              continue;
            }

            const safeSql = ensureLimit(args.sql);
            console.log("Executing SQL:", safeSql);

            try {
              const { data, error } = await supabase.rpc("", {}).throwOnError
                ? { data: null, error: "skip" }
                : { data: null, error: null };

              // Use raw postgres query via supabase rest
              const pgResp = await fetch(
                `${supabaseUrl}/rest/v1/rpc/`,
                {
                  method: "POST",
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                    "Content-Type": "application/json",
                  },
                }
              );

              // Actually use the postgres connection directly
              const queryResp = await fetch(
                `${supabaseUrl}/rest/v1/`,
                {
                  method: "GET",
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                  },
                }
              );

              // Use the DB URL for direct SQL
              const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
              const { default: postgres } = await import(
                "https://deno.land/x/postgresjs@v3.4.5/mod.js"
              );
              const sql_client = postgres(dbUrl, { max: 1 });
              const rows = await sql_client.unsafe(safeSql);
              await sql_client.end();

              aiMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  row_count: rows.length,
                  rows: rows.slice(0, 200),
                }),
              });
            } catch (e) {
              console.error("SQL execution error:", e);
              aiMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  error: `SQL error: ${e instanceof Error ? e.message : String(e)}`,
                }),
              });
            }
          }
        }
        continue;
      }

      // No tool calls — we have the final answer. Now stream it.
      const finalContent = msg.content || "I couldn't generate a response.";

      // Make a streaming call with the final conversation
      const streamResp = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: aiMessages,
            stream: true,
          }),
        }
      );

      if (!streamResp.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to stream response" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(streamResp.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Too many tool iterations" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("financial-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
