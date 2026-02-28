import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatPercent } from "@/lib/format";
import { CalendarIcon, Factory, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */
interface MfgTransaction {
  id: string;
  txn_date: string;
  description: string | null;
  vendor: string | null;
  amount: number;
  allocated: number;
}

interface SaleRow {
  id: string;
  date: string | null;
  order_id: string;
  revenue: number;
  estimated_cogs_pct: number;
  manufacturing_status: string;
  allocated_mfg: number;
}

interface Allocation {
  id: string;
  sale_id: string;
  financial_transaction_id: string;
  vendor_name: string | null;
  allocated_amount: number;
  allocation_date: string;
  notes: string | null;
}

/* ── Hook: Manufacturing transactions ── */
function useMfgTransactions() {
  return useQuery({
    queryKey: ["mfg-transactions"],
    queryFn: async () => {
      const { data: txns, error } = await supabase
        .from("financial_transactions")
        .select("id, txn_date, description, vendor, amount")
        .eq("txn_category", "cogs")
        .eq("txn_subcategory", "manufacturing")
        .order("txn_date", { ascending: false });
      if (error) throw error;

      const { data: allocs, error: ae } = await supabase
        .from("cogs_allocations")
        .select("financial_transaction_id, allocated_amount");
      if (ae) throw ae;

      const allocMap = new Map<string, number>();
      (allocs ?? []).forEach((a) => {
        allocMap.set(a.financial_transaction_id, (allocMap.get(a.financial_transaction_id) ?? 0) + Number(a.allocated_amount));
      });

      return (txns ?? []).map((t) => ({
        ...t,
        amount: Number(t.amount),
        allocated: allocMap.get(t.id) ?? 0,
      })) as MfgTransaction[];
    },
  });
}

/* ── Hook: Sales with allocations ── */
function useSalesForAllocation(dateFrom: string | null, dateTo: string | null, showUnpaidOnly: boolean) {
  return useQuery({
    queryKey: ["sales-for-allocation", dateFrom, dateTo, showUnpaidOnly],
    queryFn: async () => {
      let q = supabase.from("sales").select("id, date, order_id, revenue, estimated_cogs_pct, manufacturing_status");
      if (dateFrom) q = q.gte("date", dateFrom);
      if (dateTo) q = q.lte("date", dateTo);
      if (showUnpaidOnly) q = q.in("manufacturing_status", ["unpaid", "partial"]);
      q = q.order("date", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;

      const saleIds = (data ?? []).map((s) => s.id);
      let allocMap = new Map<string, number>();
      if (saleIds.length > 0) {
        const { data: allocs } = await supabase
          .from("cogs_allocations")
          .select("sale_id, allocated_amount")
          .in("sale_id", saleIds);
        (allocs ?? []).forEach((a) => {
          allocMap.set(a.sale_id, (allocMap.get(a.sale_id) ?? 0) + Number(a.allocated_amount));
        });
      }

      return (data ?? []).map((s) => ({
        ...s,
        revenue: Number(s.revenue ?? 0),
        estimated_cogs_pct: Number(s.estimated_cogs_pct),
        allocated_mfg: allocMap.get(s.id) ?? 0,
      })) as SaleRow[];
    },
  });
}

/* ── Hook: Allocations for a transaction ── */
function useAllocationsForTxn(txnId: string | null) {
  return useQuery({
    queryKey: ["allocations-for-txn", txnId],
    enabled: !!txnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cogs_allocations")
        .select("*")
        .eq("financial_transaction_id", txnId!);
      if (error) throw error;
      return (data ?? []) as Allocation[];
    },
  });
}

/* ══════════════════ COMPONENT ══════════════════ */
export default function CogsReconciliation() {
  const queryClient = useQueryClient();
  const defaultFrom = format(subDays(new Date(), 120), "yyyy-MM-dd");
  const defaultTo = format(new Date(), "yyyy-MM-dd");

  const [salesDateFrom, setSalesDateFrom] = useState<Date | undefined>(subDays(new Date(), 120));
  const [salesDateTo, setSalesDateTo] = useState<Date | undefined>(new Date());
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set());
  const [allocationMode, setAllocationMode] = useState<"auto" | "manual">("auto");
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  const [editingCogsPct, setEditingCogsPct] = useState<string | null>(null);
  const [cogsPctValue, setCogsPctValue] = useState("");

  const salesFrom = salesDateFrom ? format(salesDateFrom, "yyyy-MM-dd") : null;
  const salesTo = salesDateTo ? format(salesDateTo, "yyyy-MM-dd") : null;

  const { data: mfgTxns = [], isLoading: mfgLoading } = useMfgTransactions();
  const { data: sales = [], isLoading: salesLoading } = useSalesForAllocation(salesFrom, salesTo, showUnpaidOnly);
  const { data: txnAllocations = [] } = useAllocationsForTxn(selectedTxnId);

  const selectedTxn = mfgTxns.find((t) => t.id === selectedTxnId);
  const txnRemainingUnallocated = selectedTxn ? Math.abs(selectedTxn.amount) - selectedTxn.allocated : 0;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["mfg-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["sales-for-allocation"] });
    queryClient.invalidateQueries({ queryKey: ["allocations-for-txn"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
  };

  /* ── Save allocations ── */
  const saveAllocationMutation = useMutation({
    mutationFn: async (allocations: { sale_id: string; amount: number }[]) => {
      if (!selectedTxnId || !selectedTxn) throw new Error("No transaction selected");

      const totalNew = allocations.reduce((s, a) => s + a.amount, 0);
      if (totalNew > txnRemainingUnallocated + 0.01) {
        throw new Error(`Total allocations ($${totalNew.toFixed(2)}) exceed remaining unallocated ($${txnRemainingUnallocated.toFixed(2)})`);
      }

      for (const a of allocations) {
        if (a.amount < 0) throw new Error("Allocation cannot be negative");
        const sale = sales.find((s) => s.id === a.sale_id);
        if (sale) {
          const remainingMfg = Math.max(sale.revenue * sale.estimated_cogs_pct - sale.allocated_mfg, 0);
          if (a.amount > remainingMfg + 0.01) {
            throw new Error(`Allocation for ${sale.order_id} ($${a.amount.toFixed(2)}) exceeds remaining mfg ($${remainingMfg.toFixed(2)})`);
          }
        }
      }

      // Insert allocations
      const rows = allocations.filter((a) => a.amount > 0).map((a) => ({
        sale_id: a.sale_id,
        financial_transaction_id: selectedTxnId,
        vendor_name: selectedTxn.vendor ?? selectedTxn.description,
        allocated_amount: a.amount,
      }));

      if (rows.length === 0) throw new Error("No allocations to save");

      const { error } = await supabase.from("cogs_allocations").insert(rows);
      if (error) throw error;

      // Update manufacturing_status for each affected sale
      for (const a of allocations.filter((x) => x.amount > 0)) {
        const sale = sales.find((s) => s.id === a.sale_id);
        if (!sale) continue;
        const newAllocated = sale.allocated_mfg + a.amount;
        const estimated = sale.revenue * sale.estimated_cogs_pct;
        let status = "unpaid";
        if (newAllocated > 0 && newAllocated < estimated) status = "partial";
        if (newAllocated >= estimated) status = "paid";
        await supabase.from("sales").update({ manufacturing_status: status }).eq("id", a.sale_id);
      }
    },
    onSuccess: () => {
      toast({ title: "Allocations saved", description: "Manufacturing allocations recorded successfully." });
      setSelectedSaleIds(new Set());
      setManualAmounts({});
      invalidateAll();
    },
    onError: (err: Error) => {
      toast({ title: "Allocation failed", description: err.message, variant: "destructive" });
    },
  });

  /* ── Delete allocation ── */
  const deleteAllocationMutation = useMutation({
    mutationFn: async (allocId: string) => {
      const alloc = txnAllocations.find((a) => a.id === allocId);
      if (!alloc) throw new Error("Allocation not found");

      const { error } = await supabase.from("cogs_allocations").delete().eq("id", allocId);
      if (error) throw error;

      // Recompute status
      const { data: remaining } = await supabase
        .from("cogs_allocations")
        .select("allocated_amount")
        .eq("sale_id", alloc.sale_id);
      const totalAlloc = (remaining ?? []).reduce((s, r) => s + Number(r.allocated_amount), 0);

      const { data: saleData } = await supabase
        .from("sales")
        .select("revenue, estimated_cogs_pct")
        .eq("id", alloc.sale_id)
        .single();

      if (saleData) {
        const estimated = Number(saleData.revenue ?? 0) * Number(saleData.estimated_cogs_pct);
        let status = "unpaid";
        if (totalAlloc > 0 && totalAlloc < estimated) status = "partial";
        if (totalAlloc >= estimated) status = "paid";
        await supabase.from("sales").update({ manufacturing_status: status }).eq("id", alloc.sale_id);
      }
    },
    onSuccess: () => {
      toast({ title: "Allocation deleted" });
      invalidateAll();
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  /* ── Update estimated_cogs_pct ── */
  const updateCogsPctMutation = useMutation({
    mutationFn: async ({ saleId, pct }: { saleId: string; pct: number }) => {
      if (pct < 0 || pct > 1) throw new Error("Percentage must be between 0 and 1");
      const { error } = await supabase.from("sales").update({ estimated_cogs_pct: pct }).eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingCogsPct(null);
      invalidateAll();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  /* ── Auto-split computation ── */
  const computeAutoSplit = useCallback(() => {
    if (!selectedTxn || selectedSaleIds.size === 0) return [];
    const selectedSales = sales.filter((s) => selectedSaleIds.has(s.id));
    const totalRemaining = selectedSales.reduce((sum, s) => sum + Math.max(s.revenue * s.estimated_cogs_pct - s.allocated_mfg, 0), 0);
    if (totalRemaining === 0) return selectedSales.map((s) => ({ sale_id: s.id, amount: 0 }));

    let pool = txnRemainingUnallocated;
    return selectedSales.map((s) => {
      const remainingMfg = Math.max(s.revenue * s.estimated_cogs_pct - s.allocated_mfg, 0);
      const share = (remainingMfg / totalRemaining) * Math.min(txnRemainingUnallocated, totalRemaining);
      const amount = Math.min(share, remainingMfg);
      return { sale_id: s.id, amount: Math.round(amount * 100) / 100 };
    });
  }, [selectedTxn, selectedSaleIds, sales, txnRemainingUnallocated]);

  const handleSave = () => {
    let allocations: { sale_id: string; amount: number }[];
    if (allocationMode === "auto") {
      allocations = computeAutoSplit();
    } else {
      allocations = Array.from(selectedSaleIds).map((id) => ({
        sale_id: id,
        amount: Number(manualAmounts[id] ?? 0),
      }));
    }
    saveAllocationMutation.mutate(allocations);
  };

  const toggleSale = (id: string) => {
    setSelectedSaleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const statusBadge = (status: string) => {
    const variant = status === "paid" ? "default" : status === "partial" ? "secondary" : "outline";
    return <Badge variant={variant}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Factory className="h-6 w-6" /> COGS Reconciliation
        </h1>
        <p className="text-sm text-muted-foreground">Allocate manufacturing wire payments to individual sales</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ═══ LEFT PANEL: Manufacturing Transactions ═══ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manufacturing Payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {mfgLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : mfgTxns.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No manufacturing transactions found. Classify bank transactions with subcategory "manufacturing" to see them here.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mfgTxns.map((t) => {
                    const remaining = Math.abs(t.amount) - t.allocated;
                    return (
                      <TableRow
                        key={t.id}
                        className={cn("cursor-pointer", selectedTxnId === t.id && "bg-accent")}
                        onClick={() => setSelectedTxnId(t.id === selectedTxnId ? null : t.id)}
                      >
                        <TableCell className="text-xs">{t.txn_date}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{t.vendor ?? t.description}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{formatCurrency(Math.abs(t.amount))}</TableCell>
                        <TableCell className="text-right text-xs">{formatCurrency(t.allocated)}</TableCell>
                        <TableCell className={cn("text-right text-xs font-medium", remaining > 0 ? "text-amber-600" : "text-emerald-600")}>
                          {formatCurrency(remaining)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {/* Existing allocations for selected transaction */}
            {selectedTxnId && txnAllocations.length > 0 && (
              <div className="border-t p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Existing Allocations</p>
                {txnAllocations.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <span>{a.sale_id.slice(0, 8)}… — {formatCurrency(Number(a.allocated_amount))}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => deleteAllocationMutation.mutate(a.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ RIGHT PANEL: Sales ═══ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales to Allocate</CardTitle>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {salesDateFrom ? format(salesDateFrom, "MMM d") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={salesDateFrom} onSelect={setSalesDateFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">–</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {salesDateTo ? format(salesDateTo, "MMM d") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={salesDateTo} onSelect={setSalesDateTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="sm" onClick={() => { setSalesDateFrom(undefined); setSalesDateTo(undefined); }}>
                All Time
              </Button>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={showUnpaidOnly} onCheckedChange={(c) => setShowUnpaidOnly(!!c)} />
                Unpaid only
              </label>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {salesLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : sales.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No sales in this range.</div>
            ) : (
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Est %</TableHead>
                      <TableHead className="text-right">Est Mfg</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead>Status</TableHead>
                      {allocationMode === "manual" && <TableHead className="text-right">Amount</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((s) => {
                      const estMfg = s.revenue * s.estimated_cogs_pct;
                      const remaining = Math.max(estMfg - s.allocated_mfg, 0);
                      const isEditing = editingCogsPct === s.id;
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedSaleIds.has(s.id)}
                              onCheckedChange={() => toggleSale(s.id)}
                              disabled={!selectedTxnId || remaining === 0}
                            />
                          </TableCell>
                          <TableCell className="text-xs">{s.date}</TableCell>
                          <TableCell className="text-xs font-medium">{s.order_id}</TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(s.revenue)}</TableCell>
                          <TableCell className="text-right text-xs">
                            {isEditing ? (
                              <Input
                                className="h-6 w-16 text-xs"
                                value={cogsPctValue}
                                onChange={(e) => setCogsPctValue(e.target.value)}
                                onBlur={() => {
                                  const v = parseFloat(cogsPctValue);
                                  if (!isNaN(v) && v >= 0 && v <= 100) {
                                    updateCogsPctMutation.mutate({ saleId: s.id, pct: v / 100 });
                                  } else {
                                    setEditingCogsPct(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                  if (e.key === "Escape") setEditingCogsPct(null);
                                }}
                                autoFocus
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:underline"
                                onClick={() => {
                                  setEditingCogsPct(s.id);
                                  setCogsPctValue((s.estimated_cogs_pct * 100).toFixed(0));
                                }}
                              >
                                {(s.estimated_cogs_pct * 100).toFixed(0)}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(estMfg)}</TableCell>
                          <TableCell className="text-right text-xs">{formatCurrency(s.allocated_mfg)}</TableCell>
                          <TableCell className={cn("text-right text-xs font-medium", remaining > 0 ? "text-amber-600" : "text-emerald-600")}>
                            {formatCurrency(remaining)}
                          </TableCell>
                          <TableCell>{statusBadge(s.manufacturing_status)}</TableCell>
                          {allocationMode === "manual" && selectedSaleIds.has(s.id) && (
                            <TableCell className="text-right">
                              <Input
                                className="h-6 w-20 text-xs"
                                type="number"
                                min={0}
                                max={remaining}
                                value={manualAmounts[s.id] ?? ""}
                                onChange={(e) => setManualAmounts((p) => ({ ...p, [s.id]: e.target.value }))}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Allocation controls */}
            {selectedTxnId && selectedSaleIds.size > 0 && (
              <div className="border-t p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium">Mode:</span>
                  <Select value={allocationMode} onValueChange={(v) => setAllocationMode(v as "auto" | "manual")}>
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-split</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Remaining: {formatCurrency(txnRemainingUnallocated)} · {selectedSaleIds.size} selected
                  </span>
                </div>

                {allocationMode === "auto" && (
                  <div className="text-xs text-muted-foreground">
                    Will distribute {formatCurrency(Math.min(txnRemainingUnallocated, sales.filter((s) => selectedSaleIds.has(s.id)).reduce((sum, s) => sum + Math.max(s.revenue * s.estimated_cogs_pct - s.allocated_mfg, 0), 0)))} proportionally across selected sales.
                  </div>
                )}

                <Button size="sm" onClick={handleSave} disabled={saveAllocationMutation.isPending}>
                  {saveAllocationMutation.isPending ? "Saving…" : "Save Allocations"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
