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

/** Parse a single CSV line respecting quoted fields with escaped double-quotes */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push("");
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      let value = "";
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === ',') i++; // skip comma
    } else {
      // Unquoted field
      const next = line.indexOf(',', i);
      if (next === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, next));
        i = next + 1;
      }
    }
  }
  return fields;
}

/** Split CSV text into lines, handling newlines within quoted fields */
function splitCSVLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      if (current.trim()) lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
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

  let csvText: string;
  try {
    csvText = await req.text();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Could not read body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const allLines = splitCSVLines(csvText);
  if (allLines.length < 2) {
    return new Response(
      JSON.stringify({ ok: false, error: "No data rows found" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Skip header
  const dataLines = allLines.slice(1);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  // Process in batches of 200
  const BATCH = 200;
  for (let batchStart = 0; batchStart < dataLines.length; batchStart += BATCH) {
    const batchLines = dataLines.slice(batchStart, batchStart + BATCH);
    const rows: Record<string, unknown>[] = [];

    for (const line of batchLines) {
      try {
        const fields = parseCSVLine(line);
        // Columns: Date, Amount, Description, Category, Account, Attachment, Transaction ID, Raw Data
        const rawDate = (fields[0] ?? "").trim();
        const amount = parseFloat(fields[1] ?? "");
        const description = (fields[2] ?? "").trim();
        const category = (fields[3] ?? "").trim();
        const accountName = (fields[4] ?? "").trim();
        // fields[5] = Attachment (skip)
        const transactionId = (fields[6] ?? "").trim();
        const rawDataStr = (fields[7] ?? "").trim();

        if (!rawDate || isNaN(amount) || !description) {
          skipped++;
          continue;
        }

        const txnDate = normalizeDate(rawDate);
        if (!txnDate) {
          skipped++;
          continue;
        }

        let rawPayload: Record<string, unknown> | null = null;
        if (rawDataStr) {
          try {
            rawPayload = JSON.parse(rawDataStr);
          } catch {
            // Store as string if not valid JSON
            rawPayload = { raw: rawDataStr };
          }
        }

        // Extract account_id from raw_payload if available
        const accountId = rawPayload?.account_id
          ? String(rawPayload.account_id)
          : null;

        rows.push({
          source_system: "fintable",
          external_id: transactionId || `hash-${txnDate}-${amount}-${description.slice(0, 50)}`,
          txn_date: txnDate,
          amount,
          description,
          description_norm: normalizeText(description),
          category: category && category !== "Uncategorized" ? category : null,
          account_name: accountName || null,
          account_name_norm: accountName ? normalizeText(accountName) : null,
          account_id: accountId,
          raw_payload: rawPayload,
          ingested_at: new Date().toISOString(),
        });
      } catch (e) {
        errors++;
        if (errorDetails.length < 10) {
          errorDetails.push(e instanceof Error ? e.message : String(e));
        }
      }
    }

    if (rows.length > 0) {
      const { error, count } = await supabase
        .from("financial_transactions")
        .upsert(rows, { onConflict: "source_system,external_id", count: "exact" });

      if (error) {
        errors += rows.length;
        if (errorDetails.length < 10) errorDetails.push(error.message);
      } else {
        inserted += count ?? rows.length;
      }
    }
  }

  // Run classification on all unclassified
  let classified = 0;
  try {
    const { data } = await supabase.rpc("apply_rules_to_unclassified", { p_limit: 10000 });
    classified = (data as { updated: number })?.updated ?? 0;
  } catch { /* best effort */ }

  return new Response(
    JSON.stringify({
      ok: true,
      total_rows: dataLines.length,
      inserted,
      skipped,
      errors,
      classified,
      error_details: errorDetails.length > 0 ? errorDetails : undefined,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
