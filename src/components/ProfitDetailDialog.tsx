import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";

export type ProfitDetailType = "net_after_ads_bills" | "profit_proxy";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ProfitDetailType;
  mtdRevenue: number;
  mtdAdSpend: number;
  mtdBillsPaid: number;
  mtdCogsPaid: number;
}

export default function ProfitDetailDialog({ open, onOpenChange, type, mtdRevenue, mtdAdSpend, mtdBillsPaid, mtdCogsPaid }: Props) {
  const netAfterAdsBills = mtdRevenue - mtdAdSpend - mtdBillsPaid;
  const profitProxy = mtdRevenue - mtdAdSpend - mtdBillsPaid - mtdCogsPaid;

  const title = type === "net_after_ads_bills" ? "Net After Ads & Bills" : "Profit Proxy Breakdown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>MTD Revenue</span>
            <span className="font-semibold">{formatCurrency(mtdRevenue)}</span>
          </div>
          <div className="flex justify-between">
            <span>− MTD Ad Spend</span>
            <span className="font-semibold text-destructive">{formatCurrency(mtdAdSpend)}</span>
          </div>
          <div className="flex justify-between">
            <span>− MTD Bills Paid</span>
            <span className="font-semibold text-destructive">{formatCurrency(mtdBillsPaid)}</span>
          </div>

          {type === "net_after_ads_bills" && (
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Net After Ads & Bills</span>
              <span>{formatCurrency(netAfterAdsBills)}</span>
            </div>
          )}

          {type === "profit_proxy" && (
            <>
              <div className="flex justify-between">
                <span>− MTD COGS Paid</span>
                <span className="font-semibold text-destructive">{formatCurrency(mtdCogsPaid)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold text-base">
                <span>Profit Proxy</span>
                <span>{formatCurrency(profitProxy)}</span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
