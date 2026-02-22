import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { useDashboardMetrics, useTrendData } from "@/hooks/useDashboardMetrics";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import { DollarSign, Users, ShoppingCart, TrendingUp, Target, BarChart3, RefreshCw, AlertCircle } from "lucide-react";
import { format } from "date-fns";

function MetricCard({ title, value, icon: Icon, subtitle, link }: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle?: string;
  link?: string;
}) {
  const content = (
    <Card className="hover:shadow-md transition-shadow">
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
  return link ? <Link to={link}>{content}</Link> : content;
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
        <CardTitle className="text-base">{label} — Last 30 Days</CardTitle>
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

export default function Dashboard() {
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: trends, isLoading: trendsLoading } = useTrendData();

  if (metricsLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading metrics…</div>;
  }

  const m = metrics ?? {
    totalRevenue: 0, totalLeads: 0, totalSales: 0,
    strictCloseRate: 0, confirmedCloseRate: 0, avgOrderValue: 0,
    newLeadRevenue: 0, repeatDirectRevenue: 0, unmatchedCount: 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Month-to-date performance overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
        <MetricCard title="Revenue MTD" value={formatCurrency(m.totalRevenue)} icon={DollarSign} />
        <MetricCard title="Leads MTD" value={formatNumber(m.totalLeads)} icon={Users} />
        <MetricCard title="Sales MTD" value={formatNumber(m.totalSales)} icon={ShoppingCart} />
        <MetricCard title="Strict Close Rate" value={formatPercent(m.strictCloseRate)} icon={Target} subtitle="Email-exact matches only" />
        <MetricCard title="Confirmed Close Rate" value={formatPercent(m.confirmedCloseRate)} icon={TrendingUp} subtitle="All new_lead matches" />
        <MetricCard title="Avg Order Value" value={formatCurrency(m.avgOrderValue)} icon={BarChart3} />
        <MetricCard title="New Lead Revenue" value={formatCurrency(m.newLeadRevenue)} icon={DollarSign} subtitle="sale_type = new_lead" />
        <MetricCard title="Repeat/Direct Revenue" value={formatCurrency(m.repeatDirectRevenue)} icon={RefreshCw} subtitle="sale_type = repeat_direct" />
        <MetricCard
          title="Unmatched Sales"
          value={formatNumber(m.unmatchedCount)}
          icon={AlertCircle}
          subtitle="Click to review"
          link="/attribution"
        />
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
