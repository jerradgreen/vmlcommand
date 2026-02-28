import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { format, subDays } from "date-fns";

export type AdSpendDetailType =
  | "yesterday_ad_spend"
  | "mtd_ad_spend"
  | "mtd_revenue"
  | "mtd_roas"
  | "net_after_ads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: AdSpendDetailType;
  dateFrom: string;
  dateTo: string;
  rangeLabel: string;
  depositRevenue?: number;
}

function useExpenses(dateFrom: string, dateTo: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ad-spend-detail-expenses", dateFrom, dateTo],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("*")
        .eq("category", "ads")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false });
      return data ?? [];
    },
  });
}

function useSalesInRange(dateFrom: string, dateTo: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ad-spend-detail-sales", dateFrom, dateTo],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("order_id, product_name, revenue, date, sale_type")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: false });
      return data ?? [];
    },
  });
}

export default function AdSpendDetailDialog({ open, onOpenChange, type, dateFrom, dateTo, rangeLabel, depositRevenue }: Props) {
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const showExpenses = ["yesterday_ad_spend", "mtd_ad_spend", "mtd_roas", "net_after_ads"].includes(type);
  const showSales = ["mtd_revenue", "mtd_roas", "net_after_ads"].includes(type);

  const expDateFrom = type === "yesterday_ad_spend" ? yesterdayStr : dateFrom;
  const expDateTo = type === "yesterday_ad_spend" ? yesterdayStr : dateTo;

  const { data: expenses, isLoading: expLoading } = useExpenses(expDateFrom, expDateTo, open && showExpenses);
  const { data: sales, isLoading: salesLoading } = useSalesInRange(dateFrom, dateTo, open && showSales);

  const totalExpenses = (expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalSalesRev = (sales ?? []).reduce((s, r) => s + (Number(r.revenue) || 0), 0);

  const isLoading = (showExpenses && expLoading) || (showSales && salesLoading);

  const titles: Record<AdSpendDetailType, string> = {
    yesterday_ad_spend: "Yesterday Ad Spend",
    mtd_ad_spend: `${rangeLabel} Ad Spend`,
    mtd_revenue: `${rangeLabel} Revenue`,
    mtd_roas: `${rangeLabel} ROAS Breakdown`,
    net_after_ads: "Net After Ads Breakdown",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titles[type]}</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-muted-foreground text-sm py-4">Loading…</p>}

        {!isLoading && showExpenses && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              Ad Spend — {formatCurrency(totalExpenses)}
            </h3>
            {(expenses ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No expense records found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(expenses ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.date}</TableCell>
                      <TableCell>{e.platform}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(e.amount))}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{e.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {!isLoading && showSales && (
          <div className="space-y-2 mt-4">
            <h3 className="text-sm font-semibold">
              {rangeLabel} Revenue — {formatCurrency(totalSalesRev)}
            </h3>
            {(sales ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No sales found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sales ?? []).map((s) => (
                    <TableRow key={s.order_id}>
                      <TableCell>{s.date}</TableCell>
                      <TableCell className="font-mono text-xs">{s.order_id}</TableCell>
                      <TableCell>{s.product_name ?? "—"}</TableCell>
                      <TableCell>{s.sale_type}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(s.revenue) || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {!isLoading && (type === "mtd_roas" || type === "net_after_ads") && (() => {
          const summaryRevenue = depositRevenue ?? totalSalesRev;
          return (
            <div className="mt-4 border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>{rangeLabel} Revenue (bank deposits)</span>
                <span className="font-semibold">{formatCurrency(summaryRevenue)}</span>
              </div>
              {totalSalesRev !== summaryRevenue && (
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Sales sheet total</span>
                  <span>{formatCurrency(totalSalesRev)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>{rangeLabel} Ad Spend</span>
                <span className="font-semibold">{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold">
                {type === "mtd_roas" ? (
                  <>
                    <span>ROAS</span>
                    <span>{totalExpenses > 0 ? `${(summaryRevenue / totalExpenses).toFixed(2)}x` : "—"}</span>
                  </>
                ) : (
                  <>
                    <span>Net After Ads</span>
                    <span>{formatCurrency(summaryRevenue - totalExpenses)}</span>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
