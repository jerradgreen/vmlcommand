import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChartContainer } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip } from "recharts";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import {
  Target, Shield, TrendingUp, TrendingDown, Minus, DollarSign, Factory,
  ShoppingCart, Megaphone, PieChart, AlertTriangle, ArrowRight, Lock,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ── Types ── */
interface Metrics {
  totalLeads: number; totalSales: number; closeRate: number; avgOrderValue: number;
  depositRevenue: number; newLeadSalesCount: number; repeatDirectSalesCount: number;
  adsSpendTotal: number; rangeRoas: number; fullyLoadedCPO: number;
  adjustedCogsPct: number; adjustedCogsTotal: number;
  overheadTotal: number; overheadMonthlyRunRate: number;
  accruedMfgRemaining: number; estimatedMfgTotal: number; allocatedMfgTotal: number;
  mfgUnpaidCount: number; mfgPartialCount: number; mfgPaidCount: number;
  revenueMonthlyRunRate: number; cogsMonthlyRunRate: number;
  adsMonthlyRunRate: number; loanMonthlyRunRate: number;
  totalOpCostMonthlyRunRate: number; netProfitMonthlyRunRate: number;
  profitMarginPctRunRate: number; profitPerSale: number; netProfitPerSaleRunRate: number;
  shopifyCapitalRemaining: number; next7BillsDue: number; next7CogsDue: number;
  personalDrawTotal: number; marketingPctOfRevenue: number;
}

interface CashMetrics {
  cashInBank: number; cardsOwedDisplay: number; netCashPosition: number;
  totalInflow: number; totalOutflow: number; hasData: boolean;
}

interface TrendPoint {
  date: string; leads: number; sales: number; revenue: number;
  adSpend: number; closeRate: number | null;
  [key: string]: any;
}

interface Props {
  metrics: Metrics;
  cashMetrics: CashMetrics | null | undefined;
  trends: TrendPoint[] | null | undefined;
}

/* ── Precision Badge ── */
function PrecisionBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="text-[10px] font-normal border-dashed text-muted-foreground ml-2 whitespace-nowrap">
      {label}
    </Badge>
  );
}

/* ── Status Badge ── */
function StatusBadge({ status }: { status: "green" | "yellow" | "red" }) {
  const styles = {
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    yellow: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    red: "bg-destructive/10 text-destructive border-destructive/30",
  };
  const labels = { green: "Strong", yellow: "Watch", red: "Action Needed" };
  return <Badge variant="outline" className={cn("text-xs", styles[status])}>{labels[status]}</Badge>;
}

