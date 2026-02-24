import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { format, addDays } from "date-fns";

export type CogsDetailType = "mtd_cogs_paid" | "next7_cogs_due";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CogsDetailType;
  dateFrom: string;
  dateTo: string;
  rangeLabel: string;
}

export default function CogsDetailDialog({ open, onOpenChange, type, dateFrom, dateTo, rangeLabel }: Props) {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const next7To = format(addDays(now, 7), "yyyy-MM-dd");

  const { data: cogs, isLoading } = useQuery({
    queryKey: ["cogs-detail", type, dateFrom, dateTo],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("cogs_payments").select("*");

      if (type === "mtd_cogs_paid") {
        q = q.eq("status", "paid").gte("date", dateFrom).lte("date", dateTo);
      } else {
        q = q.in("status", ["due", "scheduled"]).gte("due_date", todayStr).lte("due_date", next7To);
      }

      const { data } = await q.order("date", { ascending: false });
      return data ?? [];
    },
  });

  const total = (cogs ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const title = type === "mtd_cogs_paid" ? `${rangeLabel} COGS Paid` : "Next 7 Days COGS Due";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-muted-foreground text-sm py-4">Loading…</p>}

        {!isLoading && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Total — {formatCurrency(total)}</h3>
            {(cogs ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No records found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(cogs ?? []).map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.date}</TableCell>
                      <TableCell>{c.vendor}</TableCell>
                      <TableCell className="font-mono text-xs">{c.order_id ?? "—"}</TableCell>
                      <TableCell>{c.category}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(c.amount))}</TableCell>
                      <TableCell>{c.status}</TableCell>
                      <TableCell>{c.due_date ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
