import { useDashboardMetrics, useTrendData, DateRange } from "@/hooks/useDashboardMetrics";
import { useCashMetrics } from "@/hooks/useCashMetrics";
import { useSignStyleMetrics } from "@/hooks/useSignStyleMetrics";
import { format } from "date-fns";
import CeoMorningBrief from "@/components/CeoMorningBrief";
import ReportGenerator from "@/components/ReportGenerator";

const range30d: DateRange = { preset: "30d" };
const range12m: DateRange = { preset: "12m" };
const rangeMtd: DateRange = { preset: "mtd" };

export default function MorningBrief() {
  const { data: metrics30d, isLoading: loading30d } = useDashboardMetrics(range30d);
  const { data: metrics12m, isLoading: loading12m } = useDashboardMetrics(range12m);
  const { data: metricsMtd, isLoading: loadingMtd } = useDashboardMetrics(rangeMtd);
  const { data: cashMetrics } = useCashMetrics(range30d);
  const { data: trends } = useTrendData(range30d);
  const { data: styleMetrics } = useSignStyleMetrics(range30d);

  const isLoading = loading30d || loading12m || loadingMtd;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading metrics…</div>;
  }

  const defaultMetrics = {
    earliestDate: null as string | null,
    totalRevenue: 0, totalLeads: 0, totalSales: 0,
    closeRate: 0, avgOrderValue: 0, avgDaysLeadToSale: null as number | null,
    newLeadRevenue: 0, repeatDirectRevenue: 0,
    newLeadSalesCount: 0, repeatDirectSalesCount: 0, unmatchedCount: 0,
    yesterdayAdSpend: 0,
    cogsTotal: 0, adsSpendTotal: 0, overheadTotal: 0,
    totalOperatingCost: 0, depositRevenue: 0, rangeRevenue: 0, rangeRoas: 0,
    netProfitProxy: 0, profitMarginPct: 0, salesCoveragePct: 0,
    next7BillsDue: 0, next7CogsDue: 0,
    fullyLoadedMarketingCost: 0, fullyLoadedCPO: 0,
    revenuePerSale: 0, contributionMarginPerSale: 0,
    profitPerSale: 0, marketingPctOfRevenue: 0,
    personalDrawTotal: 0,
    overheadRecurringTotal: 0, overheadOneTimeTotal: 0, overheadMonthlyRunRate: 0,
    shopifyCapitalPaid: 0, shopifyCapitalRemaining: 0, shopifyCapitalPaidInRange: 0, loanPaybackPerSale: 0,
    loanQualifyingSalesCountInRange: 0, shopifySalesCountInRange: 0,
    accruedMfgRemaining: 0, estimatedMfgTotal: 0, allocatedMfgTotal: 0,
    mfgUnpaidCount: 0, mfgPartialCount: 0, mfgPaidCount: 0,
    adjustedCogsTotal: 0, adjustedTotalOperatingCost: 0,
    adjustedNetProfit: 0, adjustedCogsPct: 0, adjustedProfitMarginPct: 0,
    cogsMonthlyRunRate: 0, adsMonthlyRunRate: 0, loanMonthlyRunRate: 0, accruedMfgMonthlyRunRate: 0, totalOpCostMonthlyRunRate: 0,
    revenueMonthlyRunRate: 0, netProfitMonthlyRunRate: 0, netProfitPerSaleRunRate: 0, profitMarginPctRunRate: 0,
    rangeFrom: "2025-01-01", rangeTo: format(new Date(), "yyyy-MM-dd"),
  };

  const m30d = metrics30d ?? defaultMetrics;
  const m12m = metrics12m ?? defaultMetrics;
  const mMtd = metricsMtd ?? defaultMetrics;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Operational Brief</h1>
          <p className="text-muted-foreground text-sm">Executive summary — what matters today</p>
        </div>
        {(() => {
          const salesRevenue = m30d.rangeRevenue ?? 0;
          const briefCogs = (m30d.allocatedMfgTotal ?? 0) + (m30d.accruedMfgRemaining ?? 0);
          const grossProfit = salesRevenue - briefCogs;
          const grossMargin = salesRevenue > 0 ? grossProfit / salesRevenue : 0;
          const cogsPct = salesRevenue > 0 ? briefCogs / salesRevenue : 0;
          const shopifyCapPaid = m30d.shopifyCapitalPaidInRange ?? 0;
          const netProfit = grossProfit - (m30d.adsSpendTotal ?? 0) - (m30d.overheadTotal ?? 0) - shopifyCapPaid;
          const netMargin = salesRevenue > 0 ? netProfit / salesRevenue : 0;
          const newLeadCloseRate = (m30d.totalLeads ?? 0) > 0
            ? (m30d.newLeadSalesCount ?? 0) / m30d.totalLeads
            : 0;
          const costPerSale = (m30d.newLeadSalesCount ?? 0) > 0
            ? (m30d.adsSpendTotal ?? 0) / m30d.newLeadSalesCount
            : null;
          const costPerLead = (m30d.totalLeads ?? 0) > 0
            ? (m30d.adsSpendTotal ?? 0) / m30d.totalLeads
            : null;
          const revenuePerLead = (m30d.totalLeads ?? 0) > 0
            ? ((m30d.newLeadSalesCount ?? 0) * (m30d.avgOrderValue ?? 0)) / m30d.totalLeads
            : null;
          const reportMetrics = {
            ...m30d,
            salesRevenue,
            briefCogs,
            grossProfit,
            grossMargin,
            cogsPct,
            netProfit,
            netMargin,
            closeRate: newLeadCloseRate,
            shopifyCapitalPaidInRange: shopifyCapPaid,
            costPerSale,
            costPerLead,
            revenuePerLead,
          };
          return <ReportGenerator metrics={reportMetrics} cashMetrics={cashMetrics} dateLabel="Daily Brief" />;
        })()}
      </div>

      <CeoMorningBrief
        metrics30d={m30d}
        metrics12m={m12m}
        metricsMtd={mMtd}
        cashMetrics={cashMetrics ?? null}
        trends={trends ?? null}
      />
    </div>
  );
}
