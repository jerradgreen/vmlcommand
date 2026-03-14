import { useDashboardMetrics, useTrendData, DateRange } from "@/hooks/useDashboardMetrics";
import { useCashMetrics } from "@/hooks/useCashMetrics";
import { format } from "date-fns";
import CeoMorningBrief from "@/components/CeoMorningBrief";
import ReportGenerator from "@/components/ReportGenerator";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";

const dateRange: DateRange = { preset: "30d" };

export default function MorningBrief() {
  const { data: metrics, isLoading } = useDashboardMetrics(dateRange);
  const { data: trends } = useTrendData(dateRange);
  const { data: cashMetrics } = useCashMetrics(dateRange);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading metrics…</div>;
  }

  const m = metrics ?? {
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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Operational Brief</h1>
          <p className="text-muted-foreground text-sm">Live snapshot — rolling 30-day window</p>
        </div>
        <ReportGenerator metrics={m} cashMetrics={cashMetrics} dateLabel="Daily Brief" />
      </div>

      <CeoMorningBrief metrics={m} cashMetrics={cashMetrics ?? null} trends={trends ?? null} />
    </div>
  );
}
