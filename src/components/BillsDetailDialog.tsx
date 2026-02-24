import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { format, startOfMonth, addDays } from "date-fns";

export type BillsDetailType = "mtd_bills_paid" | "next7_bills_due";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: BillsDetailType;
}

export default function BillsDetailDialog({ open, onOpenChange, type }: Props) {
  const now = new Date();
  const mtdFrom = format(startOfMonth(now), "yyyy-MM-dd");
  const mtdTo = format(now, "yyyy-MM-dd");
  const next7To = format(addDays(now, 7), "yyyy-MM-dd");

  const { data: bills, isLoading } = useQuery({
    queryKey: ["bills-detail", type],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("bills").select("*");

      if (type === "mtd_bills_paid") {
        q = q.eq("status", "paid").gte("date", mtdFrom).lte("date", mtdTo);
      } else {
        q = q.in("status", ["due", "scheduled"]).gte("due_date", format(now, "yyyy-MM-dd")).lte("due_date", next7To);
      }

      const { data } = await q.order("date", { ascending: false });
      return data ?? [];
    },
  });

  const total = (bills ?? []).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const title = type === "mtd_bills_paid" ? "MTD Bills Paid" : "Next 7 Days Bills Due";

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
            {(bills ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No records found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(bills ?? []).map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell>{b.date}</TableCell>
                      <TableCell>{b.vendor}</TableCell>
                      <TableCell>{b.category}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(b.amount))}</TableCell>
                      <TableCell>{b.status}</TableCell>
                      <TableCell>{b.due_date ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{b.notes ?? "—"}</TableCell>
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
