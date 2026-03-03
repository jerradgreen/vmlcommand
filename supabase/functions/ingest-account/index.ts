import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

function normalizeDate(raw: string): string | null {
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, mm, dd, yyyy] = mdyMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: x-api-key must match secret
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("INGEST_API_KEY");
  if (!apiKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const external_account_id =
    typeof body.account_id === "string" ? body.account_id.trim() : "";
  const raw_balance = body.balance != null ? Number(body.balance) : NaN;

  if (!external_account_id) {
    return new Response(JSON.stringify({ ok: false, error: "account_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (isNaN(raw_balance)) {
    return new Response(
      JSON.stringify({ ok: false, error: "balance is required and must be numeric" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Normalize last_update if provided
  let last_update: string | null = null;
  if (typeof body.last_update === "string" && body.last_update.trim()) {
    const normalized = normalizeDate(body.last_update.trim());
    if (normalized) {
      last_update = normalized.length === 10 ? `${normalized}T00:00:00Z` : normalized;
    } else {
      last_update = body.last_update.trim();
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const source_system =
      typeof body.source_system === "string" ? body.source_system : "fintable";

    // Override lookup
    const { data: override, error: overrideErr } = await supabase
      .from("account_type_overrides")
      .select("forced_account_type")
      .eq("source_system", source_system)
      .eq("external_account_id", external_account_id)
      .maybeSingle();

    if (overrideErr) throw overrideErr;

    const account_type =
      override?.forced_account_type ??
      (raw_balance < 0 ? "credit_card" : "bank");

    const normalized_balance =
      account_type === "credit_card" ? Math.abs(raw_balance) : raw_balance;

    const row = {
      source_system,
      external_account_id,
      account_name: typeof body.account_name === "string" ? body.account_name : "",
      institution: typeof body.institution === "string" ? body.institution : null,
      account_type,
      balance: normalized_balance,
      last_update,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("account_balances")
      .upsert(row, { onConflict: "source_system,external_account_id" });

    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});