import { useState } from "react";
import MetricDrilldownDialog from "@/components/MetricDrilldownDialog";
import { MetricSpecId } from "@/lib/metricSpecs";
import LeadToSaleDetailDialog from "@/components/LeadToSaleDetailDialog";
import Next7DueDetailDialog from "@/components/Next7DueDetailDialog";
import ShopifyCapitalManager from "@/components/ShopifyCapitalManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { LineChart, Line, XAxis, YAxis } from "recharts";
import { useDashboardMetrics, useTrendData, DateRange, DatePreset } from "@/hooks/useDashboardMetrics";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import {
  DollarSign, Users, ShoppingCart, TrendingUp, BarChart3, RefreshCw,
  AlertCircle, CalendarIcon, Building2, Factory, Calculator, Clock, Percent,
  Landmark, CreditCard, ArrowUpRight, ArrowDownRight, Wallet,
} from "lucide-react";
import { useCashMetrics } from "@/hooks/useCashMetrics";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/* ── Metric Card ── */
function MetricCard({ title, value, icon: Icon, subtitle, onClick }: {
  title: string; value: string; icon: React.ElementType; subtitle?: string; onClick?: () => void;
}) {
  return (
    <Card className={cn("hover:shadow-md transition-shadow", onClick && "cursor-pointer")} onClick={onClick}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

/* ── Emphasized Metric Card ── */
function MetricCardLarge({ title, value, icon: Icon, subtitle, onClick, positive }: {
  title: string; value: string; icon: React.ElementType; subtitle?: string; onClick?: () => void; positive: boolean;
}) {
  return (
    <Card
      className={cn(
        "hover:shadow-md transition-shadow md:col-span-2 border-2",
        positive ? "border-emerald-500/50 bg-emerald-500/5 dark:border-emerald-400/40 dark:bg-emerald-400/5" : "border-destructive/50 bg-destructive/5",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={cn("text-3xl font-bold", positive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

/* ── Section Header ── */
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/* ── Charts ── */
const chartConfig = {
  revenue: { label: "Revenue", color: "hsl(220, 70%, 50%)" },
  leads: { label: "Leads", color: "hsl(142, 72%, 40%)" },
  sales: { label: "Sales", color: "hsl(38, 92%, 50%)" },
  adSpend: { label: "Ad Spend", color: "hsl(0, 72%, 50%)" },
};

function TrendChart({ data, dataKey, label, formatFn }: {
  data: { date: string; [key: string]: any }[]; dataKey: string; label: string; formatFn?: (v: number) => string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{label} Trend</CardTitle></CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <LineChart data={data}>
            <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), "MMM d")} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatFn} width={50} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey={dataKey} stroke={`var(--color-${dataKey})`} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const presetLabels: Record<DatePreset, string> = {
  all: "All Time", today: "Today", yesterday: "Yesterday", "7d": "Last 7 Days",
  "30d": "Last 30 Days", mtd: "Month to Date", ytd: "Year to Date",
  last_year: "Last Year", "12m": "Last 12 Months", custom: "Custom Range",
};

/* ══════════════════ DASHBOARD ══════════════════ */
export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>({ preset: "ytd" });
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [drilldown, setDrilldown] = useState<{ open: boolean; specId: MetricSpecId | null }>({ open: false, specId: null });
  const [leadToSaleOpen, setLeadToSaleOpen] = useState(false);
  const [next7DueOpen, setNext7DueOpen] = useState(false);
  

  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics(dateRange);
  const { data: trends, isLoading: trendsLoading } = useTrendData(dateRange);
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

  const openDrilldown = (specId: MetricSpecId) => setDrilldown({ open: true, specId });

  if (metricsLoading) {
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
    overheadRecurringTotal: 0,
    overheadOneTimeTotal: 0,
    shopifyCapitalPaid: 0, shopifyCapitalRemaining: 0, shopifyCapitalPaidInRange: 0, loanPaybackPerSale: 0,
    loanQualifyingSalesCountInRange: 0, shopifySalesCountInRange: 0,
    accruedMfgRemaining: 0, estimatedMfgTotal: 0, allocatedMfgTotal: 0,
    mfgUnpaidCount: 0, mfgPartialCount: 0, mfgPaidCount: 0,
    adjustedCogsTotal: 0, adjustedTotalOperatingCost: 0,
    adjustedNetProfit: 0, adjustedCogsPct: 0, adjustedProfitMarginPct: 0,
    rangeFrom: "2025-01-01", rangeTo: format(new Date(), "yyyy-MM-dd"),
  };

  const subtitle = dateRange.preset === "all" && m.earliestDate
    ? `All Time (since Jan 1, 2025)`
    : `${presetLabels[dateRange.preset]} performance overview`;

  const rangeLabel = presetLabels[dateRange.preset] ?? "MTD";
  const adSpendPctOfRevenue = m.depositRevenue > 0 ? m.adsSpendTotal / m.depositRevenue : 0;
  const overheadPctOfRevenue = m.depositRevenue > 0 ? m.overheadTotal / m.depositRevenue : 0;
      const next7TotalDue = m.next7BillsDue + m.next7CogsDue;
    const netAfterUpcomingDue = m.adjustedNetProfit - next7TotalDue;

  return (
    <div className="space-y-6">
      {/* Header + date picker */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
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

      {/* ═══ SECTION 1 — Revenue Engine ═══ */}
      <SectionHeader title="Revenue Engine" subtitle="Is the machine producing?" />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard title={`${rangeLabel} Revenue`} value={formatCurrency(m.depositRevenue)} icon={DollarSign} subtitle={`${formatPercent(m.salesCoveragePct)} matched to sales records`} onClick={() => openDrilldown("mtd_revenue")} />
        <MetricCard title={`${rangeLabel} Sales`} value={formatNumber(m.totalSales)} icon={ShoppingCart} onClick={() => openDrilldown("mtd_sales")} />
        <MetricCard title="Avg Order Value" value={formatCurrency(m.avgOrderValue)} icon={BarChart3} subtitle="Revenue ÷ Sales" onClick={() => openDrilldown("revenue_per_sale")} />
        <MetricCard title="Avg Days Lead → Sale" value={m.avgDaysLeadToSale != null ? `${m.avgDaysLeadToSale.toFixed(1)}d` : "—"} icon={Clock} subtitle="new_lead sales only" onClick={() => setLeadToSaleOpen(true)} />
        <MetricCard title="Confirmed Close Rate" value={formatPercent(m.closeRate)} icon={TrendingUp} subtitle="New lead sales / Leads" onClick={() => openDrilldown("close_rate")} />
      </div>

      {/* ═══ SECTION 2 — Ad Performance ═══ */}
      <SectionHeader title="Ad Performance" subtitle="Can I scale safely?" />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title={`${rangeLabel} Ad Spend`} value={formatCurrency(m.adsSpendTotal)} icon={DollarSign} subtitle={rangeLabel} onClick={() => openDrilldown("mtd_ad_spend")} />
        <MetricCard title={`${rangeLabel} ROAS`} value={m.rangeRoas > 0 ? `${m.rangeRoas.toFixed(2)}x` : "—"} icon={TrendingUp} subtitle="Revenue ÷ Ad Spend" onClick={() => openDrilldown("mtd_roas")} />
        <MetricCard title="Ad Spend % of Revenue" value={formatPercent(adSpendPctOfRevenue)} icon={Percent} subtitle="Ad Spend ÷ Revenue" onClick={() => openDrilldown("ad_spend_pct")} />
      </div>

      {/* ═══ SECTION 3 — Cost Structure ═══ */}
      <SectionHeader title="Cost Structure (Leak Detection)" subtitle="Where is money drifting?" />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard title={`${rangeLabel} COGS`} value={formatCurrency(m.adjustedCogsTotal)} icon={Factory} subtitle={`Cash ${formatCurrency(m.cogsTotal)} + Accrued ${formatCurrency(m.accruedMfgRemaining)}`} onClick={() => openDrilldown("mtd_cogs")} />
        <MetricCard title="COGS % of Revenue" value={formatPercent(m.adjustedCogsPct)} icon={Percent} subtitle="Adjusted COGS ÷ Revenue" onClick={() => openDrilldown("cogs_pct")} />
        <MetricCard title={`${rangeLabel} Overhead`} value={formatCurrency(m.overheadTotal)} icon={Building2} subtitle={m.overheadOneTimeTotal > 0 ? `Recurring: ${formatCurrency(m.overheadRecurringTotal)} / One-time: ${formatCurrency(m.overheadOneTimeTotal)}` : "Overhead"} onClick={() => openDrilldown("mtd_overhead")} />
        <MetricCard title="Overhead % of Revenue" value={formatPercent(overheadPctOfRevenue)} icon={Percent} subtitle="Overhead ÷ Revenue" onClick={() => openDrilldown("overhead_pct")} />
        <MetricCard title="Total Operating Cost" value={formatCurrency(m.adjustedTotalOperatingCost)} icon={Calculator} subtitle="Ads + COGS + Overhead + Loan" onClick={() => openDrilldown("total_operating_cost")} />
      </div>

      {/* ═══ Shopify Capital ═══ */}
      <SectionHeader title="Shopify Capital" subtitle="Loan repayment tracking (auto-stops at $0 remaining)" />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Shopify Capital Remaining" value={formatCurrency(m.shopifyCapitalRemaining)} icon={Landmark} subtitle="Balance left to repay" onClick={() => openDrilldown("shopify_capital_remaining")} />
        <MetricCard title="Shopify Capital Paid To Date" value={formatCurrency(m.shopifyCapitalPaid)} icon={DollarSign} subtitle="Total paid all-time" onClick={() => openDrilldown("shopify_capital_paid")} />
        <MetricCard title="Shopify Capital Paid (This Period)" value={formatCurrency(m.shopifyCapitalPaidInRange)} icon={CalendarIcon} subtitle={`Paid in ${rangeLabel}`} onClick={() => openDrilldown("shopify_capital_in_range")} />
      </div>
      <ShopifyCapitalManager />

      {/* ═══ SECTION 4 — Unit Economics ═══ */}
      <SectionHeader title="Unit Economics" subtitle="What does one job actually make?" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDrilldown("marketing_cpo")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Marketing Cost per Sale</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(m.fullyLoadedCPO)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total marketing ÷ all sales</p>
            <p className="text-xs text-muted-foreground">{formatPercent(m.marketingPctOfRevenue)} of revenue</p>
          </CardContent>
        </Card>
        <MetricCard title="Revenue Per Sale" value={formatCurrency(m.revenuePerSale)} icon={DollarSign} subtitle="Revenue ÷ all sales" onClick={() => openDrilldown("revenue_per_sale")} />
        <MetricCard title="Gross Profit per Sale" value={formatCurrency(m.contributionMarginPerSale)} icon={TrendingUp} subtitle="Revenue per sale − COGS per sale" onClick={() => openDrilldown("gp_per_sale")} />
        <MetricCard title="Loan Cost per Affected Sale" value={formatCurrency(m.loanPaybackPerSale)} icon={Landmark} subtitle={`${m.loanQualifyingSalesCountInRange} qualifying sales`} onClick={() => openDrilldown("loan_per_sale")} />
        <MetricCardLarge
          title="Net Profit per Sale"
          value={formatCurrency(m.profitPerSale)}
          icon={Wallet}
          subtitle="Adjusted Net Profit ÷ Sales Count"
          positive={m.profitPerSale >= 0}
          onClick={() => openDrilldown("np_per_sale")}
        />
      </div>

      {/* ═══ SECTION 5 — Cash & Survival ═══ */}
      <SectionHeader title="Cash & Survival" subtitle="What do I actually keep?" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCardLarge
          title="Net Profit"
          value={formatCurrency(m.adjustedNetProfit)}
          icon={Calculator}
          subtitle="Revenue − Ads − Adj COGS − Overhead − Loan"
          positive={m.adjustedNetProfit >= 0}
          onClick={() => openDrilldown("net_profit")}
        />
        <MetricCard title="Net Profit Margin %" value={formatPercent(m.adjustedProfitMarginPct)} icon={Percent} subtitle="Net Profit ÷ Revenue" onClick={() => openDrilldown("profit_margin")} />
        <MetricCard title="Next 7 Days Due" value={formatCurrency(next7TotalDue)} icon={CalendarIcon} subtitle="Bills + COGS due" onClick={() => setNext7DueOpen(true)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard title="Net After Upcoming Due" value={formatCurrency(netAfterUpcomingDue)} icon={Calculator} subtitle="Net Profit − Next 7 Days Due" onClick={() => openDrilldown("net_after_upcoming_due")} />
        <MetricCard title="Owner Pay (Personal Spend)" value={formatCurrency(m.personalDrawTotal)} icon={Wallet} subtitle="Personal transactions in this range" />
      </div>

      {/* ═══ Cash & Bank Balances ═══ */}
      {cashMetrics && cashMetrics.hasData && (
        <>
          <SectionHeader title="Bank & Card Balances" subtitle={cashMetrics.lastUpdated ? `Last updated ${new Date(cashMetrics.lastUpdated).toLocaleString()}` : "Current account positions (ignores date picker)"} />
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard title="Cash in Bank" value={formatCurrency(cashMetrics.cashInBank)} icon={Landmark} subtitle="Current balance" />
            <MetricCard title="Credit Cards Owed" value={formatCurrency(cashMetrics.cardsOwedDisplay)} icon={CreditCard} subtitle="Total owed (current)" />
            <MetricCardLarge title="Net Cash Position" value={formatCurrency(cashMetrics.netCashPosition)} icon={Wallet} subtitle="Cash − Credit Card Debt" positive={cashMetrics.netCashPosition >= 0} />
          </div>
          <SectionHeader title="Transaction Flows" subtitle={`${rangeLabel} inflows and outflows`} />
          <div className="grid gap-4 md:grid-cols-2">
            <MetricCard title={`${rangeLabel} Inflow`} value={formatCurrency(cashMetrics.totalInflow)} icon={ArrowUpRight} subtitle="Positive transactions" />
            <MetricCard title={`${rangeLabel} Outflow`} value={formatCurrency(cashMetrics.totalOutflow)} icon={ArrowDownRight} subtitle="Negative transactions (abs)" />
          </div>
        </>
      )}

      {/* ═══ Additional info cards ═══ */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Total Leads" value={formatNumber(m.totalLeads)} icon={Users} onClick={() => openDrilldown("total_leads")} />
        <MetricCard title="New Lead Revenue" value={formatCurrency(m.newLeadRevenue)} icon={DollarSign} subtitle="sale_type = new_lead" onClick={() => openDrilldown("new_lead_revenue")} />
        <MetricCard title="Repeat/Direct Revenue" value={formatCurrency(m.repeatDirectRevenue)} icon={RefreshCw} subtitle="sale_type = repeat_direct" onClick={() => openDrilldown("repeat_direct_revenue")} />
        <MetricCard title="Yesterday Ad Spend" value={formatCurrency(m.yesterdayAdSpend)} icon={DollarSign} subtitle="All platforms" onClick={() => openDrilldown("yesterday_ad_spend")} />
        <MetricCard title="Unmatched Sales" value={formatNumber(m.unmatchedCount)} icon={AlertCircle} subtitle="Click to review" onClick={() => openDrilldown("unmatched_sales")} />
      </div>

      {/* ═══ Trends ═══ */}
      {!trendsLoading && trends && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <TrendChart data={trends} dataKey="revenue" label="Revenue" formatFn={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
          <TrendChart data={trends} dataKey="adSpend" label="Ad Spend" formatFn={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
          <TrendChart data={trends} dataKey="leads" label="Leads" />
          <TrendChart data={trends} dataKey="sales" label="Sales" />
        </div>
      )}

      {/* ═══ Unified Drilldown Dialog ═══ */}
      <MetricDrilldownDialog
        open={drilldown.open}
        onOpenChange={(open) => setDrilldown((prev) => ({ ...prev, open }))}
        specId={drilldown.specId}
        metrics={m}
        rangeFrom={m.rangeFrom}
        rangeTo={m.rangeTo}
        rangeLabel={rangeLabel}
      />
      <LeadToSaleDetailDialog open={leadToSaleOpen} onOpenChange={setLeadToSaleOpen} rangeFrom={m.rangeFrom} rangeTo={m.rangeTo} rangeLabel={rangeLabel} />
      <Next7DueDetailDialog open={next7DueOpen} onOpenChange={setNext7DueOpen} />
    </div>
  );
}
