import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import { MetricSpec, MetricSpecId, metricSpecs, DataTableType } from "@/lib/metricSpecs";
import { format, addDays } from "date-fns";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import TransactionEditSheet from "./TransactionEditSheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specId: MetricSpecId | null;
  metrics: Record<string, any>;
  rangeFrom: string;
  rangeTo: string;
  rangeLabel: string;
}

/** Resolve a valueKey to a displayable number */
function resolveValue(key: string, m: Record<string, any>): number {
  // Direct metric keys
  if (key in m) return Number(m[key]) || 0;

  // Computed derived values
  switch (key) {
    case "_roas":
      return m.adsSpendTotal > 0 ? m.depositRevenue / m.adsSpendTotal : 0;
    case "_adSpendPct":
      return m.depositRevenue > 0 ? m.adsSpendTotal / m.depositRevenue : 0;
    case "_cogsPct":
      return m.depositRevenue > 0 ? m.adjustedCogsTotal / m.depositRevenue : 0;
    case "_overheadPct":
      return m.depositRevenue > 0 ? m.overheadMonthlyRunRate / m.depositRevenue : 0;
    case "_profitMarginPct":
      return m.depositRevenue > 0 ? (m.adjustedNetProfit ?? m.netProfitProxy ?? 0) / m.depositRevenue : 0;
    case "_closeRatePct":
      return m.totalLeads > 0 ? (m.newLeadSalesCount || 0) / m.totalLeads : 0;
    case "_next7TotalDue":
      return (m.next7BillsDue || 0) + (m.next7CogsDue || 0);
    case "_netAfterUpcomingDue":
      return (m.adjustedNetProfit ?? m.netProfitProxy ?? 0) - ((m.next7BillsDue || 0) + (m.next7CogsDue || 0));
    case "_netAfterAds":
      return (m.depositRevenue || 0) - (m.adsSpendTotal || 0);
    case "_totalSales":
      return m.totalSales || 0;
    case "_cogsPerSale":
      return m.totalSales > 0 ? (m.cogsTotal || 0) / m.totalSales : 0;
    case "_marketingPerSale":
      return m.totalSales > 0 ? (m.fullyLoadedMarketingCost || 0) / m.totalSales : 0;
    case "_loanQualifyingSalesCount":
      return m.loanQualifyingSalesCountInRange || 0;
    case "_paybackCap":
      return 0; // Will be shown from loan data
    default:
      return 0;
  }
}

function formatValue(key: string, val: number): string {
  if (key === "_roas") return val > 0 ? `${val.toFixed(2)}x` : "—";
  if (key.endsWith("Pct") || (key.startsWith("_") && key.includes("Pct")) || key === "closeRate") return formatPercent(val);
  if (["_totalSales", "_loanQualifyingSalesCount", "totalSales", "totalLeads", "newLeadSalesCount", "repeatDirectSalesCount", "unmatchedCount"].includes(key)) return formatNumber(val);
  return formatCurrency(val);
}

