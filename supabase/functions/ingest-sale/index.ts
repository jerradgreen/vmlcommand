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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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

  const external_id = typeof body.external_id === "string" ? body.external_id.trim() : "";
  if (!external_id) {
    return new Response(
      JSON.stringify({ ok: false, error: "external_id is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const order_id = (typeof body.order_id === "string" && body.order_id) || `WH-${external_id}`;

    const row: Record<string, unknown> = {
      source_system: "google_sheets",
      external_id,
      order_id,
      date: body.date ?? null,
      email: body.email ?? null,
      product_name: body.product_name ?? null,
      revenue: body.revenue != null ? Number(body.revenue) : null,
      order_text: body.order_text ?? null,
      raw_payload: body,
      ingested_at: new Date().toISOString(),
    };

    // Upsert sale (dedupe on order_id which has a unique constraint)
    const { data: upserted, error } = await supabase
      .from("sales")
      .upsert(row, { onConflict: "order_id" })
      .select("id")
      .single();

    if (error) {
      // If it's still a duplicate key error, return 200 so Zapier retries don't fail
      if (error.code === "23505" || (error.message && error.message.includes("duplicate key"))) {
        return new Response(
          JSON.stringify({ ok: true, duplicate: true, external_id, order_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    // Run per-sale matching
    let match_result = null;
    if (upserted?.id) {
      const { data } = await supabase.rpc("match_sale_by_id", {
        p_sale_id: upserted.id,
      });
      match_result = data;
    }

    await supabase.from("ingestion_logs").insert({
      source_system: "google_sheets",
      external_id,
      status: "ok",
    });

    return new Response(
      JSON.stringify({ ok: true, external_id, order_id, match_result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err) ? String((err as Record<string, unknown>).message) : JSON.stringify(err);

    try {
      await supabase.from("ingestion_logs").insert({
        source_system: "google_sheets",
        external_id,
        status: "error",
        error_message: msg,
      });
    } catch { /* swallow */ }

    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
