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
    const parseJsonLike = (value: unknown): unknown => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      const looksJson =
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"));
      if (!looksJson) return value;
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    };

    const toObject = (value: unknown): Record<string, unknown> | null => {
      const parsed = parseJsonLike(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    };

    const bodyObj = toObject(body) ?? body;
    const envelopeKeys = [
      "payload",
      "data",
      "entry",
      "submission",
      "fields",
      "form_response",
      "body",
      "record",
    ];

    const envelopeObjects = envelopeKeys
      .map((k) => toObject((bodyObj as Record<string, unknown>)[k]))
      .filter((v): v is Record<string, unknown> => Boolean(v));

    const pickValue = (...keys: string[]): unknown => {
      const sources: Record<string, unknown>[] = [bodyObj as Record<string, unknown>, ...envelopeObjects];
      for (const source of sources) {
        for (const key of keys) {
          const val = source[key];
          if (val !== undefined && val !== null && !(typeof val === "string" && val.trim() === "")) {
            return val;
          }
        }
      }
      return null;
    };

    console.log("ingest-lead payload keys", {
      topLevel: Object.keys(bodyObj as Record<string, unknown>),
      envelopeKeys: envelopeObjects.map((obj) => Object.keys(obj)),
    });

    const row: Record<string, unknown> = {
      source_system: "cognito",
      external_id,
      lead_id: `CF-webhook-${external_id}`,
      cognito_form: (typeof pickValue("cognito_form", "form", "form_name") === "string" && pickValue("cognito_form", "form", "form_name")) || "webhook",
      cognito_entry_number: String(pickValue("entry_number", "cognito_entry_number", "external_id") ?? external_id),
      name: pickValue("name", "full_name", "contact_name") ?? null,
      email: pickValue("email", "email_address") ?? null,
      phone: pickValue("phone", "phone_number", "mobile") ?? null,
      phrase: pickValue("phrase", "main_text", "text", "message", "custom_text", "inquiry", "details") ?? null,
      sign_style: pickValue("sign_style", "sign_type", "style", "product_type", "product", "What style of sign are you wanting us to make?") ?? null,
      size_text: pickValue("size_text", "main_text_size", "size", "dimensions") ?? null,
      budget_text: pickValue("budget_text", "budget", "budget_range", "price_range") ?? null,
      notes: pickValue("notes", "additional_notes", "comments") ?? null,
      submitted_at: pickValue("submitted_at", "date_submitted", "timestamp") ?? new Date().toISOString(),
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

    // ── TextMagic SMS alert — DISABLED (switching to different notification source)
    // To re-enable, uncomment the block below.
    /*
    try {
      const tmUser = Deno.env.get("TEXTMAGIC_USERNAME");
      const tmKey = Deno.env.get("TEXTMAGIC_API_KEY");
      const tmFrom = Deno.env.get("TEXTMAGIC_FROM");
      const alertPhone = Deno.env.get("ALERT_PHONE");

      if (tmUser && tmKey && tmFrom && alertPhone) {
        const asText = (v: unknown): string => {
          if (typeof v === "string") return v.trim();
          if (typeof v === "number" || typeof v === "boolean") return String(v);
          return "";
        };

        const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

        type FlatEntry = { key: string; rootKey: string; normKey: string; value: string };
        const flattenPayload = (input: unknown, prefix = "", root = ""): FlatEntry[] => {
          if (input === null || input === undefined) return [];

          if (Array.isArray(input)) {
            return input.flatMap((item, idx) => {
              const keyPath = prefix ? `${prefix}[${idx}]` : `[${idx}]`;
              const rootKey = root || prefix || `item_${idx}`;
              return flattenPayload(item, keyPath, rootKey);
            });
          }

          if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
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

        const flatEntries = flattenPayload({
          ...(bodyObj as Record<string, unknown>),
          _envelopes: envelopeObjects,
        });

        const pickByAliases = (aliases: string[]) => {
          const aliasNorms = aliases.map(normalizeKey);
          const hit = flatEntries.find((entry) =>
            aliasNorms.some((alias) =>
              entry.normKey === alias ||
              entry.normKey.endsWith(alias) ||
              entry.normKey.includes(alias)
            )
          );
          return hit?.value || "";
        };

        const pickByHeuristic = (patterns: string[]) => {
          const patternNorms = patterns.map(normalizeKey);
          const hit = flatEntries.find((entry) =>
            patternNorms.some((pattern) => entry.normKey.includes(pattern))
          );
          return hit?.value || "";
        };

        const styleText =
          asText(row.sign_style) ||
          pickByAliases(["sign_style", "sign_type", "style", "product_type", "product"]) ||
          pickByHeuristic(["style", "font", "mount", "finish", "material", "type"]) ||
          "—";

        const sizeText =
          asText(row.size_text) ||
          pickByAliases(["size_text", "main_text_size", "size", "dimensions"]) ||
          pickByHeuristic(["size", "dimension", "width", "height", "inch", "feet", "ft"]) ||
          "—";

        const budgetText =
          asText(row.budget_text) ||
          pickByAliases(["budget_text", "budget", "budget_range", "price_range"]) ||
          pickByHeuristic(["budget", "price", "cost", "range", "spend"]) ||
          "—";

        const explicitWants =
          asText(row.phrase) ||
          pickByAliases(["phrase", "main_text", "text", "message", "custom_text", "inquiry", "details"]) ||
          pickByHeuristic(["whatshoulditsay", "wording", "copy", "message", "phrase", "text", "line1", "lineone"]) ||
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
          .filter(({ rootKey, normKey }) => !excludedKeys.has(normalizeKey(rootKey)) && !excludedKeys.has(normKey))
          .map(({ key, value }) => `${key}: ${value}`)
          .slice(0, 8);

        const wantsSegments = Array.from(new Set([
          explicitWants,
          styleText !== "—" ? `Style: ${styleText}` : "",
          sizeText !== "—" ? `Size: ${sizeText}` : "",
          budgetText !== "—" ? `Budget: ${budgetText}` : "",
          ...extraDetails,
        ].filter(Boolean)));

        const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

        const wantsTextRaw = wantsSegments.length > 0
          ? wantsSegments.join(" | ")
          : `No inquiry details received in webhook payload | Received: ${allDetails.join(" | ") || "(empty payload)"}`;

        const wantsText = clip(wantsTextRaw, 230);

        let smsText = [
          "🔔 NEW LEAD",
          `Name: ${asText(row.name) || "—"}`,
          `Email: ${asText(row.email) || "—"}`,
          `Phone: ${asText(row.phone) || "—"}`,
          `Wants: "${wantsText}"`,
          `Style: ${styleText}`,
          `Size: ${sizeText}`,
          `Budget: ${budgetText}`,
          `Form: ${row.cognito_form}`,
        ].join("\n");

        if (smsText.length > 390) {
          smsText = [
            "🔔 NEW LEAD",
            `Name: ${asText(row.name) || "—"}`,
            `Email: ${asText(row.email) || "—"}`,
            `Phone: ${asText(row.phone) || "—"}`,
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
