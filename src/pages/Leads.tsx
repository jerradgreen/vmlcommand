import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Search } from "lucide-react";

export default function Leads() {
  const [search, setSearch] = useState("");
  const [formFilter, setFormFilter] = useState("all");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Check which leads have matched sales
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

  const filtered = (leads ?? []).filter((l) => {
    const matchesSearch =
      !search ||
      l.name?.toLowerCase().includes(search.toLowerCase()) ||
      l.email?.toLowerCase().includes(search.toLowerCase()) ||
      l.phrase?.toLowerCase().includes(search.toLowerCase());
    const matchesForm = formFilter === "all" || l.cognito_form === formFilter;
    return matchesSearch && matchesForm;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground text-sm">{filtered.length} leads</p>
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
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phrase</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No leads found. Import data to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => (
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
