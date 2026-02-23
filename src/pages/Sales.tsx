import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";

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

type SortKey = "date" | "order_id" | "product_name" | "revenue" | "sale_type" | "match_method" | "match_confidence";
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

export default function Sales() {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
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
    return [...sales].sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];
      if (sortKey === "revenue") { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; }
      if (sortKey === "match_confidence") { aVal = Number(aVal) ?? -1; bVal = Number(bVal) ?? -1; }
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [sales, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-muted-foreground text-sm">{(sales ?? []).length} sales</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground py-8 text-center">Loading…</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Date" sortKey="date" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Order ID" sortKey="order_id" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Product" sortKey="product_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Revenue" sortKey="revenue" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Type" sortKey="sale_type" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Match" sortKey="match_method" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableHead label="Confidence" sortKey="match_confidence" current={sortKey} dir={sortDir} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No sales found. Import data to get started.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="whitespace-nowrap">
                      {sale.date ? format(new Date(sale.date), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{sale.order_id}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{sale.product_name || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(sale.revenue) || 0)}</TableCell>
                    <TableCell>{saleTypeBadge(sale.sale_type)}</TableCell>
                    <TableCell>
                      {sale.match_method ? (
                        <Badge variant="secondary" className="text-xs">{sale.match_method}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {sale.match_confidence != null ? `${sale.match_confidence}%` : "—"}
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
