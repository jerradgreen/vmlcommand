import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("INGEST_API_KEY");
  if (!apiKey || apiKey !== expectedKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const external_account_id = typeof body.account_id === "string" ? body.account_id.trim() : "";
  const rawBalance = body.balance != null ? Number(body.balance) : NaN;
  const account_name = typeof body.account_name === "string" ? body.account_name.trim() : "";

  if (!external_account_id) {
    return new Response(
      JSON.stringify({ ok: false, error: "account_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (isNaN(rawBalance)) {
    return new Response(
      JSON.stringify({ ok: false, error: "balance is required and must be numeric" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!account_name) {
    return new Response(
      JSON.stringify({ ok: false, error: "account_name is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Determine account_type and normalize balance
  const account_type = rawBalance < 0 ? "credit_card" : "bank";
  const balance = account_type === "credit_card" ? Math.abs(rawBalance) : rawBalance;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const row = {
      source_system: typeof body.source_system === "string" ? body.source_system : "fintable",
      external_account_id,
      account_name,
      institution: typeof body.institution === "string" ? body.institution : null,
      account_type,
      balance,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("account_balances")
      .upsert(row, { onConflict: "external_account_id,source_system" });

    if (error) {
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({ ok: true, duplicate: true, external_account_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, external_account_id, account_type, balance }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
