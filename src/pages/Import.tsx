import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Upload, FileUp, ChevronDown, AlertCircle, AlertTriangle, Info, Bug } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { COGNITO_FORMS, FORM_COLUMN_MAPPINGS } from "@/lib/cognitoMappings";

// ── Types ──────────────────────────────────────────────

interface ParsedLead {
  cognito_form: string;
  cognito_entry_number: string;
  lead_id: string;
  submitted_at: string | null;
  status: string | null;
  name: string | null;
  email: string | null;
  email_norm: string | null;
  phone: string | null;
  phrase: string | null;
  sign_style: string | null;
  size_text: string | null;
  budget_text: string | null;
  notes: string | null;
  raw_payload: Record<string, any>;
}

interface ParsedSale {
  order_id: string;
  date: string | null;
  email: string | null;
  email_norm: string | null;
  product_name: string | null;
  revenue: number | null;
  raw_payload: Record<string, any>;
}

interface ValidationIssue {
  rowIndex: number;
  field: string;
  reason: string;
  level: "error" | "warning";
}

interface ImportSummary {
  totalParsed: number;
  valid: number;
  errorRows: number;
  warningRows: number;
  inFileDuplicates: number;
  wouldInsert: number;
  dbDuplicates?: number;
}

interface DetectedColumns {
  email: string | null;
  submitted_at: string | null;
  entry_number: string | null;
}

// ── Helpers ────────────────────────────────────────────

function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalized-header candidates for leads email
const EMAIL_CANDIDATES = [
  'email',
  'email address',
  'email please check spelling before submitting',
];

// Normalized-header candidates for submitted_at
const DATE_CANDIDATES = [
  'date submitted',
  'submitted at',
  'submission date',
  'created at',
];

// Normalized-header candidates for entry number
const ENTRY_CANDIDATES = [
  '#',
  'entry number',
  'entrynumber',
];

function findColumnNormalized(headers: string[], candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const normCandidate = normalizeHeader(candidate);
    const idx = headers.findIndex(h => normalizeHeader(h) === normCandidate);
    if (idx >= 0) return headers[idx];
  }
  return undefined;
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

function parseCognitoDate(value: any): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeDate(value: any): Date | null {
  const iso = parseCognitoDate(value);
  return iso ? new Date(iso) : null;
}

function isValidDate(d: string | null): boolean {
  return normalizeDate(d) !== null;
}

// ── Component ──────────────────────────────────────────