/* ── Data table fetchers ── */
function useDataTable(type: DataTableType | null, rangeFrom: string, rangeTo: string, enabled: boolean) {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const next7Str = format(addDays(now, 7), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["drilldown-data", type, rangeFrom, rangeTo],
    enabled: enabled && !!type,
    queryFn: async () => {
      if (!type) return [];
      switch (type) {
        case "ad_expenses": {
          const { data } = await supabase.from("expenses").select("*").eq("category", "ads")
            .gte("date", rangeFrom).lte("date", rangeTo).order("date", { ascending: false });
          return data ?? [];
        }
        case "sales_list": {
          const { data } = await supabase.from("sales").select("id, order_id, product_name, revenue, date, sale_type")
            .gte("date", rangeFrom).lte("date", rangeTo).order("date", { ascending: false });
          return data ?? [];
        }
        case "sales_new_lead": {
          const { data } = await supabase.from("sales").select("id, order_id, product_name, revenue, date, sale_type")
            .eq("sale_type", "new_lead")
            .gte("date", rangeFrom).lte("date", rangeTo).order("date", { ascending: false });
          return data ?? [];
        }
        case "sales_repeat_direct": {
          const { data } = await supabase.from("sales").select("id, order_id, product_name, revenue, date, sale_type")
            .eq("sale_type", "repeat_direct")
            .gte("date", rangeFrom).lte("date", rangeTo).order("date", { ascending: false });
          return data ?? [];
        }
        case "sales_unmatched": {
          const { data } = await supabase.from("sales").select("id, order_id, product_name, revenue, date, sale_type")
            .eq("sale_type", "unknown")
            .is("lead_id", null)
            .gte("date", rangeFrom).lte("date", rangeTo).order("date", { ascending: false });
          return data ?? [];
        }
        case "leads_list": {
          const { data } = await supabase.from("leads").select("id, lead_id, name, email, status, submitted_at")
            .gte("submitted_at", `${rangeFrom}T00:00:00.000Z`).lte("submitted_at", `${rangeTo}T23:59:59.999Z`)
            .order("submitted_at", { ascending: false });
          return data ?? [];
        }
        case "bills_paid": {
          const { data } = await supabase.from("bills").select("*").eq("status", "paid")
            .gte("date", rangeFrom).lte("date", rangeTo).order("date", { ascending: false });
          return data ?? [];
        }
        case "cogs_paid": {
          const { data } = await supabase.from("cogs_payments").select("*").eq("status", "paid")
            .gte("date", rangeFrom).lte("date", rangeTo).order("date", { ascending: false });
          return data ?? [];
        }
        case "next7_bills": {
          const { data } = await supabase.from("bills").select("*")
            .in("status", ["due", "scheduled"]).gte("due_date", todayStr).lte("due_date", next7Str)
            .order("due_date", { ascending: true });
          return data ?? [];
        }
        case "next7_cogs": {
          const { data } = await supabase.from("cogs_payments").select("*")
            .in("status", ["due", "scheduled"]).gte("due_date", todayStr).lte("due_date", next7Str)
            .order("due_date", { ascending: true });
          return data ?? [];
        }
        case "shopify_capital_loans": {
          const { data } = await supabase.from("shopify_capital_loans").select("*")
            .order("start_order_number_int", { ascending: true });
          return data ?? [];
        }
        case "overhead_txns": {
          const overheadCats = ['software','subscriptions','contractor_payments','office_expense',
            'rent','utilities','insurance','equipment','creative_services','seo',
            'advertising_tools','education','taxes','bank_fees','interest'];
          const { data } = await supabase.from("financial_transactions")
            .select("id, txn_date, description, vendor, txn_category, txn_subcategory, amount, is_recurring, account_name, txn_type, is_locked, rule_id_applied, classified_at")
            .eq("txn_type", "business")
            .in("txn_category", overheadCats)
            .gte("txn_date", rangeFrom).lte("txn_date", rangeTo)
            .order("txn_date", { ascending: false });
          return data ?? [];
        }
        case "cogs_txns": {
          const cogsCats = ['cogs','shipping_cogs','merchant_fees','packaging'];
          const { data } = await supabase.from("financial_transactions")
            .select("id, txn_date, description, vendor, txn_category, txn_subcategory, amount, is_recurring, account_name, txn_type, is_locked, rule_id_applied, classified_at")
            .eq("txn_type", "business")
            .in("txn_category", cogsCats)
            .gte("txn_date", rangeFrom).lte("txn_date", rangeTo)
            .order("txn_date", { ascending: false });
          return data ?? [];
        }
        default:
          return [];
      }
    },
  });
}

