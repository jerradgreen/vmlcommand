import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const PLATFORM_MAP: Record<string, string> = {
  google: "google_ads",
  googleads: "google_ads",
  adwords: "google_ads",
  google_ads: "google_ads",
  meta: "meta_ads",
  facebook: "meta_ads",
  instagram: "meta_ads",
  meta_ads: "meta_ads",
  bing: "bing_ads",
  microsoft_ads: "bing_ads",
  microsoftads: "bing_ads",
  bing_ads: "bing_ads",
};

function normalizePlatform(raw: unknown): string {
  if (typeof raw !== "string") return "other";
  const slug = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return PLATFORM_MAP[slug] ?? "other";
}

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
  const platform = normalizePlatform(body.platform);
  const amount = body.amount != null ? Number(body.amount) : NaN;

  if (!date) {
    return new Response(
      JSON.stringify({ ok: false, error: "date is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (!body.platform) {
    return new Response(
      JSON.stringify({ ok: false, error: "platform is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (isNaN(amount)) {
    return new Response(
      JSON.stringify({ ok: false, error: "amount is required and must be numeric" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const notes = typeof body.notes === "string" ? body.notes : null;
  let external_id = typeof body.external_id === "string" && body.external_id.trim()
    ? body.external_id.trim()
    : null;

  if (!external_id) {
    const hashInput = `${date}|${platform}|${amount}|${notes ?? ""}`;
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
      platform,
      category: "ads",
      amount,
      notes,
      raw_payload: body,
      ingested_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("expenses")
      .upsert(row, { onConflict: "source_system,external_id" });

    if (error) {
      if (error.code === "23505" || (error.message && error.message.includes("duplicate key"))) {
        return new Response(
          JSON.stringify({ ok: true, duplicate: true, external_id, platform }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, external_id, platform }),
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
