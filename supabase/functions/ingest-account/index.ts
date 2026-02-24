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
  // Try ISO datetime
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

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

  const account_id = typeof body.account_id === "string" ? body.account_id.trim() : "";
  const balance = body.balance != null ? Number(body.balance) : NaN;

  if (!account_id) {
    return new Response(
      JSON.stringify({ ok: false, error: "account_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (isNaN(balance)) {
    return new Response(
      JSON.stringify({ ok: false, error: "balance is required and must be numeric" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Normalize last_update if provided
  let last_update: string | null = null;
  if (typeof body.last_update === "string" && body.last_update.trim()) {
    const normalized = normalizeDate(body.last_update.trim());
    if (normalized) {
      // If it's a date-only string, convert to ISO timestamp
      last_update = normalized.length === 10 ? `${normalized}T00:00:00Z` : normalized;
    } else {
      last_update = body.last_update.trim();
    }
  }

  // raw_payload: use body.raw_payload if present, else store entire body
  const raw_payload = body.raw_payload != null ? body.raw_payload : body;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const row = {
      source_system: typeof body.source_system === "string" ? body.source_system : "fintable",
      account_id,
      account_name: typeof body.account_name === "string" ? body.account_name : null,
      institution: typeof body.institution === "string" ? body.institution : null,
      balance,
      currency: typeof body.currency === "string" ? body.currency : null,
      last_update,
      raw_payload,
      ingested_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("financial_accounts")
      .upsert(row, { onConflict: "source_system,account_id" });

    if (error) {
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({ ok: true, duplicate: true, account_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, account_id }),
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