function DataTableView({ type, data, onTransactionClick }: { type: DataTableType; data: any[]; onTransactionClick?: (txn: any) => void }) {
  if (data.length === 0) return <p className="text-muted-foreground text-sm">No records found.</p>;

  const total = data.reduce((s: number, r: any) => s + (Number(r.amount ?? r.revenue ?? 0) || 0), 0);

  switch (type) {
    case "ad_expenses":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Ad Spend — {formatCurrency(total)}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Platform</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Notes</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>{e.date}</TableCell><TableCell>{e.platform}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(e.amount))}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{e.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    case "sales_list":
    case "sales_new_lead":
    case "sales_repeat_direct":
    case "sales_unmatched":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Sales — {formatCurrency(total)}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Order</TableHead><TableHead>Product</TableHead>
              <TableHead>Type</TableHead><TableHead className="text-right">Revenue</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((s: any) => (
                <TableRow key={s.id ?? `${s.order_id}-${s.date}`}>
                  <TableCell>{s.date}</TableCell>
                  <TableCell className="font-mono text-xs">{s.order_id}</TableCell>
                  <TableCell>{s.product_name ?? "—"}</TableCell>
                  <TableCell>{s.sale_type}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(s.revenue) || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    case "leads_list":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Leads — {formatNumber(data.length)}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Submitted</TableHead><TableHead>Lead ID</TableHead><TableHead>Name</TableHead>
              <TableHead>Email</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.submitted_at ? format(new Date(l.submitted_at), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{l.lead_id ?? "—"}</TableCell>
                  <TableCell>{l.name ?? "—"}</TableCell>
                  <TableCell>{l.email ?? "—"}</TableCell>
                  <TableCell>{l.status ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    case "bills_paid":
    case "next7_bills":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Bills — {formatCurrency(total)}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
              <TableHead>Due Date</TableHead><TableHead>Notes</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell>{b.date}</TableCell><TableCell>{b.vendor}</TableCell>
                  <TableCell>{b.category}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(b.amount))}</TableCell>
                  <TableCell>{b.status}</TableCell><TableCell>{b.due_date ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{b.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    case "cogs_paid":
    case "next7_cogs":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">COGS — {formatCurrency(total)}</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Order ID</TableHead>
              <TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead><TableHead>Due Date</TableHead><TableHead>Notes</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>{c.date}</TableCell><TableCell>{c.vendor}</TableCell>
                  <TableCell className="font-mono text-xs">{c.order_id ?? "—"}</TableCell>
                  <TableCell>{c.category}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(c.amount))}</TableCell>
                  <TableCell>{c.status}</TableCell><TableCell>{c.due_date ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    case "shopify_capital_loans":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Loan History</h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Status</TableHead>
              <TableHead>Start Order #</TableHead><TableHead>Rate</TableHead>
              <TableHead className="text-right">Payback Cap</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.name ?? "Shopify Capital"}</TableCell>
                  <TableCell><Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge></TableCell>
                  <TableCell className="font-mono">{l.start_order_number_int}</TableCell>
                  <TableCell>{(Number(l.repayment_rate) * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(l.payback_cap))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    case "overhead_txns":
    case "cogs_txns":
      return (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            {type === "overhead_txns" ? "Overhead" : "COGS"} Transactions — {formatCurrency(total)}
          </h3>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead><TableHead>Subcategory</TableHead>
              {type === "overhead_txns" && <TableHead>Type</TableHead>}
              <TableHead className="text-right">Amount</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((t: any) => (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onTransactionClick?.(t)}>
                  <TableCell>{t.txn_date}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">{t.description ?? "—"}</TableCell>
                  <TableCell>{t.vendor ?? "—"}</TableCell>
                  <TableCell>{t.txn_category ?? "—"}</TableCell>
                  <TableCell>{t.txn_subcategory ?? "—"}</TableCell>
                  {type === "overhead_txns" && (
                    <TableCell>
                      <Badge variant={t.is_recurring === false ? "destructive" : "outline"}>
                        {t.is_recurring === false ? "One-time" : "Recurring"}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell className="text-right">{formatCurrency(Math.abs(Number(t.amount)))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    default:
      return null;
  }
}

export default function MetricDrilldownDialog({ open, onOpenChange, specId, metrics, rangeFrom, rangeTo, rangeLabel }: Props) {
  const spec = specId ? metricSpecs[specId] : null;
  const queryClient = useQueryClient();
  const [editingTxn, setEditingTxn] = useState<any>(null);

  // Use the first data table if present
  const primaryTable = spec?.dataTables?.[0] ?? null;
  const secondaryTable = spec?.dataTables?.[1] ?? null;
  const { data: primaryData, isLoading: primaryLoading } = useDataTable(primaryTable, rangeFrom, rangeTo, open);
  const { data: secondaryData, isLoading: secondaryLoading } = useDataTable(secondaryTable, rangeFrom, rangeTo, open);

  if (!spec) return null;

  const salesCoverage = metrics.depositRevenue > 0 ? metrics.rangeRevenue / metrics.depositRevenue : 0;
  const isLoading = primaryLoading || secondaryLoading;

  const isTransactionTable = (t: DataTableType | null) => t === "overhead_txns" || t === "cogs_txns";
  const handleTransactionClick = (txn: any) => setEditingTxn(txn);
  const handleTxnSaved = () => {
    setEditingTxn(null);
    queryClient.invalidateQueries({ queryKey: ["drilldown-data"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{spec.title} — {rangeLabel}</DialogTitle>
        </DialogHeader>

        {/* Sales Coverage Warning */}
        {spec.mixesDepositsAndSales && (
          <div className="flex items-center gap-2 text-sm">
            {salesCoverage >= 0.9 ? (
              <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
                <CheckCircle2 className="h-3 w-3" />
                Sales Coverage: {formatPercent(salesCoverage)}
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Sales Coverage: {formatPercent(salesCoverage)} — per-sale metrics may be inflated
              </Badge>
            )}
          </div>
        )}

        {/* Formula breakdown */}
        <div className="space-y-1.5 text-sm">
          {spec.formula.map((line, i) => {
            const val = resolveValue(line.valueKey, metrics);
            const isResult = line.sign === "=";
            return (
              <div
                key={i}
                className={`flex justify-between ${isResult ? "border-t pt-2 font-bold text-base" : ""}`}
              >
                <span>
                  {line.sign === "-" ? "− " : line.sign === "+" ? "" : ""}
                  {line.label}
                </span>
                <span className={`font-semibold ${line.sign === "-" ? "text-destructive" : ""}`}>
                  {formatValue(line.valueKey, val)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Data tables */}
        {isLoading && <p className="text-muted-foreground text-sm py-4">Loading…</p>}

        {!isLoading && primaryTable && primaryData && (
          <div className="mt-4">
            <DataTableView type={primaryTable} data={primaryData} onTransactionClick={isTransactionTable(primaryTable) ? handleTransactionClick : undefined} />
          </div>
        )}

        {!isLoading && secondaryTable && secondaryData && (
          <div className="mt-4">
            <DataTableView type={secondaryTable} data={secondaryData} onTransactionClick={isTransactionTable(secondaryTable) ? handleTransactionClick : undefined} />
          </div>
        )}
      </DialogContent>

      {editingTxn && (
        <TransactionEditSheet
          transaction={editingTxn}
          open={!!editingTxn}
          onOpenChange={(o) => { if (!o) setEditingTxn(null); }}
          onSaved={handleTxnSaved}
        />
      )}
    </Dialog>
  );
}
