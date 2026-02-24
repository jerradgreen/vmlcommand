import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdSpendDetailDialog, { AdSpendDetailType } from "@/components/AdSpendDetailDialog";
import BillsDetailDialog, { BillsDetailType } from "@/components/BillsDetailDialog";
import CogsDetailDialog, { CogsDetailType } from "@/components/CogsDetailDialog";
import ProfitDetailDialog, { ProfitDetailType } from "@/components/ProfitDetailDialog";
import LeadToSaleDetailDialog from "@/components/LeadToSaleDetailDialog";
import Next7DueDetailDialog from "@/components/Next7DueDetailDialog";
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
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/* ── Metric Card ── */
function MetricCard({ title, value, icon: Icon, subtitle, onClick }: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn("hover:shadow-md transition-shadow", onClick && "cursor-pointer")}
      onClick={onClick}
    >
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

/* ── Emphasized Metric Card (Net Profit Proxy) ── */
function MetricCardLarge({ title, value, icon: Icon, subtitle, onClick, positive }: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle?: string;
  onClick?: () => void;
  positive: boolean;
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
};

function TrendChart({ data, dataKey, label, formatFn }: {
  data: { date: string; [key: string]: any }[];
  dataKey: string;
  label: string;
  formatFn?: (v: number) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label} Trend</CardTitle>
      </CardHeader>
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

/* ── Preset labels ── */
const presetLabels: Record<DatePreset, string> = {
  all: "All Time",
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  mtd: "Month to Date",
  ytd: "Year to Date",
  custom: "Custom Range",
};

/* ══════════════════ DASHBOARD ══════════════════ */
export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>({ preset: "all" });
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [adDetail, setAdDetail] = useState<{ open: boolean; type: AdSpendDetailType }>({ open: false, type: "yesterday_ad_spend" });
  const [billsDetail, setBillsDetail] = useState<{ open: boolean; type: BillsDetailType }>({ open: false, type: "mtd_bills_paid" });
  const [cogsDetail, setCogsDetail] = useState<{ open: boolean; type: CogsDetailType }>({ open: false, type: "mtd_cogs_paid" });
  const [profitDetail, setProfitDetail] = useState<{ open: boolean; type: ProfitDetailType }>({ open: false, type: "profit_proxy" });
  const [leadToSaleOpen, setLeadToSaleOpen] = useState(false);
  const [next7DueOpen, setNext7DueOpen] = useState(false);
  const navigate = useNavigate();

  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics(dateRange);
  const { data: trends, isLoading: trendsLoading } = useTrendData(dateRange);

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

  if (metricsLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading metrics…</div>;
  }

  const m = metrics ?? {
    earliestDate: null as string | null,
    totalRevenue: 0, totalLeads: 0, totalSales: 0,
    closeRate: 0, avgOrderValue: 0, avgDaysLeadToSale: null as number | null,
    newLeadRevenue: 0, repeatDirectRevenue: 0, unmatchedCount: 0,
    yesterdayAdSpend: 0, mtdAdSpend: 0, mtdRevenue: 0, mtdRoas: 0, netAfterAds: 0,
    mtdBillsPaid: 0, mtdCogsPaid: 0, next7BillsDue: 0, next7CogsDue: 0,
    mtdNetAfterAdsAndBills: 0, mtdProfitProxy: 0,
  };

  const subtitle = dateRange.preset === "all" && m.earliestDate
    ? `All Time (since ${format(new Date(m.earliestDate), "MMM d, yyyy")})`
    : `${presetLabels[dateRange.preset]} performance overview`;

  const rangeLabel = presetLabels[dateRange.preset] ?? "MTD";

  // Derived metrics
  const contribution = m.mtdRevenue - m.mtdAdSpend - m.mtdCogsPaid;
  const contributionMarginPct = m.mtdRevenue > 0 ? contribution / m.mtdRevenue : 0;
  const adSpendPctOfRevenue = m.mtdRevenue > 0 ? m.mtdAdSpend / m.mtdRevenue : 0;
  const cogsPctOfRevenue = m.mtdRevenue > 0 ? m.mtdCogsPaid / m.mtdRevenue : 0;
  const overheadPctOfRevenue = m.mtdRevenue > 0 ? m.mtdBillsPaid / m.mtdRevenue : 0;
  const totalOperatingCost = m.mtdAdSpend + m.mtdCogsPaid + m.mtdBillsPaid;
  const netProfitMarginPct = m.mtdRevenue > 0 ? m.mtdProfitProxy / m.mtdRevenue : 0;
  const next7TotalDue = m.next7BillsDue + m.next7CogsDue;
  const netAfterUpcomingDue = m.mtdProfitProxy - next7TotalDue;

  // Date bounds for detail dialogs
  const rangeDateFrom = (() => {
    if (dateRange.preset === "custom" && dateRange.from) return format(dateRange.from, "yyyy-MM-dd");
    const now = new Date();
    switch (dateRange.preset) {
      case "today": return format(now, "yyyy-MM-dd");
      case "yesterday": return format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1), "yyyy-MM-dd");
      case "7d": return format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6), "yyyy-MM-dd");
      case "30d": return format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), "yyyy-MM-dd");
      case "mtd": return format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
      case "ytd": return format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd");
      default: return format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    }
  })();
  const rangeDateTo = (() => {
    if (dateRange.preset === "custom" && dateRange.to) return format(dateRange.to, "yyyy-MM-dd");
    return format(new Date(), "yyyy-MM-dd");
  })();

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
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
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
        <MetricCard title={`${rangeLabel} Revenue`} value={formatCurrency(m.mtdRevenue)} icon={DollarSign} subtitle={rangeLabel} onClick={() => navigate("/sales")} />
        <MetricCard title={`${rangeLabel} Sales`} value={formatNumber(m.totalSales)} icon={ShoppingCart} onClick={() => navigate("/sales")} />
        <MetricCard title="Avg Order Value" value={formatCurrency(m.avgOrderValue)} icon={BarChart3} subtitle="Revenue ÷ Sales" onClick={() => navigate("/sales")} />
        <MetricCard title="Avg Days Lead → Sale" value={m.avgDaysLeadToSale != null ? `${m.avgDaysLeadToSale.toFixed(1)}d` : "—"} icon={Clock} subtitle="new_lead sales only" onClick={() => setLeadToSaleOpen(true)} />
        <MetricCard title="Confirmed Close Rate" value={formatPercent(m.closeRate)} icon={TrendingUp} subtitle="New lead sales / Leads" onClick={() => navigate("/sales")} />
      </div>

      {/* ═══ SECTION 2 — Ad Performance (Scale Engine) ═══ */}
      <SectionHeader title="Ad Performance (Scale Engine)" subtitle="Can I scale ads safely?" />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard title={`${rangeLabel} Ad Spend`} value={formatCurrency(m.mtdAdSpend)} icon={DollarSign} subtitle={rangeLabel} onClick={() => setAdDetail({ open: true, type: "mtd_ad_spend" })} />
        <MetricCard title={`${rangeLabel} ROAS`} value={m.mtdRoas > 0 ? `${m.mtdRoas.toFixed(2)}x` : "—"} icon={TrendingUp} subtitle="Revenue ÷ Ad Spend" onClick={() => setAdDetail({ open: true, type: "mtd_roas" })} />
        <MetricCard title="Contribution ($)" value={formatCurrency(contribution)} icon={Calculator} subtitle="Revenue − Ads − COGS" onClick={() => setProfitDetail({ open: true, type: "contribution" })} />
        <MetricCard title="Contribution Margin %" value={formatPercent(contributionMarginPct)} icon={Percent} subtitle="Contribution ÷ Revenue" onClick={() => setProfitDetail({ open: true, type: "contribution" })} />
        <MetricCard title="Ad Spend % of Revenue" value={formatPercent(adSpendPctOfRevenue)} icon={Percent} subtitle="Ad Spend ÷ Revenue" onClick={() => setAdDetail({ open: true, type: "mtd_ad_spend" })} />
      </div>

      {/* ═══ SECTION 3 — Cost Structure (Leak Detection) ═══ */}
      <SectionHeader title="Cost Structure (Leak Detection)" subtitle="Where is money drifting?" />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard title={`${rangeLabel} COGS`} value={formatCurrency(m.mtdCogsPaid)} icon={Factory} subtitle={rangeLabel} onClick={() => setCogsDetail({ open: true, type: "mtd_cogs_paid" })} />
        <MetricCard title="COGS % of Revenue" value={formatPercent(cogsPctOfRevenue)} icon={Percent} subtitle="COGS ÷ Revenue" onClick={() => setCogsDetail({ open: true, type: "mtd_cogs_paid" })} />
        <MetricCard title={`${rangeLabel} Overhead`} value={formatCurrency(m.mtdBillsPaid)} icon={Building2} subtitle="Bills paid" onClick={() => setBillsDetail({ open: true, type: "mtd_bills_paid" })} />
        <MetricCard title="Overhead % of Revenue" value={formatPercent(overheadPctOfRevenue)} icon={Percent} subtitle="Overhead ÷ Revenue" onClick={() => setBillsDetail({ open: true, type: "mtd_bills_paid" })} />
        <MetricCard title="Total Operating Cost" value={formatCurrency(totalOperatingCost)} icon={Calculator} subtitle="Ads + COGS + Overhead" onClick={() => setProfitDetail({ open: true, type: "total_operating_cost" })} />
      </div>

      {/* ═══ SECTION 4 — Cash & Survival ═══ */}
      <SectionHeader title="Cash & Survival" subtitle="Can I pay myself?" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCardLarge
          title="Net Profit Proxy (All-In)"
          value={formatCurrency(m.mtdProfitProxy)}
          icon={Calculator}
          subtitle="Revenue − Ads − COGS − Overhead"
          positive={m.mtdProfitProxy >= 0}
          onClick={() => setProfitDetail({ open: true, type: "profit_proxy" })}
        />
        <MetricCard title="Net Profit Margin %" value={formatPercent(netProfitMarginPct)} icon={Percent} subtitle="Net Profit ÷ Revenue" onClick={() => setProfitDetail({ open: true, type: "profit_proxy" })} />
        <MetricCard title="Next 7 Days Due" value={formatCurrency(next7TotalDue)} icon={CalendarIcon} subtitle="Bills + COGS due" onClick={() => setNext7DueOpen(true)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard title="Net After Upcoming Due" value={formatCurrency(netAfterUpcomingDue)} icon={Calculator} subtitle="Net Profit − Next 7 Days Due" onClick={() => setProfitDetail({ open: true, type: "net_after_upcoming_due" })} />
      </div>

      {/* ═══ Additional info cards ═══ */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Total Leads" value={formatNumber(m.totalLeads)} icon={Users} onClick={() => navigate("/leads")} />
        <MetricCard title="New Lead Revenue" value={formatCurrency(m.newLeadRevenue)} icon={DollarSign} subtitle="sale_type = new_lead" onClick={() => navigate("/sales")} />
        <MetricCard title="Repeat/Direct Revenue" value={formatCurrency(m.repeatDirectRevenue)} icon={RefreshCw} subtitle="sale_type = repeat_direct" onClick={() => navigate("/sales")} />
        <MetricCard title="Yesterday Ad Spend" value={formatCurrency(m.yesterdayAdSpend)} icon={DollarSign} subtitle="All platforms" onClick={() => setAdDetail({ open: true, type: "yesterday_ad_spend" })} />
        <MetricCard title="Unmatched Sales" value={formatNumber(m.unmatchedCount)} icon={AlertCircle} subtitle="Click to review" onClick={() => navigate("/attribution")} />
      </div>

      {/* ═══ Trends ═══ */}
      {!trendsLoading && trends && (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
          <TrendChart data={trends} dataKey="revenue" label="Revenue" formatFn={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
          <TrendChart data={trends} dataKey="leads" label="Leads" />
          <TrendChart data={trends} dataKey="sales" label="Sales" />
        </div>
      )}

      {/* ═══ Detail Dialogs ═══ */}
      <AdSpendDetailDialog open={adDetail.open} onOpenChange={(open) => setAdDetail((prev) => ({ ...prev, open }))} type={adDetail.type} dateFrom={rangeDateFrom} dateTo={rangeDateTo} rangeLabel={rangeLabel} />
      <BillsDetailDialog open={billsDetail.open} onOpenChange={(open) => setBillsDetail((prev) => ({ ...prev, open }))} type={billsDetail.type} dateFrom={rangeDateFrom} dateTo={rangeDateTo} rangeLabel={rangeLabel} />
      <CogsDetailDialog open={cogsDetail.open} onOpenChange={(open) => setCogsDetail((prev) => ({ ...prev, open }))} type={cogsDetail.type} dateFrom={rangeDateFrom} dateTo={rangeDateTo} rangeLabel={rangeLabel} />
      <ProfitDetailDialog
        open={profitDetail.open}
        onOpenChange={(open) => setProfitDetail((prev) => ({ ...prev, open }))}
        type={profitDetail.type}
        mtdRevenue={m.mtdRevenue}
        mtdAdSpend={m.mtdAdSpend}
        mtdBillsPaid={m.mtdBillsPaid}
        mtdCogsPaid={m.mtdCogsPaid}
        next7TotalDue={next7TotalDue}
        rangeLabel={rangeLabel}
      />
      <LeadToSaleDetailDialog open={leadToSaleOpen} onOpenChange={setLeadToSaleOpen} />
      <Next7DueDetailDialog open={next7DueOpen} onOpenChange={setNext7DueOpen} />
    </div>
  );
}
