import { useState } from "react";
import { getAllParentCategories, categoryLabel } from "@/lib/categoryTaxonomy";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Play, Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import TransactionEditSheet from "@/components/TransactionEditSheet";
import RuleFormDialog from "@/components/RuleFormDialog";
import TransactionCsvImport from "@/components/TransactionCsvImport";
import BulkLabelBar from "@/components/BulkLabelBar";

const PAGE_SIZE = 50;

type TransactionRow = {
  id: string;
  txn_date: string;
  description: string | null;
  amount: number;
  account_name: string | null;
  txn_type: string | null;
  txn_category: string | null;
  vendor: string | null;
  is_locked: boolean;
  is_recurring: boolean;
  rule_id_applied: string | null;
  classified_at: string | null;
};

type RuleRow = {
  id: string;
  is_active: boolean;
  priority: number;
  match_type: string;
  match_value: string;
  match_field: string;
  assign_txn_type: string | null;
  assign_category: string | null;
  assign_vendor: string | null;
  notes: string | null;
  created_at: string;
};

export default function Transactions() {
  const [tab, setTab] = useState("transactions");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Transactions</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="transactions">
          <TransactionsTab />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Transactions Tab ─── */

function TransactionsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [ruleFilter, setRuleFilter] = useState<string>("all");
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch rules with transaction counts for the audit dropdown
  const { data: ruleOptions } = useQuery({
    queryKey: ["rule-audit-options"],
    queryFn: async () => {
      const { data: rules, error: rulesErr } = await supabase
        .from("transaction_rules")
        .select("id, match_value, match_type, is_active");
      if (rulesErr) throw rulesErr;

      // Get counts per rule
      const { data: counts, error: countErr } = await supabase
        .from("financial_transactions")
        .select("rule_id_applied")
        .not("rule_id_applied", "is", null);
      if (countErr) throw countErr;

      const countMap: Record<string, number> = {};
      (counts ?? []).forEach((r: { rule_id_applied: string | null }) => {
        if (r.rule_id_applied) countMap[r.rule_id_applied] = (countMap[r.rule_id_applied] || 0) + 1;
      });

      return (rules ?? [])
        .map((r) => ({ id: r.id, label: `${r.match_value}${r.is_active ? "" : " (off)"}`, count: countMap[r.id] || 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", page, search, typeFilter, categoryFilter, ruleFilter, uncategorizedOnly],
    queryFn: async () => {
      let q = supabase
        .from("financial_transactions")
        .select("id, txn_date, description, amount, account_name, txn_type, txn_category, vendor, is_locked, is_recurring, rule_id_applied, classified_at", { count: "exact" })
        .order("txn_date", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        q = q.ilike("description", `%${search}%`);
      }
      if (typeFilter !== "all") {
        q = q.eq("txn_type", typeFilter);
      }
      if (categoryFilter !== "all") {
        q = q.eq("txn_category", categoryFilter);
      }
      if (ruleFilter !== "all") {
        q = q.eq("rule_id_applied", ruleFilter);
      }
      if (uncategorizedOnly) {
        q = q.is("txn_type", null);
      }

      const { data: rows, count, error } = await q;
      if (error) throw error;
      return { rows: (rows ?? []) as TransactionRow[], total: count ?? 0 };
    },
  });

  const runRulesMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("apply_rules_to_unclassified", { p_limit: 5000 });
      if (error) throw error;
      return data as { updated: number };
    },
    onSuccess: (d) => {
      toast.success(`Classified ${(d as { updated: number }).updated} transactions`);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {getAllParentCategories().map((cat) => (
              <SelectItem key={cat} value={cat}>{categoryLabel(cat)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ruleFilter} onValueChange={(v) => { setRuleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Classified by Rule" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rules</SelectItem>
            {(ruleOptions ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.label} — {r.count} txns</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="uncat" checked={uncategorizedOnly} onCheckedChange={(v) => { setUncategorizedOnly(v); setPage(0); }} />
          <Label htmlFor="uncat" className="text-sm whitespace-nowrap">Uncategorized only</Label>
        </div>
        <TransactionCsvImport />
        <Button size="sm" variant="outline" onClick={() => runRulesMutation.mutate()} disabled={runRulesMutation.isPending}>
          <Play className="h-4 w-4 mr-1" />
          Run Rules
        </Button>
      </div>

      {/* Bulk Label Bar */}
      {selectedIds.size > 0 && (
        <BulkLabelBar
          selectedIds={Array.from(selectedIds)}
          onClear={() => setSelectedIds(new Set())}
          onApplied={() => { setSelectedIds(new Set()); queryClient.invalidateQueries({ queryKey: ["transactions"] }); }}
        />
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={rows.length > 0 && rows.every((t) => selectedIds.has(t.id))}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedIds(new Set(rows.map((t) => t.id)));
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Vendor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
          ) : (
            rows.map((txn) => (
              <TableRow key={txn.id} className="cursor-pointer">
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(txn.id)}
                    onCheckedChange={(checked) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(txn.id); else next.delete(txn.id);
                        return next;
                      });
                    }}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap" onClick={() => setEditTxn(txn)}>{format(new Date(txn.txn_date), "MMM d, yyyy")}</TableCell>
                <TableCell className="max-w-[300px] truncate" onClick={() => setEditTxn(txn)}>{txn.description}</TableCell>
                <TableCell className="text-right whitespace-nowrap font-mono" onClick={() => setEditTxn(txn)}>
                  {txn.amount < 0 ? "-" : ""}${Math.abs(txn.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-muted-foreground" onClick={() => setEditTxn(txn)}>{txn.account_name}</TableCell>
                <TableCell onClick={() => setEditTxn(txn)}>{txn.txn_type ? <Badge variant="secondary">{txn.txn_type}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                <TableCell onClick={() => setEditTxn(txn)}>{txn.txn_category ? <Badge variant="outline">{txn.txn_category}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                <TableCell className="max-w-[120px] truncate" onClick={() => setEditTxn(txn)}>{txn.vendor ?? "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} transactions</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
            <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      {editTxn && (
        <TransactionEditSheet
          transaction={editTxn}
          open={!!editTxn}
          onOpenChange={(open) => { if (!open) setEditTxn(null); }}
          onSaved={() => { setEditTxn(null); queryClient.invalidateQueries({ queryKey: ["transactions"] }); }}
        />
      )}
    </div>
  );
}

/* ─── Rules Tab ─── */

function RulesTab() {
  const queryClient = useQueryClient();
  const [editRule, setEditRule] = useState<RuleRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["transaction-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_rules")
        .select("*")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RuleRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transaction_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule deleted");
      queryClient.invalidateQueries({ queryKey: ["transaction-rules"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Add Rule</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Priority</TableHead>
            <TableHead>Match</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Assigns</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
          ) : !rules?.length ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No rules yet</TableCell></TableRow>
          ) : (
            rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>{rule.priority}</TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground mr-1">{rule.match_type}:</span>
                  <span className="font-mono text-sm">{rule.match_value}</span>
                </TableCell>
                <TableCell><Badge variant="outline">{rule.match_field}</Badge></TableCell>
                <TableCell className="space-x-1">
                  {rule.assign_txn_type && <Badge variant="secondary">{rule.assign_txn_type}</Badge>}
                  {rule.assign_category && <Badge variant="outline">{rule.assign_category}</Badge>}
                  {rule.assign_vendor && <span className="text-xs text-muted-foreground ml-1">{rule.assign_vendor}</span>}
                </TableCell>
                <TableCell>{rule.is_active ? "✓" : "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditRule(rule)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(rule.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {(showCreate || editRule) && (
        <RuleFormDialog
          rule={editRule ?? undefined}
          open={showCreate || !!editRule}
          onOpenChange={(open) => { if (!open) { setShowCreate(false); setEditRule(null); } }}
          onSaved={() => { setShowCreate(false); setEditRule(null); queryClient.invalidateQueries({ queryKey: ["transaction-rules"] }); }}
        />
      )}
    </div>
  );
}
