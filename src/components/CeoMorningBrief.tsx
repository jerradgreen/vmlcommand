import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChartContainer } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip } from "recharts";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/format";
import {
  Target, Shield, TrendingUp, TrendingDown, Minus, DollarSign, Factory,
  ShoppingCart, Megaphone, PieChart, AlertTriangle, ArrowRight,
  ChevronDown, ChevronUp, Zap, Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
  metrics30d: Metrics;
  metrics12m: Metrics;
  metricsMtd: Metrics;
  cashMetrics: CashMetrics | null;
  trends: TrendPoint[] | null;
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
  const labels: Record<string, string> = { green: "Strong", yellow: "Watch", red: "Action Needed" };
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

/* ── Section Header ── */
function SectionHeader({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">{title}</h3>
      <Separator className="flex-1" />
    </div>
  );
}

/* ══════════════════ MAIN COMPONENT ══════════════════ */
export default function CeoMorningBrief({ metrics30d: m, metrics12m: m12, metricsMtd: mMtd, cashMetrics, trends }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [ownerTarget, setOwnerTarget] = useState(() => {
    const saved = localStorage.getItem("ceo-owner-target");
    return saved ? Number(saved) : 10000;
  });

  useEffect(() => {
    localStorage.setItem("ceo-owner-target", String(ownerTarget));
  }, [ownerTarget]);

  /* ══════ EXPLICIT COGS BY TIME WINDOW ══════
     briefCogs = allocatedMfgTotal (actual mfg allocated to sales in window)
               + accruedMfgRemaining (estimated 50% cost for unallocated sales in window)
     This is per-sale COGS — NOT bank-feed COGS, NOT cumulative liability.
  */
  const briefCogs30d = m.allocatedMfgTotal + m.accruedMfgRemaining;
  const briefCogs12m = m12.allocatedMfgTotal + m12.accruedMfgRemaining;
  const briefCogsMtd = mMtd.allocatedMfgTotal + mMtd.accruedMfgRemaining;

  /* ── Derived profitability (30d) — sales-based revenue for consistent timing ── */
  const salesRevenue30d = (m as any).rangeRevenue ?? 0;
  const grossProfit30d = salesRevenue30d - briefCogs30d;
  const grossMargin30d = salesRevenue30d > 0 ? grossProfit30d / salesRevenue30d : 0;
  const cogsPct30d = salesRevenue30d > 0 ? briefCogs30d / salesRevenue30d : 0;
  const shopifyCapPaid30d = (m as any).shopifyCapitalPaidInRange ?? 0;
  const netProfit30d = grossProfit30d - m.adsSpendTotal - m.overheadTotal - shopifyCapPaid30d;
  const netProfitMargin30d = salesRevenue30d > 0 ? netProfit30d / salesRevenue30d : 0;

  /* ── Cash ── */
  const cashInBank = cashMetrics?.cashInBank ?? 0;
  const netCashPosition = cashMetrics?.netCashPosition ?? 0;

  /* ── Manufacturing Liability (cumulative — use 12m as best proxy) ── */
  const outstandingMfgLiability = m12.accruedMfgRemaining;
  const depositProxy = m.depositRevenue;
  const mfgCoverage = (depositProxy + outstandingMfgLiability) > 0
    ? depositProxy / (depositProxy + outstandingMfgLiability)
    : 1;
  const mfgCoverageStatus: "green" | "yellow" | "red" =
    mfgCoverage >= 0.8 ? "green" :
    mfgCoverage >= 0.6 ? "green" :
    mfgCoverage >= 0.4 ? "yellow" : "red";
  const mfgCoverageLabel =
    mfgCoverage >= 0.8 ? "Safe" :
    mfgCoverage >= 0.6 ? "Normal" :
    mfgCoverage >= 0.4 ? "Watch" : "Risk";

  /* ── 12m baseline assumptions — use sales revenue for margin consistency ── */
  const closeRate12m = m12.closeRate;
  const aov12m = m12.avgOrderValue;
  const salesRevenue12m = (m12 as any).rangeRevenue ?? 0;
  const grossMargin12m = salesRevenue12m > 0 ? (salesRevenue12m - briefCogs12m) / salesRevenue12m : 0;
  const leadValue = aov12m * closeRate12m * grossMargin12m;

  /* ── Owner Income Tracker ── */
  const overheadMonthly = m.overheadMonthlyRunRate;
  const adSpendMonthly = m.adsMonthlyRunRate;
  const requiredGrossProfit = ownerTarget + overheadMonthly + adSpendMonthly;
  const grossProfitThisMonth = mMtd.depositRevenue - briefCogsMtd;
  const remainingGap = requiredGrossProfit - grossProfitThisMonth;
  const leadsRequired = leadValue > 0 ? Math.ceil(requiredGrossProfit / leadValue) : 0;
  const ownerOnTrack = grossProfitThisMonth >= requiredGrossProfit;

  /* ── Margin Watch (30d, using briefCogs30d) ── */
  const cogsPctStatus = getStatus(cogsPct30d, 0.45, 0.55, false);
  const adsPctOfRev = m.depositRevenue > 0 ? m.adsSpendTotal / m.depositRevenue : 0;
  const overheadPctOfRev = m.depositRevenue > 0 ? m.overheadTotal / m.depositRevenue : 0;

  /* ── Sales Engine ── */
  const closeRateStatus = getStatus(m.closeRate, 0.05, 0.03);
  const marketingStatus = getStatus(m.rangeRoas, 3, 2);

  /* ── Cash forecast ── */
  const monthlyNetRunRate = m.revenueMonthlyRunRate - m.totalOpCostMonthlyRunRate;
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

  /* ── Cash runway ── */
  const monthlyOpCosts = m.totalOpCostMonthlyRunRate;
  const cashCushionMonths = monthlyOpCosts > 0 ? cashInBank / monthlyOpCosts : 99;

  /* ── Next 3 Sales Impact (using briefCogs30d for profit per sale) ── */
  const profitPerSale30d = m.totalSales > 0 ? netProfit30d / m.totalSales : 0;

  /* ══════ Opportunity Alerts ══════ */
  const opportunityAlerts = useMemo(() => {
    const alerts: { title: string; explanation: string; impact: string; severity: number }[] = [];

    if (m.closeRate < 0.03 && m.totalLeads > 0) {
      const targetRate = 0.033;
      const additionalSales = Math.round((targetRate - m.closeRate) * m.totalLeads);
      const additionalRevenue = additionalSales * m.avgOrderValue;
      alerts.push({
        title: "Conversion Improvement",
        explanation: `Current close rate: ${(m.closeRate * 100).toFixed(1)}%. If conversion increases to ${(targetRate * 100).toFixed(1)}%:`,
        impact: `Expected additional revenue: ~${formatCurrency(additionalRevenue)} (${additionalSales} more sales)`,
        severity: 5,
      });
    }

    if (cogsPct30d > 0.55 && m.depositRevenue > 0) {
      const savings = (cogsPct30d - 0.45) * m.depositRevenue;
      alerts.push({
        title: "COGS Reduction",
        explanation: `COGS at ${(cogsPct30d * 100).toFixed(1)}% of revenue — exceeds 55% threshold.`,
        impact: `Reducing to 45% would save ~${formatCurrency(savings)}/mo in production costs`,
        severity: 5,
      });
    }

    if (m.rangeRoas > 0 && m.rangeRoas < 2 && m.adsSpendTotal > 0) {
      const wastedSpend = m.adsSpendTotal * (1 - m.rangeRoas / 2);
      alerts.push({
        title: "Ad Efficiency",
        explanation: `ROAS at ${m.rangeRoas.toFixed(2)}x — below 2x breakeven threshold.`,
        impact: `~${formatCurrency(Math.abs(wastedSpend))} in ad spend not generating adequate returns`,
        severity: 4,
      });
    }

    if (cashCushionMonths < 2) {
      alerts.push({
        title: "Cash Runway Risk",
        explanation: `Only ${cashCushionMonths.toFixed(1)} months of operating costs in the bank at current burn rate.`,
        impact: `Need to increase cash reserves or reduce monthly burn of ${formatCurrency(monthlyOpCosts)}`,
        severity: 5,
      });
    }

    return alerts.sort((a, b) => b.severity - a.severity).slice(0, 4);
  }, [m, cogsPct30d, cashCushionMonths, monthlyOpCosts]);

  /* ══════ Action Engine ══════ */
  const actions = useMemo(() => {
    const items: { title: string; reason: string; step: string; impact: string; severity: number }[] = [];

    if (m.closeRate < 0.03) {
      const additionalSales = Math.max(1, Math.round((0.033 - m.closeRate) * m.totalLeads));
      items.push({
        title: "Reactivate Stale Leads",
        reason: `Close rate is ${(m.closeRate * 100).toFixed(1)}% — many leads remain unconverted.`,
        step: "Send re-engagement campaign to leads older than 60 days.",
        impact: `+${additionalSales} additional sales → +${formatCurrency(additionalSales * m.avgOrderValue)} revenue`,
        severity: 5,
      });
    } else if (m.closeRate < 0.05) {
      items.push({
        title: "Improve Lead Follow-Up Speed",
        reason: `Close rate at ${(m.closeRate * 100).toFixed(1)}% — below 5% target.`,
        step: "Review lead response time; aim to follow up within 24 hours.",
        impact: `Each 1% improvement → ~${formatCurrency(m.totalLeads * 0.01 * m.avgOrderValue)} additional revenue`,
        severity: 3,
      });
    }

    if (cogsPct30d > 0.55) {
      items.push({
        title: "Renegotiate Manufacturing Costs",
        reason: `COGS at ${(cogsPct30d * 100).toFixed(1)}% — exceeding 55% of revenue.`,
        step: "Request updated quotes from top 3 vendors; compare per-unit costs.",
        impact: `Reducing to 50% would save ~${formatCurrency((cogsPct30d - 0.50) * m.depositRevenue)}/mo`,
        severity: 5,
      });
    }

    if (m.rangeRoas > 0 && m.rangeRoas < 2) {
      items.push({
        title: "Pause Low-Performing Ad Campaigns",
        reason: `ROAS at ${m.rangeRoas.toFixed(2)}x — ad spend outpacing returns.`,
        step: "Review campaign-level ROAS; pause campaigns below 1.5x.",
        impact: `Reallocating ${formatCurrency(m.adsSpendTotal * 0.3)} to top performers could lift ROAS to 2.5x+`,
        severity: 4,
      });
    }

    if (remainingGap > 0) {
      items.push({
        title: "Address Owner Draw Shortfall",
        reason: `${formatCurrency(remainingGap)} below target after projected costs.`,
        step: "Review discretionary overhead; defer non-essential expenses this month.",
        impact: `Closing the gap secures your ${formatCurrency(ownerTarget)}/mo target`,
        severity: 4,
      });
    }

    if (cashCushionMonths < 1) {
      items.push({
        title: "Emergency Cash Conservation",
        reason: `Cash cushion at ${cashCushionMonths.toFixed(1)} months — critical.`,
        step: "Accelerate accounts receivable collection; delay discretionary purchases.",
        impact: `Each ${formatCurrency(monthlyOpCosts * 0.1)} saved extends runway by ~3 days`,
        severity: 5,
      });
    }

    if (mfgCoverage < 0.5) {
      items.push({
        title: "Collect Outstanding Deposits",
        reason: `Manufacturing coverage at ${(mfgCoverage * 100).toFixed(0)}% — deposits may not cover production.`,
        step: "Follow up on outstanding customer deposits before starting new production runs.",
        impact: `Closing the gap reduces ${formatCurrency(outstandingMfgLiability)} in unfunded manufacturing liability`,
        severity: 3,
      });
    }

    return items.sort((a, b) => b.severity - a.severity).slice(0, 3);
  }, [m, cogsPct30d, remainingGap, ownerTarget, cashCushionMonths, monthlyOpCosts, mfgCoverage, outstandingMfgLiability]);

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
            ☀️ Daily Operational Brief
          </h2>
          <p className="text-sm text-muted-foreground">Key decisions at a glance — 30d operational · 12m baseline · MTD owner draw</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsed && (
        <div className="space-y-4">

          {/* ══════════════════════════════════════════════════════
              SECTION 1: BUSINESS HEALTH
              ══════════════════════════════════════════════════════ */}
          <SectionHeader title="Business Health" icon={Shield} />

          {/* Owner Target Simulator */}
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
                <span className="text-xs text-muted-foreground">per month — used to calculate owner income tracker below</span>
              </div>
            </CardContent>
          </Card>

          {/* Cash Position */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <DollarSign className="h-4 w-4 mr-2" />
                Cash Position
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Cash in Bank</p>
                  <p className="text-xl font-bold">{formatCurrency(cashInBank)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Credit Cards Owed</p>
                  <p className="text-xl font-bold text-destructive">{formatCurrency(cashMetrics?.cardsOwedDisplay ?? 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Cash Position</p>
                  <p className={cn("text-xl font-bold", netCashPosition >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{formatCurrency(netCashPosition)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cash Forecast Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <div>
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Estimated 30-Day Cash Outlook
                  <PrecisionBadge label="Run-Rate Based" />
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Projection based on last 30 days average daily net cash flow — not a guaranteed forecast
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

          {/* Manufacturing Liability + Coverage Ratio */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Factory className="h-4 w-4 mr-2" />
                Manufacturing Liability
                <PrecisionBadge label="Approximate — deposits reflect last 30 days; liability is cumulative" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding Mfg Liability</p>
                  <p className="text-lg font-bold">{formatCurrency(outstandingMfgLiability)}</p>
                  <p className="text-[10px] text-muted-foreground">Cumulative unpaid (12m proxy)</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customer Deposits (30d)</p>
                  <p className="text-lg font-bold">{formatCurrency(depositProxy)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Manufacturing Coverage</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{formatPercent(mfgCoverage)}</p>
                    <Badge variant="outline" className={cn("text-xs",
                      mfgCoverageStatus === "green" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" :
                      mfgCoverageStatus === "yellow" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" :
                      "bg-destructive/10 text-destructive border-destructive/30"
                    )}>{mfgCoverageLabel}</Badge>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground border-t pt-2">
                Coverage = 30d Deposits ÷ (30d Deposits + Outstanding Mfg Liability).
                Mixes 30-day deposit window with cumulative liability — treat as directional, not exact.
              </p>
            </CardContent>
          </Card>

          {/* Margin Watch */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <PieChart className="h-4 w-4 mr-2" />
                Margin Watch
                <PrecisionBadge label="30-day window · per-sale COGS" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">COGS %</p>
                  <div className="flex items-center gap-2">
                    <p className={cn("text-lg font-bold", cogsPct30d > 0.55 && "text-destructive")}>{formatPercent(cogsPct30d)}</p>
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

          {/* ══════════════════════════════════════════════════════
              SECTION 2: REVENUE ENGINE (30d)
              ══════════════════════════════════════════════════════ */}
          <SectionHeader title="Revenue Engine" icon={ShoppingCart} />

          {/* Sales Engine Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Sales Engine Status
                <PrecisionBadge label="30-day window" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Cognito Submissions</p>
                  <p className="text-lg font-bold">{formatNumber(m.totalLeads)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sales (30d)</p>
                  <p className="text-lg font-bold">{formatNumber(m.newLeadSalesCount)}</p>
                  <p className="text-[10px] text-muted-foreground">New lead sales only</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Close Rate</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{formatPercent(m.closeRate)}</p>
                    <StatusBadge status={closeRateStatus} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Sales ÷ Cognito submissions</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Deposits (30d)</p>
                  <p className="text-lg font-bold">{formatCurrency(m.depositRevenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Marketing Engine Health */}
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
                  <p className="text-xs text-muted-foreground">Ad Spend (30d)</p>
                  <p className="text-lg font-bold">{formatCurrency(m.adsSpendTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">AOV (30d)</p>
                  <p className="text-lg font-bold">{formatCurrency(m.avgOrderValue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Next 3 Sales Impact */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <ArrowRight className="h-4 w-4 mr-2" />
                Next 3 Sales Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">+1 Sale</p>
                  <p className="text-lg font-bold">{formatCurrency(m.avgOrderValue)}</p>
                  <p className="text-xs text-muted-foreground">≈ {formatCurrency(profitPerSale30d)} net profit</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">+3 Sales</p>
                  <p className="text-lg font-bold">{formatCurrency(m.avgOrderValue * 3)}</p>
                  <p className="text-xs text-muted-foreground">≈ {formatCurrency(profitPerSale30d * 3)} net profit</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════
              SECTION 3: PROFITABILITY (30d)
              ══════════════════════════════════════════════════════ */}
          <SectionHeader title="Profitability" icon={PieChart} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <PieChart className="h-4 w-4 mr-2" />
                30-Day P&L Summary
                <PrecisionBadge label="COGS = actual allocated + 50% estimate for unallocated" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Revenue (30d)</p>
                  <p className="text-xl font-bold">{formatCurrency(m.depositRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">COGS (actual + estimated)</p>
                  <p className="text-xl font-bold">{formatCurrency(briefCogs30d)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Allocated: {formatCurrency(m.allocatedMfgTotal)} · Est: {formatCurrency(m.accruedMfgRemaining)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gross Profit</p>
                  <p className={cn("text-xl font-bold", grossProfit30d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {formatCurrency(grossProfit30d)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Margin: {formatPercent(grossMargin30d)}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Ad Spend</p>
                  <p className="text-lg font-bold">{formatCurrency(m.adsSpendTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Overhead</p>
                  <p className="text-lg font-bold">{formatCurrency(m.overheadTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Profit</p>
                  <p className={cn("text-lg font-bold", netProfit30d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {formatCurrency(netProfit30d)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Margin</p>
                  <p className={cn("text-lg font-bold", netProfitMargin30d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {formatPercent(netProfitMargin30d)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════
              SECTION 4: OWNER INCOME TRACKER
              ══════════════════════════════════════════════════════ */}
          <SectionHeader title="Owner Income Tracker" icon={Target} />

          <Card className={cn("border-2", ownerOnTrack ? "border-emerald-500/30" : "border-destructive/30")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                <Target className="h-4 w-4 mr-2" />
                Monthly Income Goal
                <Badge variant="outline" className={cn("ml-2 text-xs",
                  ownerOnTrack
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-destructive/10 text-destructive border-destructive/30"
                )}>
                  {ownerOnTrack ? "On Track" : "Behind Pace"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Required Gross Profit to Cover Draw + Ads + Overhead</p>
                  <p className="text-xl font-bold">{formatCurrency(requiredGrossProfit)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gross Profit This Month</p>
                  <p className={cn("text-xl font-bold", grossProfitThisMonth >= requiredGrossProfit ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {formatCurrency(grossProfitThisMonth)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">MTD deposits − MTD COGS</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining Gap</p>
                  <p className={cn("text-xl font-bold", remainingGap <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {remainingGap <= 0 ? "Covered ✓" : formatCurrency(remainingGap)}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Lead Value (12m)</p>
                  <p className="text-lg font-bold">{formatCurrency(leadValue)}</p>
                  <p className="text-[10px] text-muted-foreground">AOV × Close Rate × Gross Margin</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Leads Required / Month</p>
                  <p className="text-lg font-bold">{formatNumber(leadsRequired)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Leads Generated (30d)</p>
                  <p className="text-lg font-bold">{formatNumber(m.totalLeads)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lead Gap</p>
                  <p className={cn("text-lg font-bold", m.totalLeads >= leadsRequired ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {m.totalLeads >= leadsRequired ? "Sufficient ✓" : `Need ${formatNumber(leadsRequired - m.totalLeads)} more`}
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground border-t pt-2">
                Required = {formatCurrency(ownerTarget)} draw + {formatCurrency(overheadMonthly)}/mo overhead + {formatCurrency(adSpendMonthly)}/mo ad spend.
                Lead Value uses 12m baseline: AOV ({formatCurrency(aov12m)}) × Close Rate ({formatPercent(closeRate12m)}) × Gross Margin ({formatPercent(grossMargin12m)}).
              </p>
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════
              SECTION 5: WHAT TO DO TODAY
              ══════════════════════════════════════════════════════ */}
          <SectionHeader title="What To Do Today" icon={Zap} />

          {/* Opportunity Alerts */}
          {opportunityAlerts.length > 0 && (
            <Card className="border-2 border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                  <Lightbulb className="h-4 w-4 mr-2 text-primary" />
                  Opportunity Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {opportunityAlerts.map((alert, i) => (
                    <div key={i} className="p-3 rounded-lg bg-primary/5 border border-primary/10 space-y-1">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <span className="text-primary">Opportunity:</span> {alert.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{alert.explanation}</p>
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{alert.impact}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Engine (Today's Priorities) */}
          {actions.length > 0 && (
            <Card className="border-2 border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                  Today's Priorities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {actions.map((action, i) => (
                    <div key={i} className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full w-5 h-5 flex items-center justify-center shrink-0">{i + 1}</span>
                        {action.title}
                      </p>
                      <div className="pl-7 space-y-1">
                        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Reason:</span> {action.reason}</p>
                        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Suggested step:</span> {action.step}</p>
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400"><span className="text-foreground">Estimated impact:</span> {action.impact}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trend Signals */}
          {trendSignals && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Trend Signals
                  <PrecisionBadge label="First half vs second half of 30d window" />
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
