import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";

export type ProfitDetailType =
  | "net_after_ads_bills"
  | "profit_proxy"
  | "contribution"
  | "total_operating_cost"
  | "net_after_upcoming_due";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ProfitDetailType;
  mtdRevenue: number;
  mtdAdSpend: number;
  mtdBillsPaid: number;
  mtdCogsPaid: number;
  next7TotalDue?: number;
  rangeLabel: string;
}

export default function ProfitDetailDialog({
  open, onOpenChange, type, mtdRevenue, mtdAdSpend, mtdBillsPaid, mtdCogsPaid, next7TotalDue = 0, rangeLabel,
}: Props) {
  const contribution = mtdRevenue - mtdAdSpend - mtdCogsPaid;
  const netAfterAdsBills = mtdRevenue - mtdAdSpend - mtdBillsPaid;
  const profitProxy = mtdRevenue - mtdAdSpend - mtdBillsPaid - mtdCogsPaid;
  const totalOpCost = mtdAdSpend + mtdCogsPaid + mtdBillsPaid;
  const netAfterDue = profitProxy - next7TotalDue;

  const titles: Record<ProfitDetailType, string> = {
    net_after_ads_bills: "Net After Ads & Bills",
    profit_proxy: "Profit Proxy Breakdown",
    contribution: "Contribution Breakdown",
    total_operating_cost: "Total Operating Cost Breakdown",
    net_after_upcoming_due: "Net After Upcoming Due",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[type]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {/* Revenue line — always shown */}
          <div className="flex justify-between">
            <span>{rangeLabel} Revenue</span>
            <span className="font-semibold">{formatCurrency(mtdRevenue)}</span>
          </div>

          {/* Ad Spend line */}
          {type !== "total_operating_cost" && (
            <div className="flex justify-between">
              <span>− {rangeLabel} Ad Spend</span>
              <span className="font-semibold text-destructive">{formatCurrency(mtdAdSpend)}</span>
            </div>
          )}

          {/* COGS line for contribution, profit_proxy, net_after_upcoming_due */}
          {["contribution", "profit_proxy", "net_after_upcoming_due"].includes(type) && (
            <div className="flex justify-between">
              <span>− {rangeLabel} COGS</span>
              <span className="font-semibold text-destructive">{formatCurrency(mtdCogsPaid)}</span>
            </div>
          )}

          {/* Bills line for net_after_ads_bills, profit_proxy, net_after_upcoming_due */}
          {["net_after_ads_bills", "profit_proxy", "net_after_upcoming_due"].includes(type) && (
            <div className="flex justify-between">
              <span>− {rangeLabel} Overhead (Bills)</span>
              <span className="font-semibold text-destructive">{formatCurrency(mtdBillsPaid)}</span>
            </div>
          )}

          {/* Total operating cost breakdown */}
          {type === "total_operating_cost" && (
            <>
              <div className="flex justify-between">
                <span>Ad Spend</span>
                <span className="font-semibold text-destructive">{formatCurrency(mtdAdSpend)}</span>
              </div>
              <div className="flex justify-between">
                <span>COGS</span>
                <span className="font-semibold text-destructive">{formatCurrency(mtdCogsPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span>Overhead (Bills)</span>
                <span className="font-semibold text-destructive">{formatCurrency(mtdBillsPaid)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold text-base">
                <span>Total Operating Cost</span>
                <span>{formatCurrency(totalOpCost)}</span>
              </div>
            </>
          )}

          {/* Contribution result */}
          {type === "contribution" && (
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Contribution</span>
              <span>{formatCurrency(contribution)}</span>
            </div>
          )}

          {/* Net after ads & bills result */}
          {type === "net_after_ads_bills" && (
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Net After Ads & Bills</span>
              <span>{formatCurrency(netAfterAdsBills)}</span>
            </div>
          )}

          {/* Profit proxy result */}
          {type === "profit_proxy" && (
            <div className="flex justify-between border-t pt-2 font-bold text-base">
              <span>Profit Proxy</span>
              <span>{formatCurrency(profitProxy)}</span>
            </div>
          )}

          {/* Net after upcoming due */}
          {type === "net_after_upcoming_due" && (
            <>
              <div className="flex justify-between border-t pt-2 font-bold">
                <span>= Net Profit Proxy</span>
                <span>{formatCurrency(profitProxy)}</span>
              </div>
              <div className="flex justify-between">
                <span>− Next 7 Days Due</span>
                <span className="font-semibold text-destructive">{formatCurrency(next7TotalDue)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-bold text-base">
                <span>Net After Upcoming Due</span>
                <span>{formatCurrency(netAfterDue)}</span>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
