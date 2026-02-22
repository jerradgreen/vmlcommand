import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";

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

export default function Sales() {
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
                <TableHead>Date</TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sales ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No sales found. Import data to get started.
                  </TableCell>
                </TableRow>
              ) : (
                (sales ?? []).map((sale) => (
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
                      ) : (
                        "—"
                      )}
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
