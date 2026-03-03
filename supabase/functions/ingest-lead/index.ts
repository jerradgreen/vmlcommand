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
      phrase: body.phrase ?? body.main_text ?? null,
      sign_style: body.sign_style ?? body.sign_type ?? null,
      size_text: body.size_text ?? body.main_text_size ?? null,
      budget_text: body.budget_text ?? body.budget ?? null,
      notes: body.notes ?? body.additional_notes ?? null,
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
        const asText = (v: unknown): string => {
          if (typeof v === "string") return v.trim();
          if (typeof v === "number" || typeof v === "boolean") return String(v);
          if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
          return "";
        };

        const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

        type FlatEntry = { key: string; rootKey: string; normKey: string; value: string };
        const flattenPayload = (input: unknown, prefix = "", root = ""): FlatEntry[] => {
          if (input === null || input === undefined) return [];

          if (typeof input === "string" || typeof input === "number" || typeof input === "boolean" || Array.isArray(input)) {
            const value = asText(input);
            if (!value) return [];
            const key = prefix || "value";
            return [{ key, rootKey: root || key, normKey: normalizeKey(key), value }];
          }

          if (typeof input === "object") {
            return Object.entries(input as Record<string, unknown>).flatMap(([k, v]) => {
              const keyPath = prefix ? `${prefix}.${k}` : k;
              const rootKey = root || k;
              return flattenPayload(v, keyPath, rootKey);
            });
          }

          return [];
        };

        const flatEntries = flattenPayload(body);

        const pickByAliases = (aliases: string[]) => {
          const aliasNorms = aliases.map(normalizeKey);
          const hit = flatEntries.find((entry) =>
            aliasNorms.some((alias) => entry.normKey === alias || entry.normKey.endsWith(alias))
          );
          return hit?.value || "";
        };

        const styleText =
          asText(row.sign_style) ||
          pickByAliases(["sign_style", "sign_type", "style", "product_type", "product"]) ||
          "—";

        const sizeText =
          asText(row.size_text) ||
          pickByAliases(["size_text", "main_text_size", "size", "dimensions"]) ||
          "—";

        const budgetText =
          asText(row.budget_text) ||
          pickByAliases(["budget_text", "budget", "budget_range", "price_range"]) ||
          "—";

        const explicitWants =
          asText(row.phrase) ||
          pickByAliases(["phrase", "main_text", "text", "message", "custom_text", "inquiry", "details"]) ||
          "";

        const excludedKeys = new Set([
          "name", "email", "phone", "externalid", "cognitoform", "submittedat",
          "phrase", "maintext", "text", "message", "customtext",
          "signstyle", "signtype", "sizetext", "maintextsize", "budgettext", "budget",
          "status", "entrynumber"
        ]);

        const allDetails = flatEntries
          .map(({ key, value }) => `${key}: ${value}`)
          .slice(0, 20);

        const extraDetails = flatEntries
          .filter(({ rootKey }) => !excludedKeys.has(normalizeKey(rootKey)))
          .map(({ key, value }) => `${key}: ${value}`)
          .slice(0, 8);

        const wantsSegments = [
          explicitWants,
          styleText !== "—" ? `Style: ${styleText}` : "",
          sizeText !== "—" ? `Size: ${sizeText}` : "",
          budgetText !== "—" ? `Budget: ${budgetText}` : "",
          ...extraDetails,
        ].filter(Boolean);

        const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

        const wantsTextRaw = wantsSegments.length > 0
          ? wantsSegments.join(" | ")
          : `No inquiry details received in webhook payload | Received: ${allDetails.join(" | ") || "(empty payload)"}`;

        const wantsText = clip(wantsTextRaw, 230);

        let smsText = [
          "🔔 NEW LEAD",
          `Name: ${body.name || "—"}`,
          `Email: ${body.email || "—"}`,
          `Phone: ${body.phone || "—"}`,
          `Wants: "${wantsText}"`,
          `Style: ${styleText}`,
          `Size: ${sizeText}`,
          `Budget: ${budgetText}`,
          `Form: ${row.cognito_form}`,
        ].join("\n");

        if (smsText.length > 390) {
          smsText = [
            "🔔 NEW LEAD",
            `Name: ${body.name || "—"}`,
            `Email: ${body.email || "—"}`,
            `Phone: ${body.phone || "—"}`,
            `Wants: "${clip(wantsText, 130)}"`,
            `Form: ${row.cognito_form}`,
          ].join("\n");
        }

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
