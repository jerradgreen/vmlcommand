import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import { normalizeText } from "@/lib/normalizeText";

type CsvRow = {
  "⚡ Date"?: string;
  "⚡ Amount"?: string;
  "⚡ Description"?: string;
  "⚡ Category"?: string;
  "⚡ Account"?: string;
  "⚡ Transaction ID"?: string;
  "⚡ Raw Data"?: string;
  // Fallback names (generic CSVs)
  Date?: string;
  Amount?: string;
  Description?: string;
  Category?: string;
  Account?: string;
  "Transaction ID"?: string;
  "Raw Data"?: string;
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

const BATCH_SIZE = 200;

export default function TransactionCsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");

  const handleFile = async (file: File) => {
    setImporting(true);
    setProgress("Parsing CSV…");

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        setProgress(`Parsed ${rows.length} rows. Inserting…`);

        let inserted = 0;
        let skipped = 0;
        let errors = 0;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const dbRows = [];

          for (const row of batch) {
            const rawDate = (row["⚡ Date"] ?? row["Date"] ?? "").trim();
            const amountStr = (row["⚡ Amount"] ?? row["Amount"] ?? "").trim();
            const description = (row["⚡ Description"] ?? row["Description"] ?? "").trim();
            const category = (row["⚡ Category"] ?? row["Category"] ?? "").trim();
            const accountName = (row["⚡ Account"] ?? row["Account"] ?? "").trim();
            const txnId = (row["⚡ Transaction ID"] ?? row["Transaction ID"] ?? "").trim();
            const rawDataStr = (row["⚡ Raw Data"] ?? row["Raw Data"] ?? "").trim();

            const amount = parseFloat(amountStr);
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
                rawPayload = { raw: rawDataStr };
              }
            }

            const accountId =
              rawPayload && typeof rawPayload === "object" && rawPayload.account_id
                ? String(rawPayload.account_id)
                : null;

            dbRows.push({
              source_system: "fintable" as const,
              external_id: txnId || `hash-${txnDate}-${amount}-${description.slice(0, 50)}`,
              txn_date: txnDate,
              amount,
              description,
              description_norm: normalizeText(description),
              category: category && category !== "Uncategorized" ? category : null,
              account_name: accountName || null,
              account_name_norm: accountName ? normalizeText(accountName) : null,
              account_id: accountId,
              raw_payload: rawPayload as any,
              ingested_at: new Date().toISOString(),
            });
          }

          if (dbRows.length > 0) {
            const { error } = await supabase
              .from("financial_transactions")
              .upsert(dbRows, { onConflict: "source_system,external_id" });

            if (error) {
              errors += dbRows.length;
              console.error("Batch insert error:", error);
            } else {
              inserted += dbRows.length;
            }
          }

          setProgress(`Inserted ${inserted} of ${rows.length}… (${skipped} skipped, ${errors} errors)`);
        }

        // Run classification
        setProgress("Running classification rules…");
        try {
          const { data } = await supabase.rpc("apply_rules_to_unclassified", { p_limit: 10000 });
          const classified = (data as any)?.updated ?? 0;
          setProgress("");
          toast.success(`Import complete: ${inserted} inserted, ${classified} classified, ${skipped} skipped`);
        } catch {
          toast.success(`Import complete: ${inserted} inserted, ${skipped} skipped`);
        }

        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        setImporting(false);
        setProgress("");
      },
      error: (err) => {
        toast.error("CSV parse error: " + err.message);
        setImporting(false);
        setProgress("");
      },
    });
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={importing}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-4 w-4 mr-1" />
        {importing ? progress || "Importing…" : "Import CSV"}
      </Button>
    </>
  );
}
