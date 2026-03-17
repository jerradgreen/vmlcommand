import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search, ArrowUpDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

type SortKey = "submitted_at" | "name" | "email" | "phrase" | "sign_style" | "cognito_form" | "status";
type SortDir = "asc" | "desc";

function SortableHead({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onSort: (k: SortKey) => void;
}) {
  return (
    <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${current === sortKey ? "text-foreground" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );
}

export default function Leads() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formFilter, setFormFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const allRows: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .order("submitted_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allRows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return allRows;
    },
  });

  const { data: matchedLeadIds } = useQuery({
    queryKey: ["matched-lead-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("lead_id")
        .not("lead_id", "is", null);
      return new Set((data ?? []).map((s) => s.lead_id));
    },
  });

  const forms = [...new Set((leads ?? []).map((l) => l.cognito_form))].sort();

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const filtered = (leads ?? []).filter((l) => {
      const matchesSearch =
        !search ||
        l.name?.toLowerCase().includes(search.toLowerCase()) ||
        l.email?.toLowerCase().includes(search.toLowerCase()) ||
        l.phrase?.toLowerCase().includes(search.toLowerCase());
      const matchesForm = formFilter === "all" || l.cognito_form === formFilter;
      return matchesSearch && matchesForm;
    });

    return [...filtered].sort((a, b) => {
      let aVal: any = sortKey === "status"
        ? (matchedLeadIds?.has(a.id) ? "matched" : "unmatched")
        : a[sortKey];
      let bVal: any = sortKey === "status"
        ? (matchedLeadIds?.has(b.id) ? "matched" : "unmatched")
        : b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [leads, search, formFilter, sortKey, sortDir, matchedLeadIds]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete lead");
    } else {
      toast.success("Lead deleted");
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["trend-data"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["matched-lead-ids"] });
    }
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground text-sm">{sorted.length} leads</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, email, phrase…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={formFilter} onValueChange={setFormFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All forms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All forms</SelectItem>
            {forms.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground py-8 text-center">Loading…</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Date" sortKey="submitted_at" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Name" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Email" sortKey="email" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Phrase" sortKey="phrase" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Form" sortKey="cognito_form" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={handleSort} />
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No leads found. Import data to get started.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="whitespace-nowrap">
                      {lead.submitted_at ? format(new Date(lead.submitted_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{lead.name || "—"}</TableCell>
                    <TableCell>{lead.email || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{lead.phrase || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{lead.cognito_form}</Badge>
                    </TableCell>
                    <TableCell>
                      {matchedLeadIds?.has(lead.id) ? (
                        <Badge className="bg-success text-success-foreground text-xs">Matched</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Unmatched</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(lead.id)}
                        disabled={deleting === lead.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
