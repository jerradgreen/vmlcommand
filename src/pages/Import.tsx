import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileUp } from "lucide-react";
import Papa from "papaparse";

const COGNITO_FORMS = [
  "general_quote",
  "event_style",
  "wall_hanging",
  "layered_logo",
  "mobile_vendor",
  "rental_guide_download",
  "not_sure",
];

interface ParsedLead {
  cognito_form: string;
  cognito_entry_number: string;
  lead_id: string;
  submitted_at: string | null;
  status: string | null;
  name: string | null;
  email: string | null;
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
  product_name: string | null;
  revenue: number;
  raw_payload: Record<string, any>;
}

function findColumn(headers: string[], ...candidates: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) return headers[idx];
  }
  return undefined;
}

export default function Import() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"leads" | "sales">("leads");

  // Leads state
  const [cognitoForm, setCognitoForm] = useState(COGNITO_FORMS[0]);
  const [leadsParsed, setLeadsParsed] = useState<ParsedLead[]>([]);
  const [leadsFileCount, setLeadsFileCount] = useState(0);

  // Sales state
  const [salesParsed, setSalesParsed] = useState<ParsedSale[]>([]);

  function handleLeadsFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setLeadsFileCount(files.length);
    const allLeads: ParsedLead[] = [];

    Array.from(files).forEach((file) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const headers = result.meta.fields ?? [];
          const entryCol = findColumn(headers, "Entry Number", "entry_number", "EntryNumber", "#");
          const dateCol = findColumn(headers, "Date Submitted", "submitted_at", "Timestamp", "Date");
          const nameCol = findColumn(headers, "Name", "Full Name", "name");
          const emailCol = findColumn(headers, "Email", "Email Address", "email");
          const phoneCol = findColumn(headers, "Phone", "Phone Number", "phone");
          const phraseCol = findColumn(headers, "Phrase", "Text", "phrase", "Message", "Custom Text");
          const styleCol = findColumn(headers, "Sign Style", "Style", "sign_style", "Product");
          const sizeCol = findColumn(headers, "Size", "Dimensions", "size_text");
          const budgetCol = findColumn(headers, "Budget", "budget_text");
          const statusCol = findColumn(headers, "Status", "status");
          const notesCol = findColumn(headers, "Notes", "notes", "Additional Notes");

          result.data.forEach((row: any) => {
            const entry = entryCol ? String(row[entryCol] ?? "").trim() : "";
            if (!entry) return;
            allLeads.push({
              cognito_form: cognitoForm,
              cognito_entry_number: entry,
              lead_id: `CF-${cognitoForm}-${entry}`,
              submitted_at: dateCol ? row[dateCol] || null : null,
              status: statusCol ? row[statusCol] || null : null,
              name: nameCol ? row[nameCol] || null : null,
              email: emailCol ? row[emailCol] || null : null,
              phone: phoneCol ? row[phoneCol] || null : null,
              phrase: phraseCol ? row[phraseCol] || null : null,
              sign_style: styleCol ? row[styleCol] || null : null,
              size_text: sizeCol ? row[sizeCol] || null : null,
              budget_text: budgetCol ? row[budgetCol] || null : null,
              notes: notesCol ? row[notesCol] || null : null,
              raw_payload: row,
            });
          });
          setLeadsParsed([...allLeads]);
        },
      });
    });
  }

  function handleSalesFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        const orderCol = findColumn(headers, "Order ID", "order_id", "OrderID", "Order Number", "Order #");
        const dateCol = findColumn(headers, "Date", "Order Date", "date", "Date Paid");
        const emailCol = findColumn(headers, "Email", "Customer Email", "email", "Buyer Email");
        const productCol = findColumn(headers, "Product", "Product Name", "product_name", "Item", "Description");
        const revenueCol = findColumn(headers, "Revenue", "Total", "Amount", "revenue", "Price", "Order Total");

        const parsed: ParsedSale[] = [];
        result.data.forEach((row: any) => {
          const orderId = orderCol ? String(row[orderCol] ?? "").trim() : "";
          const revenueStr = revenueCol ? String(row[revenueCol] ?? "").replace(/[$,]/g, "").trim() : "";
          const revenue = parseFloat(revenueStr);
          // Skip summary/total rows
          if (!orderId || isNaN(revenue)) return;
          parsed.push({
            order_id: orderId,
            date: dateCol ? row[dateCol] || null : null,
            email: emailCol ? row[emailCol] || null : null,
            product_name: productCol ? row[productCol] || null : null,
            revenue,
            raw_payload: row,
          });
        });
        setSalesParsed(parsed);
      },
    });
  }

  const importLeads = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").upsert(
        leadsParsed.map((l) => ({
          lead_id: l.lead_id,
          cognito_form: l.cognito_form,
          cognito_entry_number: l.cognito_entry_number,
          submitted_at: l.submitted_at ? new Date(l.submitted_at).toISOString() : null,
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
        { onConflict: "lead_id", ignoreDuplicates: true }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Imported ${leadsParsed.length} leads`);
      setLeadsParsed([]);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const importSales = useMutation({
    mutationFn: async () => {
      // Upsert sales
      const { error } = await supabase.from("sales").upsert(
        salesParsed.map((s) => ({
          order_id: s.order_id,
          date: s.date ? new Date(s.date).toISOString().split("T")[0] : null,
          email: s.email,
          product_name: s.product_name,
          revenue: s.revenue,
          raw_payload: s.raw_payload,
          sale_type: "unknown",
        })),
        { onConflict: "order_id", ignoreDuplicates: true }
      );
      if (error) throw error;

      // Run auto email matching
      await runAutoMatching();
    },
    onSuccess: () => {
      toast.success(`Imported ${salesParsed.length} sales & ran auto-matching`);
      setSalesParsed([]);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales"] });
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground text-sm">Upload CSV files to import leads and sales</p>
      </div>

      <div className="flex gap-2">
        <Button variant={activeTab === "leads" ? "default" : "outline"} onClick={() => setActiveTab("leads")}>
          Import Leads
        </Button>
        <Button variant={activeTab === "sales" ? "default" : "outline"} onClick={() => setActiveTab("sales")}>
          Import Sales
        </Button>
      </div>

      {activeTab === "leads" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads Import</CardTitle>
            <CardDescription>Upload Cognito Forms CSV exports. Select the form type first, then upload one or more files.</CardDescription>
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
              <div className="relative">
                <Input type="file" accept=".csv" multiple onChange={handleLeadsFiles} className="w-auto" />
              </div>
            </div>

            {leadsParsed.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {leadsParsed.length} rows from {leadsFileCount} file(s) · Form: <Badge variant="secondary">{cognitoForm}</Badge>
                  </p>
                  <Button onClick={() => importLeads.mutate()} disabled={importLeads.isPending}>
                    <Upload className="h-4 w-4 mr-2" />
                    {importLeads.isPending ? "Importing…" : "Confirm Import"}
                  </Button>
                </div>
                <div className="rounded-md border max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
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
                          <TableCell className="max-w-[150px] truncate">{l.phrase || "—"}</TableCell>
                          <TableCell>{l.submitted_at || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {leadsParsed.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Showing first 50 of {leadsParsed.length} rows
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "sales" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sales Import</CardTitle>
            <CardDescription>Upload a sales CSV (Google Sheets export). Summary/total rows are automatically skipped.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input type="file" accept=".csv" onChange={handleSalesFile} className="w-auto" />

            {salesParsed.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{salesParsed.length} valid rows parsed</p>
                  <Button onClick={() => importSales.mutate()} disabled={importSales.isPending}>
                    <FileUp className="h-4 w-4 mr-2" />
                    {importSales.isPending ? "Importing…" : "Confirm Import"}
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
                          <TableCell className="font-mono text-xs">{s.order_id}</TableCell>
                          <TableCell>{s.date || "—"}</TableCell>
                          <TableCell>{s.email || "—"}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{s.product_name || "—"}</TableCell>
                          <TableCell className="text-right">${s.revenue.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {salesParsed.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Showing first 50 of {salesParsed.length} rows
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Auto-match unmatched sales to leads by email within 60-day window */
async function runAutoMatching() {
  // Get all unmatched sales
  const { data: unmatchedSales } = await supabase
    .from("sales")
    .select("id, email_norm, date")
    .eq("sale_type", "unknown")
    .is("lead_id", null);

  if (!unmatchedSales?.length) return;

  // Get all leads
  const { data: allLeads } = await supabase
    .from("leads")
    .select("id, email_norm, submitted_at");

  if (!allLeads?.length) return;

  const updates: { id: string; lead_id: string }[] = [];

  for (const sale of unmatchedSales) {
    if (!sale.email_norm || !sale.date) continue;
    const saleDate = new Date(sale.date);
    const sixtyDaysBefore = new Date(saleDate);
    sixtyDaysBefore.setDate(sixtyDaysBefore.getDate() - 60);

    // Find matching leads: same email_norm, submitted within 60 days before sale
    const matches = allLeads
      .filter((l) => {
        if (!l.email_norm || !l.submitted_at) return false;
        const leadDate = new Date(l.submitted_at);
        return l.email_norm === sale.email_norm && leadDate >= sixtyDaysBefore && leadDate <= saleDate;
      })
      .sort((a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime());

    if (matches.length > 0) {
      updates.push({ id: sale.id, lead_id: matches[0].id });
    }
  }

  // Update matched sales
  for (const u of updates) {
    await supabase
      .from("sales")
      .update({
        lead_id: u.lead_id,
        match_method: "email_exact",
        match_confidence: 95,
        match_reason: "Auto-matched by email within 60-day window",
        sale_type: "new_lead",
      })
      .eq("id", u.id);
  }
}