export default function Import() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"leads" | "sales">("leads");
  const [dryRun, setDryRun] = useState(true);
  const [dryRunComplete, setDryRunComplete] = useState(false);

  // Leads state
  const [cognitoForm, setCognitoForm] = useState(COGNITO_FORMS[0]);
  const [leadsParsed, setLeadsParsed] = useState<ParsedLead[]>([]);
  const [leadsFileCount, setLeadsFileCount] = useState(0);
  const [detectedColumns, setDetectedColumns] = useState<DetectedColumns | null>(null);

  // Sales state
  const [salesParsed, setSalesParsed] = useState<ParsedSale[]>([]);

  // Validation + summary state
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [dbDuplicates, setDbDuplicates] = useState<number | null>(null);

  // For matching preview: query all leads' email_norm
  const { data: existingLeads } = useQuery({
    queryKey: ["leads-for-matching"],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("leads")
        .select("email_norm, submitted_at", { count: "exact" });
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    enabled: activeTab === "sales",
  });

  // ── LEADS PARSING ────────────────────────────────────

  function parseFileToRows(file: File): Promise<Record<string, any>[]> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const wb = XLSX.read(ev.target?.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          resolve(rows);
        };
        reader.readAsArrayBuffer(file);
      });
    }
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => resolve(result.data as Record<string, any>[]),
      });
    });
  }

  async function handleLeadsFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setLeadsFileCount(files.length);
    setDryRunComplete(false);
    setImportSummary(null);
    setDbDuplicates(null);
    setDetectedColumns(null);
    const allLeads: ParsedLead[] = [];
    const mapping = FORM_COLUMN_MAPPINGS[cognitoForm];

    let detected: DetectedColumns = { email: null, submitted_at: null, entry_number: null };

    for (const file of Array.from(files)) {
      const rows = await parseFileToRows(file);
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

      // Use normalized matching for critical fields with hardcoded candidates
      const entryCol = findColumnNormalized(headers, ENTRY_CANDIDATES) 
        ?? findColumnNormalized(headers, mapping.entry_number);
      const dateCol = findColumnNormalized(headers, DATE_CANDIDATES) 
        ?? findColumnNormalized(headers, mapping.submitted_at);
      const emailCol = findColumnNormalized(headers, EMAIL_CANDIDATES) 
        ?? findColumnNormalized(headers, mapping.email);

      // Other fields use mapping presets with normalized matching
      const nameCol = findColumnNormalized(headers, mapping.name);
      const phoneCol = findColumnNormalized(headers, mapping.phone);
      const phraseCol = mapping.phrase.length ? findColumnNormalized(headers, mapping.phrase) : undefined;
      const styleCol = mapping.sign_style.length ? findColumnNormalized(headers, mapping.sign_style) : undefined;
      const sizeCol = mapping.size_text.length ? findColumnNormalized(headers, mapping.size_text) : undefined;
      const budgetCol = mapping.budget_text.length ? findColumnNormalized(headers, mapping.budget_text) : undefined;
      const statusCol = findColumnNormalized(headers, mapping.status);
      const notesCol = findColumnNormalized(headers, mapping.notes);

      // Track detected columns (from first file)
      if (!detected.email && emailCol) detected.email = emailCol;
      if (!detected.submitted_at && dateCol) detected.submitted_at = dateCol;
      if (!detected.entry_number && entryCol) detected.entry_number = entryCol;

      rows.forEach((row: any) => {
        const entry = entryCol ? String(row[entryCol] ?? "").trim() : "";
        if (!entry) return;
        const emailRaw = emailCol ? (row[emailCol] ? String(row[emailCol]).trim() : null) : null;
        const emailNorm = normalizeEmail(emailRaw);
        allLeads.push({
          cognito_form: cognitoForm,
          cognito_entry_number: entry,
          lead_id: `CF-${cognitoForm}-${entry}`,
          submitted_at: dateCol ? parseCognitoDate(row[dateCol]) : null,
          status: statusCol ? row[statusCol] || null : null,
          name: nameCol ? row[nameCol] || null : null,
          email: emailRaw,
          email_norm: emailNorm,
          phone: phoneCol ? row[phoneCol] || null : null,
          phrase: phraseCol ? row[phraseCol] || null : null,
          sign_style: styleCol ? row[styleCol] || null : null,
          size_text: sizeCol ? row[sizeCol] || null : null,
          budget_text: budgetCol ? row[budgetCol] || null : null,
          notes: notesCol ? row[notesCol] || null : null,
          raw_payload: row,
        });
      });
    }

    setDetectedColumns(detected);
    setLeadsParsed([...allLeads]);
    validateAndSummarizeLeads(allLeads);
  }

  function validateAndSummarizeLeads(leads: ParsedLead[]) {
    const issues: ValidationIssue[] = [];
    const seenIds = new Set<string>();
    let inFileDupes = 0;
    const uniqueLeads: ParsedLead[] = [];

    leads.forEach((l, i) => {
      // Dedup
      if (seenIds.has(l.lead_id)) {
        inFileDupes++;
        return;
      }
      seenIds.add(l.lead_id);
      uniqueLeads.push(l);

      // Validate
      if (!l.lead_id) issues.push({ rowIndex: i, field: "lead_id", reason: "Missing lead_id", level: "error" });
      if (!l.submitted_at || !isValidDate(l.submitted_at))
        issues.push({ rowIndex: i, field: "submitted_at", reason: "Missing or invalid date", level: "error" });
      
      // Email: warning only, not error
      if (!l.email_norm) {
        if (l.email && l.email.trim()) {
          issues.push({ rowIndex: i, field: "email", reason: "Invalid email format (email_norm = null)", level: "warning" });
        } else {
          issues.push({ rowIndex: i, field: "email", reason: "Missing email (email_norm will be null)", level: "warning" });
        }
      }
    });

    const errorRowIndices = new Set(issues.filter((i) => i.level === "error").map((i) => i.rowIndex));
    const warningRowIndices = new Set(issues.filter((i) => i.level === "warning").map((i) => i.rowIndex));

    setValidationIssues(issues);
    setImportSummary({
      totalParsed: leads.length,
      valid: uniqueLeads.length - errorRowIndices.size,
      errorRows: errorRowIndices.size,
      warningRows: warningRowIndices.size,
      inFileDuplicates: inFileDupes,
      wouldInsert: uniqueLeads.length - errorRowIndices.size,
    });
  }

  // ── SALES PARSING ────────────────────────────────────

  async function handleSalesFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDryRunComplete(false);
    setImportSummary(null);
    setDbDuplicates(null);

    const rows = await parseFileToRows(file);
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const orderCol = findColumnNormalized(headers, ["Order ID", "order_id", "OrderID", "Order Number", "Order #"]);
    const dateCol = findColumnNormalized(headers, ["Date", "Order Date", "date", "Date Paid"]);
    const emailCol = findColumnNormalized(headers, ["Email", "Customer Email", "email", "Buyer Email"]);
    const productCol = findColumnNormalized(headers, ["Product", "Product Name", "product_name", "Item", "Description"]);
    const revenueCol = findColumnNormalized(headers, ["Revenue", "Total", "Amount", "revenue", "Price", "Order Total"]);

    const parsed: ParsedSale[] = [];
    rows.forEach((row: any) => {
      const orderId = orderCol ? String(row[orderCol] ?? "").trim() : "";
      const revenueStr = revenueCol ? String(row[revenueCol] ?? "").replace(/[$,]/g, "").trim() : "";
      const rev = parseFloat(revenueStr);
      const emailRaw = emailCol ? row[emailCol] || null : null;
      parsed.push({
        order_id: orderId,
        date: dateCol ? parseCognitoDate(row[dateCol]) : null,
        email: emailRaw,
        email_norm: normalizeEmail(emailRaw),
        product_name: productCol ? row[productCol] || null : null,
        revenue: isNaN(rev) ? null : rev,
        raw_payload: row,
      });
    });
    setSalesParsed(parsed);
    validateAndSummarizeSales(parsed);
  }

  function validateAndSummarizeSales(sales: ParsedSale[]) {
    const issues: ValidationIssue[] = [];
    const seenIds = new Set<string>();
    let inFileDupes = 0;
    const uniqueSales: ParsedSale[] = [];

    sales.forEach((s, i) => {
      if (s.order_id && seenIds.has(s.order_id)) {
        inFileDupes++;
        return;
      }
      if (s.order_id) seenIds.add(s.order_id);
      uniqueSales.push(s);

      if (!s.order_id) issues.push({ rowIndex: i, field: "order_id", reason: "Missing order_id", level: "error" });
      if (s.revenue === null) issues.push({ rowIndex: i, field: "revenue", reason: "Missing or invalid revenue", level: "error" });
      if (!s.date || !isValidDate(s.date)) issues.push({ rowIndex: i, field: "date", reason: "Missing or invalid date", level: "error" });
      if (!s.email_norm) issues.push({ rowIndex: i, field: "email", reason: "Missing or invalid email", level: "error" });
    });

    const errorRowIndices = new Set(issues.filter((i) => i.level === "error").map((i) => i.rowIndex));

    setValidationIssues(issues);
    setImportSummary({
      totalParsed: sales.length,
      valid: uniqueSales.length - errorRowIndices.size,
      errorRows: errorRowIndices.size,
      warningRows: 0,
      inFileDuplicates: inFileDupes,
      wouldInsert: uniqueSales.length - errorRowIndices.size,
    });
  }

  // ── Matching preview computation ─────────────────────

  const matchingPreview = useMemo(() => {
    if (activeTab !== "sales" || !importSummary || salesParsed.length === 0) return null;
    if (!existingLeads) return null;
    if (existingLeads.count === 0) return { noLeads: true as const, matched: 0, total: 0 };

    const errorIndices = new Set(validationIssues.filter((v) => v.level === "error").map((v) => v.rowIndex));
    const validSales = salesParsed.filter((_, i) => !errorIndices.has(i));
    let matched = 0;

    for (const sale of validSales) {
      if (!sale.email_norm || !sale.date || !isValidDate(sale.date)) continue;
      const saleDate = new Date(sale.date);
      const sixtyBefore = new Date(saleDate);
      sixtyBefore.setDate(sixtyBefore.getDate() - 60);

      const hasMatch = existingLeads.rows.some((l) => {
        if (!l.email_norm || !l.submitted_at) return false;
        const ld = new Date(l.submitted_at);
        return l.email_norm === sale.email_norm && ld >= sixtyBefore && ld <= saleDate;
      });
      if (hasMatch) matched++;
    }

    return { noLeads: false as const, matched, total: validSales.length };
  }, [activeTab, importSummary, salesParsed, existingLeads, validationIssues]);

  // ── Missing email rate warning ──────────────────────

  const missingEmailRate = useMemo(() => {
    if (activeTab !== "leads" || leadsParsed.length === 0) return 0;
    const missing = leadsParsed.filter(l => !l.email_norm).length;
    return missing / leadsParsed.length;
  }, [activeTab, leadsParsed]);

  // ── DRY RUN / IMPORT ACTIONS ─────────────────────────

  function handleRunDryRun() {
    setDryRunComplete(true);
    toast.success("Dry run complete — review summary below");
  }

  const importLeads = useMutation({
    mutationFn: async () => {
      const errorIndices = new Set(validationIssues.filter((v) => v.level === "error").map((v) => v.rowIndex));
      const seenIds = new Set<string>();
      const toInsert = leadsParsed.filter((l, i) => {
        if (errorIndices.has(i)) return false;
        if (seenIds.has(l.lead_id)) return false;
        seenIds.add(l.lead_id);
        return true;
      });

      const { data, error } = await supabase.from("leads").upsert(
        toInsert.map((l) => ({
          lead_id: l.lead_id,
          cognito_form: l.cognito_form,
          cognito_entry_number: l.cognito_entry_number,
          submitted_at: l.submitted_at,
          status: l.status,
          name: l.name,
          email: l.email,
          phone: l.phone,
          phrase: l.phrase,
          sign_style: l.sign_style,
          size_text: l.size_text,
          budget_text: l.budget_text,
          notes: l.notes,
          raw_payload: l.raw_payload,
        })),
        { onConflict: "lead_id", ignoreDuplicates: true, count: "exact" }
      );
      if (error) throw error;
      const insertedCount = (data as any[])?.length ?? toInsert.length;
      setDbDuplicates(toInsert.length - insertedCount);
      return insertedCount;
    },
    onSuccess: (count) => {
      toast.success(`Imported ${count} leads` + (dbDuplicates ? `, ${dbDuplicates} already in database` : ""));
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const importSales = useMutation({
    mutationFn: async () => {
      const errorIndices = new Set(validationIssues.filter((v) => v.level === "error").map((v) => v.rowIndex));
      const seenIds = new Set<string>();
      const toInsert = salesParsed.filter((s, i) => {
        if (errorIndices.has(i)) return false;
        if (!s.order_id || seenIds.has(s.order_id)) return false;
        seenIds.add(s.order_id);
        return true;
      });

      const { data, error } = await supabase.from("sales").upsert(
        toInsert.map((s) => ({
          order_id: s.order_id,
          date: normalizeDate(s.date)?.toISOString().split("T")[0] ?? null,
          email: s.email,
          product_name: s.product_name,
          revenue: s.revenue,
          raw_payload: s.raw_payload,
          sale_type: "unknown",
        })),
        { onConflict: "order_id", ignoreDuplicates: true, count: "exact" }
      );
      if (error) throw error;
      const insertedCount = (data as any[])?.length ?? toInsert.length;
      setDbDuplicates(toInsert.length - insertedCount);

      await runAutoMatching();
      return insertedCount;
    },
    onSuccess: (count) => {
      toast.success(`Imported ${count} sales & ran auto-matching` + (dbDuplicates ? `, ${dbDuplicates} already in database` : ""));
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales"] });
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  function handlePrimaryAction() {
    if (dryRun) {
      handleRunDryRun();
      return;
    }
    if (activeTab === "leads") importLeads.mutate();
    else importSales.mutate();
  }

  const isPending = importLeads.isPending || importSales.isPending;
  const hasData = activeTab === "leads" ? leadsParsed.length > 0 : salesParsed.length > 0;

  // Build payload preview (first 10 valid rows)
  const payloadPreview = useMemo(() => {
    const errorIndices = new Set(validationIssues.filter((v) => v.level === "error").map((v) => v.rowIndex));
    if (activeTab === "leads") {
      const seenIds = new Set<string>();
      return leadsParsed
        .filter((l, i) => {
          if (errorIndices.has(i) || seenIds.has(l.lead_id)) return false;
          seenIds.add(l.lead_id);
          return true;
        })
        .slice(0, 10)
        .map((l) => ({
          lead_id: l.lead_id,
          cognito_form: l.cognito_form,
          cognito_entry_number: l.cognito_entry_number,
          submitted_at: l.submitted_at,
          name: l.name,
          email: l.email,
          email_norm: l.email_norm,
          phone: l.phone,
          phrase: l.phrase,
          sign_style: l.sign_style,
          size_text: l.size_text,
          budget_text: l.budget_text,
          notes: l.notes,
        }));
    } else {
      const seenIds = new Set<string>();
      return salesParsed
        .filter((s, i) => {
          if (errorIndices.has(i) || !s.order_id || seenIds.has(s.order_id)) return false;
          seenIds.add(s.order_id);
          return true;
        })
        .slice(0, 10)
        .map((s) => ({
          order_id: s.order_id,
          date: normalizeDate(s.date)?.toISOString().split("T")[0] ?? null,
          email: s.email,
          email_norm: s.email_norm,
          product_name: s.product_name,
          revenue: s.revenue,
          sale_type: "unknown",
        }));
    }
  }, [activeTab, leadsParsed, salesParsed, validationIssues]);

  // ── RENDER ───────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground text-sm">Upload CSV or Excel files to import leads and sales</p>
      </div>

      {/* Dry Run Toggle */}
      <div className="flex items-center gap-3">
        <Switch checked={dryRun} onCheckedChange={(v) => { setDryRun(v); setDryRunComplete(false); }} />
        <span className="text-sm font-medium">Dry Run (no database writes)</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button variant={activeTab === "leads" ? "default" : "outline"} onClick={() => { setActiveTab("leads"); setDryRunComplete(false); setImportSummary(null); setValidationIssues([]); }}>
          Import Leads
        </Button>
        <Button variant={activeTab === "sales" ? "default" : "outline"} onClick={() => { setActiveTab("sales"); setDryRunComplete(false); setImportSummary(null); setValidationIssues([]); }}>
          Import Sales
        </Button>
      </div>

      {/* Dry Run Complete Callout */}
      {dryRunComplete && dryRun && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Dry run complete</AlertTitle>
          <AlertDescription>Turn OFF Dry Run to import data into the database.</AlertDescription>
        </Alert>
      )}

      {/* HIGH MISSING EMAIL WARNING */}
      {activeTab === "leads" && leadsParsed.length > 0 && missingEmailRate > 0.2 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>High missing email rate detected</AlertTitle>
          <AlertDescription>
            {Math.round(missingEmailRate * 100)}% of rows have missing email. 
            Mapping may be incorrect. Do NOT import until verified.
            {detectedColumns && (
              <span className="block mt-1 font-mono text-xs">
                Detected email column: {detectedColumns.email ?? "NONE"}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ── LEADS TAB ── */}
      {activeTab === "leads" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads Import</CardTitle>
            <CardDescription>Select the Cognito form type, then upload one or more CSV/Excel files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Select value={cognitoForm} onValueChange={setCognitoForm}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COGNITO_FORMS.map((f) => (
                    <SelectItem key={f} value={f}>{f.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="file" accept=".csv,.xlsx,.xls" multiple onChange={handleLeadsFiles} className="w-auto" />
            </div>

            {leadsParsed.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {leadsParsed.length} rows from {leadsFileCount} file(s) · Form: <Badge variant="secondary">{cognitoForm}</Badge>
                  </p>
                  <Button onClick={handlePrimaryAction} disabled={isPending || (dryRun && dryRunComplete)}>
                    <Upload className="h-4 w-4 mr-2" />
                    {isPending ? "Importing…" : dryRun ? "Run Dry Run" : "Confirm Import"}
                  </Button>
                </div>

                {/* Debug Panel */}
                {detectedColumns && (
                  <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Bug className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Column Detection Debug</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-muted-foreground">email: </span>
                        <span className={detectedColumns.email ? "text-green-600" : "text-destructive font-bold"}>
                          {detectedColumns.email ?? "NOT FOUND"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">submitted_at: </span>
                        <span className={detectedColumns.submitted_at ? "text-green-600" : "text-destructive font-bold"}>
                          {detectedColumns.submitted_at ?? "NOT FOUND"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">entry_number: </span>
                        <span className={detectedColumns.entry_number ? "text-green-600" : "text-destructive font-bold"}>
                          {detectedColumns.entry_number ?? "NOT FOUND"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview Table */}
                <div className="rounded-md border max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>email_norm</TableHead>
                        <TableHead>Phrase</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leadsParsed.slice(0, 50).map((l, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{l.lead_id}</TableCell>
                          <TableCell>{l.name || "—"}</TableCell>
                          <TableCell>{l.email || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{l.email_norm || "—"}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{l.phrase || "—"}</TableCell>
                          <TableCell>{l.submitted_at || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {leadsParsed.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Showing first 50 of {leadsParsed.length} rows</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SALES TAB ── */}
      {activeTab === "sales" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sales Import</CardTitle>
            <CardDescription>Upload a sales CSV. Summary/total rows are automatically handled by validation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleSalesFile} className="w-auto" />

            {salesParsed.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{salesParsed.length} rows parsed</p>
                  <Button onClick={handlePrimaryAction} disabled={isPending || (dryRun && dryRunComplete)}>
                    <FileUp className="h-4 w-4 mr-2" />
                    {isPending ? "Importing…" : dryRun ? "Run Dry Run" : "Confirm Import"}
                  </Button>
                </div>

                <div className="rounded-md border max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesParsed.slice(0, 50).map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{s.order_id || "—"}</TableCell>
                          <TableCell>{s.date || "—"}</TableCell>
                          <TableCell>{s.email || "—"}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{s.product_name || "—"}</TableCell>
                          <TableCell className="text-right">{s.revenue !== null ? `$${s.revenue.toFixed(2)}` : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {salesParsed.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Showing first 50 of {salesParsed.length} rows</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SUMMARY CARD ── */}
      {importSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Import Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Parsed</p>
                <p className="text-xl font-bold">{importSummary.totalParsed}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Valid</p>
                <p className="text-xl font-bold text-green-600">{importSummary.valid}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Errors</p>
                <p className="text-xl font-bold text-destructive">{importSummary.errorRows}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Warnings</p>
                <p className="text-xl font-bold text-amber-500">{importSummary.warningRows}</p>
              </div>
              <div>
                <p className="text-muted-foreground">In-File Dupes</p>
                <p className="text-xl font-bold">{importSummary.inFileDuplicates}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Would Insert</p>
                <p className="text-xl font-bold text-primary">{importSummary.wouldInsert}</p>
              </div>
            </div>
            {dbDuplicates !== null && dbDuplicates > 0 && (
              <p className="text-sm text-muted-foreground mt-3">{dbDuplicates} rows already existed in the database (skipped).</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── VALIDATION ISSUES ── */}
      {validationIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Validation Issues ({validationIssues.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-60 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Row</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead className="w-24">Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validationIssues.slice(0, 100).map((v, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{v.rowIndex + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{v.field}</TableCell>
                      <TableCell className="text-xs">{v.reason}</TableCell>
                      <TableCell>
                        {v.level === "error" ? (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 text-xs">Warning</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {validationIssues.length > 100 && (
                <p className="text-xs text-muted-foreground text-center py-2">Showing first 100 of {validationIssues.length} issues</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── MATCHING PREVIEW (Sales) ── */}
      {activeTab === "sales" && matchingPreview && importSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Matching Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {matchingPreview.noLeads ? (
              <p className="text-sm text-muted-foreground">No leads in database yet. Import leads first.</p>
            ) : (
              <p className="text-sm">
                <span className="font-bold text-primary">{matchingPreview.matched}</span> of{" "}
                <span className="font-bold">{matchingPreview.total}</span> valid sales would auto-match to existing leads
                (email match within 60-day window).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TRANSFORMED PAYLOAD PREVIEW ── */}
      {hasData && importSummary && (
        <Collapsible>
          <Card>
            <CardHeader className="pb-3">
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                <CardTitle className="text-lg">Transformed Payload Preview</CardTitle>
                <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <pre className="text-xs bg-muted rounded-md p-4 overflow-auto max-h-96">
                  {JSON.stringify(payloadPreview, null, 2)}
                </pre>
                <p className="text-xs text-muted-foreground mt-2">
                  Showing first {payloadPreview.length} of {importSummary.wouldInsert} rows that would be sent to the database.
                </p>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}

/** Auto-match unmatched sales to leads by exact email (server-side RPC) */
async function runAutoMatching() {
  const { data, error } = await supabase.rpc("backfill_email_matches");
  if (error) {
    console.error("Auto-matching failed:", error);
  } else {
    console.log(`Auto-matched ${data} sales by email`);
  }
}
