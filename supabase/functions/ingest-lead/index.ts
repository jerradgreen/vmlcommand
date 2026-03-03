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
    const row: Record<string, unknown> = {
      source_system: "cognito",
      external_id,
      lead_id: `CF-webhook-${external_id}`,
      cognito_form: (typeof body.cognito_form === "string" && body.cognito_form) || "webhook",
      cognito_entry_number: external_id,
      name: body.name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      phrase: body.phrase ?? null,
      sign_style: body.sign_style ?? null,
      size_text: body.size_text ?? null,
      budget_text: body.budget_text ?? null,
      notes: body.notes ?? null,
      submitted_at: body.submitted_at ?? new Date().toISOString(),
      raw_payload: body,
      ingested_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("leads").upsert(row, {
      onConflict: "source_system,external_id",
    });

    if (error) throw error;

    await supabase.from("ingestion_logs").insert({
      source_system: "cognito",
      external_id,
      status: "ok",
    });

    // Fire-and-forget SMS alert via TextMagic
    try {
      const tmUser = Deno.env.get("TEXTMAGIC_USERNAME");
      const tmKey = Deno.env.get("TEXTMAGIC_API_KEY");
      const tmFrom = Deno.env.get("TEXTMAGIC_FROM");
      const alertPhone = Deno.env.get("ALERT_PHONE");

      if (tmUser && tmKey && tmFrom && alertPhone) {
        const smsText = [
          "🔔 NEW LEAD",
          `Name: ${body.name || "—"}`,
          `Phone: ${body.phone || "—"}`,
          `Wants: "${body.phrase || "—"}"`,
          `Style: ${body.sign_style || "—"}`,
          `Size: ${body.size_text || "—"}`,
          `Budget: ${body.budget_text || "—"}`,
          `Form: ${row.cognito_form}`,
        ].join("\n");

        const smsRes = await fetch("https://rest.textmagic.com/api/v2/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-TM-Username": tmUser,
            "X-TM-Key": tmKey,
          },
          body: new URLSearchParams({
            text: smsText,
            phones: alertPhone.replace(/^\+/, ""),
            sendingPhone: tmFrom.replace(/^\+/, ""),
          }).toString(),
        });

        if (!smsRes.ok) {
          console.error("TextMagic SMS failed:", smsRes.status, await smsRes.text());
        } else {
          console.log("SMS alert sent for lead", external_id);
        }
      }
    } catch (smsErr) {
      console.error("SMS alert error (non-blocking):", smsErr);
    }

    return new Response(
      JSON.stringify({ ok: true, external_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : (typeof err === 'object' && err !== null && 'message' in err) ? String((err as Record<string, unknown>).message) : JSON.stringify(err);

    try {
      await supabase.from("ingestion_logs").insert({
        source_system: "cognito",
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
