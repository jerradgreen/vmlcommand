import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, addDays } from "date-fns";
import { formatCurrency } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function Next7DueDetailDialog({ open, onOpenChange }: Props) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const next7Str = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["next7-due-combined", todayStr],
    enabled: open,
    queryFn: async () => {
      const [billsRes, cogsRes] = await Promise.all([
        supabase
          .from("bills")
          .select("id, vendor, category, amount, due_date, status")
          .in("status", ["due", "scheduled"])
          .gte("due_date", todayStr)
          .lte("due_date", next7Str)
          .order("due_date"),
        supabase
          .from("cogs_payments")
          .select("id, vendor, order_id, amount, due_date, status")
          .in("status", ["due", "scheduled"])
          .gte("due_date", todayStr)
          .lte("due_date", next7Str)
          .order("due_date"),
      ]);
      return {
        bills: billsRes.data ?? [],
        cogs: cogsRes.data ?? [],
      };
    },
  });

  const bills = data?.bills ?? [];
  const cogs = data?.cogs ?? [];
  const billsTotal = bills.reduce((s, b) => s + Number(b.amount), 0);
  const cogsTotal = cogs.reduce((s, c) => s + Number(c.amount), 0);
  const combined = billsTotal + cogsTotal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Next 7 Days Due</DialogTitle>
          <DialogDescription>Combined Total: {formatCurrency(combined)}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-2">Bills Due ({formatCurrency(billsTotal)})</h3>
              {bills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bills due in the next 7 days.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>{b.due_date ? format(new Date(b.due_date), "MMM d") : "—"}</TableCell>
                        <TableCell>{b.vendor}</TableCell>
                        <TableCell>{b.category}</TableCell>
                        <TableCell>{b.status}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(b.amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">COGS Due ({formatCurrency(cogsTotal)})</h3>
              {cogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No COGS due in the next 7 days.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cogs.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.due_date ? format(new Date(c.due_date), "MMM d") : "—"}</TableCell>
                        <TableCell>{c.vendor}</TableCell>
                        <TableCell>{c.order_id ?? "—"}</TableCell>
                        <TableCell>{c.status}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(c.amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
