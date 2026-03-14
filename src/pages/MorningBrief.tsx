import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { useDashboardMetrics, useTrendData, DateRange, DatePreset } from "@/hooks/useDashboardMetrics";
import { useCashMetrics } from "@/hooks/useCashMetrics";
import { format } from "date-fns";
import CeoMorningBrief from "@/components/CeoMorningBrief";
import ReportGenerator from "@/components/ReportGenerator";
import CeoMorningBrief from "@/components/CeoMorningBrief";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";

const rangeLabels: Record<DatePreset, string> = {
  all: "All Time", today: "Today", yesterday: "Yesterday", "7d": "Last 7 Days",
  "30d": "Last 30 Days", mtd: "Month to Date", ytd: "Year to Date",
  last_year: "Last Year", "12m": "Last 12 Months", custom: "Custom Range",
};

export default function MorningBrief() {
  const [dateRange, setDateRange] = useState<DateRange>({ preset: "ytd" });
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { data: metrics, isLoading } = useDashboardMetrics(dateRange);
  const { data: trends } = useTrendData(dateRange);
  const { data: cashMetrics } = useCashMetrics(dateRange);

  const handlePresetChange = (value: string) => {
    const preset = value as DatePreset;
    if (preset === "custom") {
      setDateRange({ preset: "custom", from: customFrom, to: customTo });
    } else {
      setDateRange({ preset });
    }
  };

  const applyCustomRange = () => {
    setDateRange({ preset: "custom", from: customFrom, to: customTo });
  };

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
          <h1 className="text-2xl font-bold tracking-tight">Morning Brief</h1>
          <p className="text-muted-foreground text-sm">CEO decision dashboard — run-rate estimates</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange.preset} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(presetLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {dateRange.preset === "custom" && (
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {customFrom ? format(customFrom, "MMM d") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground text-sm">–</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {customTo ? format(customTo, "MMM d") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Button size="sm" onClick={applyCustomRange}>Apply</Button>
            </div>
          )}
        </div>
      </div>

      <CeoMorningBrief metrics={m} cashMetrics={cashMetrics ?? null} trends={trends ?? null} />
    </div>
  );
}
