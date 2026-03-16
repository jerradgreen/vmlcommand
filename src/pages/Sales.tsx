import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { ArrowUpDown, Check, X, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STYLE_OPTIONS = [
  "Event Style",
  "Letters/Numbers-Wall Hanging",
  "Layered, single-unit sign (logo, etc)",
  "Rental Inventory Package Info",
  "Mobile Vendor Sign",
  "Not sure",
];

function saleTypeBadge(type: string) {
  switch (type) {
    case "new_lead":
      return <Badge className="bg-success text-success-foreground text-xs">New Lead</Badge>;
    case "repeat_direct":
      return <Badge variant="secondary" className="text-xs">Repeat/Direct</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">Unknown</Badge>;
  }
}

type SortKey = "date" | "order_id" | "product_name" | "sign_style" | "revenue" | "sale_type" | "email" | "lead_name";
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

function InlineStyleEditor({ saleId, currentStyle, onSaved }: { saleId: string; currentStyle: string | null; onSaved: (newStyle: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    setEditing(false);
    setCustomMode(false);
    onSaved(trimmed); // optimistic update
    const { error } = await supabase.from("sales").update({ sign_style: trimmed } as any).eq("id", saleId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (!editing) {
    return (
      <span
        className="inline-flex items-center gap-1 cursor-pointer group hover:text-primary"
        onClick={() => setEditing(true)}
      >
        {currentStyle || <span className="text-muted-foreground">—</span>}
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
      </span>
    );
  }

  if (customMode) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          className="h-7 w-36 text-xs"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave(customValue);
            if (e.key === "Escape") { setEditing(false); setCustomMode(false); }
          }}
        />
        <button onClick={() => handleSave(customValue)} className="text-primary"><Check className="h-3.5 w-3.5" /></button>
        <button onClick={() => { setEditing(false); setCustomMode(false); }} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  return (
    <Select
      onValueChange={(val) => {
        if (val === "__custom__") {
          setCustomMode(true);
          setCustomValue(currentStyle || "");
        } else {
          handleSave(val);
        }
      }}
    >
      <SelectTrigger className="h-7 w-44 text-xs">
        <SelectValue placeholder="Select style…" />
      </SelectTrigger>
      <SelectContent>
        {STYLE_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
        <SelectItem value="__custom__">Custom…</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default function Sales() {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const queryClient = useQueryClient();

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, leads(name)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data.map((s: any) => ({
        ...s,
        lead_name: s.leads?.name ?? null,
      }));
    },
  });

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    if (!sales) return [];
    return [...sales].sort((a: any, b: any) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (sortKey === "revenue") { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; }
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [sales, sortKey, sortDir]);

  const handleStyleUpdate = (saleId: string, newStyle: string) => {
    queryClient.setQueryData(["sales"], (old: any[] | undefined) =>
      old?.map((s) => s.id === saleId ? { ...s, sign_style: newStyle } : s)
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-muted-foreground text-sm">{(sales ?? []).length} sales</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground py-8 text-center">Loading…</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Date" sortKey="date" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Order ID" sortKey="order_id" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Lead" sortKey="lead_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Email" sortKey="email" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Product" sortKey="product_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Style" sortKey="sign_style" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Revenue" sortKey="revenue" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Type" sortKey="sale_type" current={sortKey} dir={sortDir} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No sales found. Import data to get started.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((sale: any) => (
                  <TableRow key={sale.id}>
                    <TableCell className="whitespace-nowrap">
                      {sale.date ? format(new Date(sale.date), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{sale.order_id}</TableCell>
                    <TableCell className="max-w-[140px] truncate">{sale.lead_name || "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">{sale.email || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{sale.product_name || "—"}</TableCell>
                    <TableCell>
                      <InlineStyleEditor saleId={sale.id} currentStyle={sale.sign_style} onSaved={(newStyle) => handleStyleUpdate(sale.id, newStyle)} />
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(sale.revenue) || 0)}</TableCell>
                    <TableCell>{saleTypeBadge(sale.sale_type)}</TableCell>
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
