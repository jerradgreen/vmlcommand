import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { LineChart, Line, XAxis, YAxis } from "recharts";
import { useDashboardMetrics, useTrendData, DateRange, DatePreset } from "@/hooks/useDashboardMetrics";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import { DollarSign, Users, ShoppingCart, TrendingUp, BarChart3, RefreshCw, AlertCircle, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
            <XAxis
              dataKey="date"
              tickFormatter={(d) => format(new Date(d), "MMM d")}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatFn} width={50} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={`var(--color-${dataKey})`}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const presetLabels: Record<DatePreset, string> = {
  all: "All Time",
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  mtd: "Month to Date",
  custom: "Custom Range",
};

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>({ preset: "all" });
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
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
    closeRate: 0, avgOrderValue: 0,
    newLeadRevenue: 0, repeatDirectRevenue: 0, unmatchedCount: 0,
    todayAdSpend: 0, mtdAdSpend: 0, mtdRevenue: 0, mtdRoas: 0, netAfterAds: 0,
  };

  const subtitle = dateRange.preset === "all" && m.earliestDate
    ? `All Time (since ${format(new Date(m.earliestDate), "MMM d, yyyy")})`
    : `${presetLabels[dateRange.preset]} performance overview`;

  return (
    <div className="space-y-6">
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

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
        <MetricCard title="Revenue" value={formatCurrency(m.totalRevenue)} icon={DollarSign} onClick={() => navigate("/sales")} />
        <MetricCard title="Leads" value={formatNumber(m.totalLeads)} icon={Users} onClick={() => navigate("/leads")} />
        <MetricCard title="Sales" value={formatNumber(m.totalSales)} icon={ShoppingCart} onClick={() => navigate("/sales")} />
        <MetricCard title="Close Rate" value={formatPercent(m.closeRate)} icon={TrendingUp} subtitle="Leads ÷ Sales (excl. repeat/direct)" onClick={() => navigate("/sales")} />
        <MetricCard title="Avg Order Value" value={formatCurrency(m.avgOrderValue)} icon={BarChart3} onClick={() => navigate("/sales")} />
        <MetricCard title="New Lead Revenue" value={formatCurrency(m.newLeadRevenue)} icon={DollarSign} subtitle="sale_type = new_lead" onClick={() => navigate("/sales")} />
        <MetricCard title="Repeat/Direct Revenue" value={formatCurrency(m.repeatDirectRevenue)} icon={RefreshCw} subtitle="sale_type = repeat_direct" onClick={() => navigate("/sales")} />
        <MetricCard
          title="Unmatched Sales"
          value={formatNumber(m.unmatchedCount)}
          icon={AlertCircle}
          subtitle="Click to review"
          onClick={() => navigate("/attribution")}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Ad Spend (MTD)</h2>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <MetricCard title="Today Ad Spend" value={formatCurrency(m.todayAdSpend)} icon={DollarSign} subtitle="All platforms" />
          <MetricCard title="MTD Ad Spend" value={formatCurrency(m.mtdAdSpend)} icon={DollarSign} subtitle="Month to date" />
          <MetricCard title="MTD Revenue" value={formatCurrency(m.mtdRevenue)} icon={DollarSign} subtitle="Month to date" />
          <MetricCard title="MTD ROAS" value={m.mtdRoas > 0 ? `${m.mtdRoas.toFixed(2)}x` : "—"} icon={TrendingUp} subtitle="Revenue ÷ Ad Spend" />
          <MetricCard title="Net After Ads" value={formatCurrency(m.netAfterAds)} icon={BarChart3} subtitle="Revenue − Ad Spend" />
        </div>
      </div>

      {!trendsLoading && trends && (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
          <TrendChart data={trends} dataKey="revenue" label="Revenue" formatFn={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
          <TrendChart data={trends} dataKey="leads" label="Leads" />
          <TrendChart data={trends} dataKey="sales" label="Sales" />
        </div>
      )}
    </div>
  );
}