/* ── Trend Arrow ── */
function TrendArrow({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (direction === "down") return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function getStatus(value: number, greenThreshold: number, yellowThreshold: number, higherIsBetter = true): "green" | "yellow" | "red" {
  if (higherIsBetter) {
    if (value >= greenThreshold) return "green";
    if (value >= yellowThreshold) return "yellow";
    return "red";
  }
  if (value <= greenThreshold) return "green";
  if (value <= yellowThreshold) return "yellow";
  return "red";
}

/* ══════════════════ MAIN COMPONENT ══════════════════ */
export default function CeoMorningBrief({ metrics: m, cashMetrics, trends }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [ownerTarget, setOwnerTarget] = useState(() => {
    const saved = localStorage.getItem("ceo-owner-target");
    return saved ? Number(saved) : 10000;
  });

  useEffect(() => {
    localStorage.setItem("ceo-owner-target", String(ownerTarget));
  }, [ownerTarget]);

  const cashInBank = cashMetrics?.cashInBank ?? 0;

  /* ── Run-rate calculations ── */
  const monthlyNetRunRate = m.revenueMonthlyRunRate - m.totalOpCostMonthlyRunRate;
  const cashAvailable = cashInBank + monthlyNetRunRate;
  const ownerSurplus = cashAvailable - ownerTarget;
  const ownerSafetyStatus = getStatus(ownerSurplus, ownerTarget * 0.2, 0);

  /* ── 30-Day Cash Forecast ── */
  const dailyNetRunRate = monthlyNetRunRate / 30.44;
  const forecastData = useMemo(() => {
    const points = [0, 7, 14, 21, 30];
    return points.map(d => ({
      day: d === 0 ? "Today" : `+${d}d`,
      dayNum: d,
      projected: Math.round(cashInBank + dailyNetRunRate * d),
    }));
  }, [cashInBank, dailyNetRunRate]);

  const forecastChartConfig = {
    projected: { label: "Projected Cash", color: "hsl(220, 70%, 50%)" },
  };

  /* ── Revenue Pipeline Coverage ── */
  const pipelineLeads = Math.max(0, m.totalLeads - m.newLeadSalesCount);
  const expectedPipelineRevenue = pipelineLeads * m.closeRate * m.avgOrderValue;
  const revenueTarget = m.profitMarginPctRunRate > 0 ? ownerTarget / m.profitMarginPctRunRate : ownerTarget * 5;
  const pipelineCoverage = revenueTarget > 0 ? expectedPipelineRevenue / revenueTarget : 0;
  const pipelineStatus = getStatus(pipelineCoverage, 0.8, 0.5);

  /* ── Manufacturing Liability ── */
  const mfgOwed = m.accruedMfgRemaining;
  const depositProxy = m.depositRevenue;
  const mfgCoverage = (depositProxy + mfgOwed) > 0 ? depositProxy / (depositProxy + mfgOwed) : 1;
  const mfgStatus = getStatus(mfgCoverage, 0.8, 0.5);

  /* ── Marketing Health ── */
  const marketingStatus = getStatus(m.rangeRoas, 3, 2);

  /* ── Margin Watch ── */
  const cogsPctStatus = getStatus(m.adjustedCogsPct, 0.45, 0.55, false);
  const adsPctOfRev = m.depositRevenue > 0 ? m.adsSpendTotal / m.depositRevenue : 0;
  const overheadPctOfRev = m.depositRevenue > 0 ? m.overheadTotal / m.depositRevenue : 0;

  /* ── Sales Engine ── */
  const closeRateStatus = getStatus(m.closeRate, 0.05, 0.03);

  /* ── Today's Priorities ── */
  const priorities = useMemo(() => {
    const items: { label: string; detail: string; severity: number }[] = [];

    if (m.closeRate < 0.03) items.push({ label: "Close rate critically low", detail: `${(m.closeRate * 100).toFixed(1)}% — below 3% threshold`, severity: 5 });
    else if (m.closeRate < 0.05) items.push({ label: "Close rate needs attention", detail: `${(m.closeRate * 100).toFixed(1)}% — below 5% target`, severity: 3 });

    if (m.adjustedCogsPct > 0.55) items.push({ label: "COGS exceeding 55% of revenue", detail: `${(m.adjustedCogsPct * 100).toFixed(1)}% — review manufacturing costs`, severity: 5 });
    else if (m.adjustedCogsPct > 0.45) items.push({ label: "COGS trending high", detail: `${(m.adjustedCogsPct * 100).toFixed(1)}% — approaching 55% threshold`, severity: 2 });

    if (m.rangeRoas > 0 && m.rangeRoas < 2) items.push({ label: "ROAS below 2x", detail: `${m.rangeRoas.toFixed(2)}x — ad spend efficiency is low`, severity: 4 });
    else if (m.rangeRoas >= 2 && m.rangeRoas < 3) items.push({ label: "ROAS could improve", detail: `${m.rangeRoas.toFixed(2)}x — target 3x+`, severity: 2 });

    if (ownerSurplus < 0) items.push({ label: "Owner draw shortfall", detail: `${formatCurrency(Math.abs(ownerSurplus))} below target — review costs or revenue`, severity: 4 });

    const monthlyOpCosts = m.totalOpCostMonthlyRunRate;
    const cashCushionMonths = monthlyOpCosts > 0 ? cashInBank / monthlyOpCosts : 99;
    if (cashCushionMonths < 1) items.push({ label: "Cash cushion below 1 month of operating costs", detail: `${cashCushionMonths.toFixed(1)} months of runway at current burn`, severity: 5 });
    else if (cashCushionMonths < 2) items.push({ label: "Cash cushion is thin", detail: `${cashCushionMonths.toFixed(1)} months of runway`, severity: 2 });

    if (mfgCoverage < 0.5) items.push({ label: "Manufacturing liability under-covered", detail: `${(mfgCoverage * 100).toFixed(0)}% coverage — deposits may not cover production`, severity: 3 });

    return items.sort((a, b) => b.severity - a.severity).slice(0, 3);
  }, [m, ownerSurplus, cashInBank, mfgCoverage]);

  /* ── Trend Signals ── */
  const trendSignals = useMemo(() => {
    if (!trends || trends.length < 6) return null;
    const mid = Math.floor(trends.length / 2);
    const firstHalf = trends.slice(0, mid);
    const secondHalf = trends.slice(mid);

    const avg = (arr: TrendPoint[], key: string) => {
      const vals = arr.map(t => Number(t[key]) || 0);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const dir = (first: number, second: number): "up" | "down" | "flat" => {
      const change = first > 0 ? (second - first) / first : 0;
      if (change > 0.05) return "up";
      if (change < -0.05) return "down";
      return "flat";
    };

    return {
      revenue: dir(avg(firstHalf, "revenue"), avg(secondHalf, "revenue")),
      leads: dir(avg(firstHalf, "leads"), avg(secondHalf, "leads")),
      adSpend: dir(avg(firstHalf, "adSpend"), avg(secondHalf, "adSpend")),
      closeRate: dir(
        firstHalf.filter(t => t.closeRate != null).reduce((s, t) => s + (t.closeRate ?? 0), 0) / Math.max(1, firstHalf.filter(t => t.closeRate != null).length),
        secondHalf.filter(t => t.closeRate != null).reduce((s, t) => s + (t.closeRate ?? 0), 0) / Math.max(1, secondHalf.filter(t => t.closeRate != null).length),
      ),
    };
  }, [trends]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            ☀️ CEO Morning Brief
          </h2>
          <p className="text-sm text-muted-foreground">Key decisions at a glance — all estimates use monthly run-rates unless noted</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsed && (
        <div className="space-y-4">
          {/* ═══ 1. Owner Target Simulator ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Target className="h-4 w-4 mr-2" />
                Monthly Owner Target
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={ownerTarget}
                  onChange={(e) => setOwnerTarget(Number(e.target.value) || 0)}
                  className="w-40 font-mono"
                />
                <span className="text-xs text-muted-foreground">per month — used to calculate safety metrics below</span>
              </div>
            </CardContent>
          </Card>

          {/* ═══ 2. Owner Draw Safety ═══ */}
          <Card className={cn("border-2", ownerSafetyStatus === "green" ? "border-emerald-500/30" : ownerSafetyStatus === "yellow" ? "border-amber-500/30" : "border-destructive/30")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Shield className="h-4 w-4 mr-2" />
                Owner Draw Safety
                <PrecisionBadge label="Estimated (Run-Rate Based)" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="text-xl font-bold">{formatCurrency(ownerTarget)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cash Available (est.)</p>
                  <p className={cn("text-xl font-bold", cashAvailable >= ownerTarget ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{formatCurrency(cashAvailable)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{ownerSurplus >= 0 ? "Surplus" : "Shortfall"}</p>
                  <div className="flex items-center gap-2">
                    <p className={cn("text-xl font-bold", ownerSurplus >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{formatCurrency(Math.abs(ownerSurplus))}</p>
                    <StatusBadge status={ownerSafetyStatus} />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground border-t pt-2">
                Cash Available = Cash in Bank ({formatCurrency(cashInBank)}) + Revenue Run-Rate ({formatCurrency(m.revenueMonthlyRunRate)}/mo)
                − COGS ({formatCurrency(m.cogsMonthlyRunRate)}/mo) − Ads ({formatCurrency(m.adsMonthlyRunRate)}/mo)
                − Overhead ({formatCurrency(m.overheadMonthlyRunRate)}/mo) − Loan ({formatCurrency(m.loanMonthlyRunRate)}/mo)
              </p>
            </CardContent>
          </Card>

          {/* ═══ 3. Cash Forecast Timeline ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Estimated 30-Day Cash Outlook
                  <PrecisionBadge label="Run-Rate Based" />
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Projection based on current monthly run-rates — not a forecast of actual dated cash flows
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={forecastChartConfig} className="h-[180px] w-full">
                <LineChart data={forecastData}>
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} width={55} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <ReferenceLine y={ownerTarget} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: `Target: ${formatCurrency(ownerTarget)}`, position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Line type="monotone" dataKey="projected" stroke="var(--color-projected)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* ═══ 4. Revenue Pipeline Coverage ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Revenue Pipeline Coverage
                <PrecisionBadge label="Approximate" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pipelineLeads > 0 ? (
                <>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Unconverted Leads</p>
                      <p className="text-lg font-bold">{formatNumber(pipelineLeads)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Expected Revenue</p>
                      <p className="text-lg font-bold">{formatCurrency(expectedPipelineRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Revenue Target</p>
                      <p className="text-lg font-bold">{formatCurrency(revenueTarget)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Coverage</p>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-bold">{formatPercent(pipelineCoverage)}</p>
                        <StatusBadge status={pipelineStatus} />
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground border-t pt-2">
                    Based on unconverted leads ({formatNumber(pipelineLeads)}) × historical close rate ({formatPercent(m.closeRate)}) × AOV ({formatCurrency(m.avgOrderValue)}).
                    Revenue target derived from owner target ÷ profit margin run-rate.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">No open pipeline leads detected — all leads have converted or no leads in range.</p>
              )}
            </CardContent>
          </Card>

          {/* ═══ 5. Next 3 Sales Impact ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <ArrowRight className="h-4 w-4 mr-2" />
                Next Sales Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">+1 Sale</p>
                  <p className="text-lg font-bold">{formatCurrency(m.avgOrderValue)}</p>
                  <p className="text-xs text-muted-foreground">≈ {formatCurrency(m.profitPerSale)} net profit</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">+3 Sales</p>
                  <p className="text-lg font-bold">{formatCurrency(m.avgOrderValue * 3)}</p>
                  <p className="text-xs text-muted-foreground">≈ {formatCurrency(m.profitPerSale * 3)} net profit</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ═══ 6. Manufacturing Liability Tracker ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Factory className="h-4 w-4 mr-2" />
                Manufacturing Liability
                <PrecisionBadge label="Approximate" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total Mfg Owed</p>
                  <p className="text-lg font-bold">{formatCurrency(mfgOwed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customer Deposits (proxy)</p>
                  <p className="text-lg font-bold">{formatCurrency(depositProxy)}</p>
                  <p className="text-[10px] text-muted-foreground">Total deposits, not order-specific</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Production Coverage</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{formatPercent(mfgCoverage)}</p>
                    <StatusBadge status={mfgStatus} />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground border-t pt-2">
                Coverage = Total Deposits ÷ (Total Deposits + Unpaid Mfg Cost).
                Uses total deposits as proxy — per-order deposit tracking not yet available.
              </p>
            </CardContent>
          </Card>

          {/* ═══ 7. Quote Engagement Monitor ═══ */}
          <Card className="border-dashed border-2 border-muted-foreground/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground/60 flex items-center">
                <Lock className="h-4 w-4 mr-2" />
                Quote Engagement Monitor
                <Badge variant="outline" className="ml-2 text-[10px] border-dashed text-muted-foreground/60">
                  Coming Soon — No Data Connected Yet
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground/50 italic">
                This section will track quote-to-close timing and engagement once quote data is connected.
                Future feature — not a live metric.
              </p>
            </CardContent>
          </Card>

          {/* ═══ 8. Sales Engine Status ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Sales Engine Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Leads</p>
                  <p className="text-lg font-bold">{formatNumber(m.totalLeads)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sales</p>
                  <p className="text-lg font-bold">{formatNumber(m.totalSales)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Close Rate</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{formatPercent(m.closeRate)}</p>
                    <StatusBadge status={closeRateStatus} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Backlog (Unmatched)</p>
                  <p className="text-lg font-bold">{formatNumber(pipelineLeads)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ═══ 9. Marketing Engine Health ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Megaphone className="h-4 w-4 mr-2" />
                Marketing Engine Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">ROAS</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{m.rangeRoas > 0 ? `${m.rangeRoas.toFixed(2)}x` : "—"}</p>
                    <StatusBadge status={marketingStatus} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost per Sale</p>
                  <p className="text-lg font-bold">{formatCurrency(m.fullyLoadedCPO)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ad Spend</p>
                  <p className="text-lg font-bold">{formatCurrency(m.adsSpendTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Marketing % of Rev</p>
                  <p className="text-lg font-bold">{formatPercent(m.marketingPctOfRevenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ═══ 10. Margin Watch ═══ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <PieChart className="h-4 w-4 mr-2" />
                Margin Watch
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">COGS %</p>
                  <div className="flex items-center gap-2">
                    <p className={cn("text-lg font-bold", m.adjustedCogsPct > 0.55 && "text-destructive")}>{formatPercent(m.adjustedCogsPct)}</p>
                    <StatusBadge status={cogsPctStatus} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ad Spend %</p>
                  <p className="text-lg font-bold">{formatPercent(adsPctOfRev)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overhead %</p>
                  <p className="text-lg font-bold">{formatPercent(overheadPctOfRev)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ═══ 11. Today's Priorities ═══ */}
          {priorities.length > 0 && (
            <Card className="border-2 border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                  Today's Priorities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {priorities.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-muted/50">
                      <span className="text-xs font-bold text-muted-foreground mt-0.5">{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium">{p.label}</p>
                        <p className="text-xs text-muted-foreground">{p.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══ 12. Trend Signals ═══ */}
          {trendSignals && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Trend Signals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: "Revenue", dir: trendSignals.revenue },
                    { label: "Leads", dir: trendSignals.leads },
                    { label: "Ad Spend", dir: trendSignals.adSpend },
                    { label: "Close Rate", dir: trendSignals.closeRate },
                  ].map(({ label, dir }) => (
                    <div key={label} className="flex items-center gap-2">
                      <TrendArrow direction={dir} />
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm font-medium capitalize">{dir}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
