import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

async function stableHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(hash));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
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

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const vendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
  const amount = body.amount != null ? Number(body.amount) : NaN;

  if (!date) {
    return new Response(
      JSON.stringify({ ok: false, error: "date is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!vendor) {
    return new Response(
      JSON.stringify({ ok: false, error: "vendor is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (isNaN(amount)) {
    return new Response(
      JSON.stringify({ ok: false, error: "amount is required and must be numeric" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const category = typeof body.category === "string" ? body.category.toLowerCase().trim() : "overhead";
  const status = typeof body.status === "string" ? body.status.toLowerCase().trim() : "paid";
  const due_date = typeof body.due_date === "string" ? body.due_date.trim() : null;
  const notes = typeof body.notes === "string" ? body.notes : null;

  let external_id = typeof body.external_id === "string" && body.external_id.trim()
    ? body.external_id.trim()
    : null;

  if (!external_id) {
    const hashInput = `${date}|${vendor}|${amount}|${category}|${notes ?? ""}|${due_date ?? ""}`;
    external_id = await stableHash(hashInput);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const row = {
      source_system: "api",
      external_id,
      date,
      vendor,
      category,
      amount,
      status,
      due_date,
      notes,
      raw_payload: body,
      ingested_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("bills")
      .upsert(row, { onConflict: "source_system,external_id" });

    if (error) {
      if (error.code === "23505" || (error.message && error.message.includes("duplicate key"))) {
        return new Response(
          JSON.stringify({ ok: true, duplicate: true, external_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, external_id }),
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
