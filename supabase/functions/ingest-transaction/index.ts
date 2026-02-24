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
  return null;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function stableHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const STABLE_ID_KEYS = ["id", "transaction_id", "txn_id", "entry_id", "plaid_transaction_id"];

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

  const rawDate = typeof body.txn_date === "string" ? body.txn_date.trim() : "";
  const amount = body.amount != null ? Number(body.amount) : NaN;
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!rawDate) {
    return new Response(
      JSON.stringify({ ok: false, error: "txn_date is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (isNaN(amount)) {
    return new Response(
      JSON.stringify({ ok: false, error: "amount is required and must be numeric" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!description) {
    return new Response(
      JSON.stringify({ ok: false, error: "description is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const txn_date = normalizeDate(rawDate);
  if (!txn_date) {
    return new Response(
      JSON.stringify({ ok: false, error: "txn_date format not recognized. Use YYYY-MM-DD or MM/DD/YYYY" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const raw_payload = (body.raw_payload != null ? body.raw_payload : body) as Record<string, unknown>;

  const account_id = typeof body.account_id === "string" ? body.account_id.trim() : null;
  const account_name = typeof body.account_name === "string" ? body.account_name.trim() : null;

  // Compute normalized fields
  const description_norm = normalizeText(description);
  const account_name_norm = account_name ? normalizeText(account_name) : null;

  // Determine external_id
  let external_id: string | null = null;
  if (raw_payload && typeof raw_payload === "object") {
    for (const key of STABLE_ID_KEYS) {
      const val = (raw_payload as Record<string, unknown>)[key];
      if (val != null && typeof val === "string" && val.trim()) {
        external_id = val.trim();
        break;
      }
      if (val != null && typeof val === "number") {
        external_id = String(val);
        break;
      }
    }
  }

  if (!external_id) {
    const pendingVal = raw_payload && typeof raw_payload === "object" ? (raw_payload as Record<string, unknown>).pending ?? "" : "";
    const postedVal = raw_payload && typeof raw_payload === "object"
      ? ((raw_payload as Record<string, unknown>).posted_at ?? (raw_payload as Record<string, unknown>).date ?? "")
      : "";
    const idVal = raw_payload && typeof raw_payload === "object" ? (raw_payload as Record<string, unknown>).id ?? "" : "";
    const hashInput = `${txn_date}|${amount}|${description}|${account_id ?? ""}|${idVal}|${pendingVal}|${postedVal}`;
    external_id = await stableHash(hashInput);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const row = {
      source_system: typeof body.source_system === "string" ? body.source_system : "fintable",
      external_id,
      txn_date,
      amount,
      description,
      description_norm,
      account_name_norm,
      category: typeof body.category === "string" ? body.category : null,
      account_name,
      account_id,
      raw_payload,
      ingested_at: new Date().toISOString(),
    };

    const { data: upsertData, error } = await supabase
      .from("financial_transactions")
      .upsert(row, { onConflict: "source_system,external_id" })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505" || (error.message && error.message.includes("duplicate key"))) {
        return new Response(
          JSON.stringify({ ok: true, duplicate: true, external_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    // Classify via rules (best-effort, never fail ingestion)
    let classification: unknown = null;
    if (upsertData?.id) {
      try {
        const { data: classResult } = await supabase.rpc("apply_transaction_rules", {
          p_txn_id: upsertData.id,
        });
        classification = classResult;
      } catch (_classErr) {
        // Classification failure should not block ingestion
      }
    }

    return new Response(
      JSON.stringify({ ok: true, external_id, id: upsertData?.id, classification }),
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
