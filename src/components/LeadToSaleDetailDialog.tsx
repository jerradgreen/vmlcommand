import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rangeFrom: string;
  rangeTo: string;
  rangeLabel: string;
}

export default function LeadToSaleDetailDialog({ open, onOpenChange, rangeFrom, rangeTo, rangeLabel }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead-to-sale-detail", rangeFrom, rangeTo],
    enabled: open,
    queryFn: async () => {
      const { data: sales } = await supabase
        .from("sales")
        .select("id, date, lead_id, revenue, product_name, order_id")
        .eq("sale_type", "new_lead")
        .not("lead_id", "is", null)
        .gte("date", rangeFrom)
        .lte("date", rangeTo)
        .order("date", { ascending: false });

      if (!sales || sales.length === 0) return [];

      const leadIds = [...new Set(sales.map((s) => s.lead_id!))];
      const { data: leads } = await supabase
        .from("leads")
        .select("id, name, submitted_at")
        .in("id", leadIds);

      const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));

      return sales
        .map((s) => {
          const lead = leadMap.get(s.lead_id!);
          if (!lead || !lead.submitted_at || !s.date) return null;
          const days = Math.round(
            (new Date(s.date).getTime() - new Date(lead.submitted_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          return {
            orderId: s.order_id,
            leadName: lead.name ?? "—",
            submittedAt: lead.submitted_at,
            saleDate: s.date,
            days,
            revenue: Number(s.revenue) || 0,
          };
        })
        .filter(Boolean) as { orderId: string; leadName: string; submittedAt: string; saleDate: string; days: number; revenue: number }[];
    },
  });

  const rows = data ?? [];
  const avg = rows.length > 0 ? rows.reduce((s, r) => s + r.days, 0) / rows.length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Avg Days Lead → Sale — {rangeLabel}</DialogTitle>
          <DialogDescription>
            Only new_lead sales with a matched lead ({rangeLabel}). Average: {avg.toFixed(1)} days ({rows.length} sales)
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No matched lead-to-sale pairs found in this range.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead Name</TableHead>
                <TableHead>Lead Date</TableHead>
                <TableHead>Sale Date</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.leadName}</TableCell>
                  <TableCell>{format(new Date(r.submittedAt), "MMM d, yyyy")}</TableCell>
                  <TableCell>{format(new Date(r.saleDate), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right">{r.days}</TableCell>
                  <TableCell className="text-right">${r.revenue.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
