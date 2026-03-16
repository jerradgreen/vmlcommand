import { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Zap, Lightbulb,
  Flame, Settings, Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ── Action persistence helpers ── */
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function getCompletedActions(): string[] {
  try { return JSON.parse(localStorage.getItem("completedActions") || "[]"); } catch { return []; }
}
function getDismissedActions(): Record<string, number> {
  try {
    const raw: Record<string, number> = JSON.parse(localStorage.getItem("dismissedActions") || "{}");
    const now = Date.now();
    const pruned: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) { if (v > now) pruned[k] = v; }
    if (Object.keys(pruned).length !== Object.keys(raw).length) localStorage.setItem("dismissedActions", JSON.stringify(pruned));
    return pruned;
  } catch { return {}; }
}

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

/* ── Trend Arrow ── */
function TrendArrow({ direction, className }: { direction: "up" | "down" | "flat"; className?: string }) {
  if (direction === "up") return <TrendingUp className={cn("h-5 w-5 text-emerald-500", className)} />;
  if (direction === "down") return <TrendingDown className={cn("h-5 w-5 text-destructive", className)} />;
  return <Minus className={cn("h-5 w-5 text-muted-foreground", className)} />;
}

function trendColor(dir: "up" | "down" | "flat") {
  if (dir === "up") return "text-emerald-600 dark:text-emerald-400";
  if (dir === "down") return "text-destructive";
  return "text-muted-foreground";
}

/* ══════════════════ MAIN COMPONENT ══════════════════ */
export default function CeoMorningBrief({ metrics30d: m, metrics12m: m12, metricsMtd: mMtd, cashMetrics, trends }: Props) {

  /* ══════ EXPLICIT COGS BY TIME WINDOW ══════ */
  const briefCogs30d = m.allocatedMfgTotal + m.accruedMfgRemaining;
  const briefCogs12m = m12.allocatedMfgTotal + m12.accruedMfgRemaining;
  const briefCogsMtd = mMtd.allocatedMfgTotal + mMtd.accruedMfgRemaining;

  /* ── Derived profitability (30d) ── */
  const salesRevenue30d = (m as any).rangeRevenue ?? 0;
  const grossProfit30d = salesRevenue30d - briefCogs30d;
  const grossMargin30d = salesRevenue30d > 0 ? grossProfit30d / salesRevenue30d : 0;
  const cogsPct30d = salesRevenue30d > 0 ? briefCogs30d / salesRevenue30d : 0;
  const shopifyCapPaid30d = (m as any).shopifyCapitalPaidInRange ?? 0;
  const netProfit30d = grossProfit30d - m.adsSpendTotal - m.overheadTotal - shopifyCapPaid30d;
  const netProfitMargin30d = salesRevenue30d > 0 ? netProfit30d / salesRevenue30d : 0;

  /* ── Cash ── */
  const cashInBank = cashMetrics?.cashInBank ?? 0;

  /* ── Manufacturing Liability (cumulative — use 12m as best proxy) ── */
  const outstandingMfgLiability = m12.accruedMfgRemaining;
  const depositProxy = m.depositRevenue;
  const mfgCoverage = (depositProxy + outstandingMfgLiability) > 0
    ? depositProxy / (depositProxy + outstandingMfgLiability)
    : 1;

  /* ── 12m baseline ── */
  const closeRate12m = m12.closeRate;
  const aov12m = m12.avgOrderValue;
  const salesRevenue12m = (m12 as any).rangeRevenue ?? 0;
  const grossMargin12m = salesRevenue12m > 0 ? (salesRevenue12m - briefCogs12m) / salesRevenue12m : 0;
  const leadValue = aov12m * closeRate12m * grossMargin12m;

  /* ── Owner Income ── */
  const ownerTarget = 10000;
  const overheadMonthly = m.overheadMonthlyRunRate;
  const adSpendMonthly = m.adsMonthlyRunRate;
  const requiredGrossProfit = ownerTarget + overheadMonthly + adSpendMonthly;
  const salesRevenueMtd = (mMtd as any).rangeRevenue ?? 0;
  const grossProfitThisMonth = salesRevenueMtd - briefCogsMtd;
  const remainingGap = requiredGrossProfit - grossProfitThisMonth;

  /* ── Cash runway ── */
  const monthlyOpCosts = m.totalOpCostMonthlyRunRate;
  const cashCushionMonths = monthlyOpCosts > 0 ? cashInBank / monthlyOpCosts : 99;
  const costPerLead = m.totalLeads > 0 ? m.adsSpendTotal / m.totalLeads : 0;

  /* ══════ Opportunity Alerts ══════ */
  const opportunityAlerts = useMemo(() => {
    const alerts: { title: string; explanation: string; impact: string; severity: number }[] = [];
    if (m.closeRate < 0.03 && m.totalLeads > 0) {
      const targetRate = 0.033;
      const additionalSales = Math.round((targetRate - m.closeRate) * m.totalLeads);
      const additionalRevenue = additionalSales * m.avgOrderValue;
      alerts.push({ title: "Conversion Improvement", explanation: `Current close rate: ${(m.closeRate * 100).toFixed(1)}%. If conversion increases to ${(targetRate * 100).toFixed(1)}%:`, impact: `Expected additional revenue: ~${formatCurrency(additionalRevenue)} (${additionalSales} more sales)`, severity: 5 });
    }
    if (cogsPct30d > 0.55 && salesRevenue30d > 0) {
      const savings = (cogsPct30d - 0.45) * salesRevenue30d;
      alerts.push({ title: "COGS Reduction", explanation: `COGS at ${(cogsPct30d * 100).toFixed(1)}% of revenue — exceeds 55% threshold.`, impact: `Reducing to 45% would save ~${formatCurrency(savings)}/mo in production costs`, severity: 5 });
    }
    if (m.rangeRoas > 0 && m.rangeRoas < 2 && m.adsSpendTotal > 0) {
      const wastedSpend = m.adsSpendTotal * (1 - m.rangeRoas / 2);
      alerts.push({ title: "Ad Efficiency", explanation: `ROAS at ${m.rangeRoas.toFixed(2)}x — below 2x breakeven threshold.`, impact: `~${formatCurrency(Math.abs(wastedSpend))} in ad spend not generating adequate returns`, severity: 4 });
    }
    if (cashCushionMonths < 2) {
      alerts.push({ title: "Cash Runway Risk", explanation: `Only ${cashCushionMonths.toFixed(1)} months of operating costs in the bank at current burn rate.`, impact: `Need to increase cash reserves or reduce monthly burn of ${formatCurrency(monthlyOpCosts)}`, severity: 5 });
    }
    return alerts.sort((a, b) => b.severity - a.severity).slice(0, 4);
  }, [m, cogsPct30d, cashCushionMonths, monthlyOpCosts, salesRevenue30d]);

  /* ══════ Action Engine ══════ */
  const actions = useMemo(() => {
    const items: { title: string; reason: string; step: string; impact: string; severity: number }[] = [];
    if (m.closeRate < 0.03) {
      const additionalSales = Math.max(1, Math.round((0.033 - m.closeRate) * m.totalLeads));
      items.push({ title: "Reactivate Stale Leads", reason: `Close rate is ${(m.closeRate * 100).toFixed(1)}% — many leads remain unconverted.`, step: "Send re-engagement campaign to leads older than 60 days.", impact: `+${additionalSales} additional sales → +${formatCurrency(additionalSales * m.avgOrderValue)} revenue`, severity: 5 });
    } else if (m.closeRate < 0.05) {
      items.push({ title: "Improve Lead Follow-Up Speed", reason: `Close rate at ${(m.closeRate * 100).toFixed(1)}% — below 5% target.`, step: "Review lead response time; aim to follow up within 24 hours.", impact: `Each 1% improvement → ~${formatCurrency(m.totalLeads * 0.01 * m.avgOrderValue)} additional revenue`, severity: 3 });
    }
    if (cogsPct30d > 0.55) {
      items.push({ title: "Renegotiate Manufacturing Costs", reason: `COGS at ${(cogsPct30d * 100).toFixed(1)}% — exceeding 55% of revenue.`, step: "Request updated quotes from top 3 vendors; compare per-unit costs.", impact: `Reducing to 50% would save ~${formatCurrency((cogsPct30d - 0.50) * salesRevenue30d)}/mo`, severity: 5 });
    }
    if (m.rangeRoas > 0 && m.rangeRoas < 2) {
      items.push({ title: "Pause Low-Performing Ad Campaigns", reason: `ROAS at ${m.rangeRoas.toFixed(2)}x — ad spend outpacing returns.`, step: "Review campaign-level ROAS; pause campaigns below 1.5x.", impact: `Reallocating ${formatCurrency(m.adsSpendTotal * 0.3)} to top performers could lift ROAS to 2.5x+`, severity: 4 });
    }
    if (remainingGap > 0) {
      items.push({ title: "Address Owner Draw Shortfall", reason: `${formatCurrency(remainingGap)} below target after projected costs.`, step: "Review discretionary overhead; defer non-essential expenses this month.", impact: `Closing the gap secures your ${formatCurrency(ownerTarget)}/mo target`, severity: 4 });
    }
    if (cashCushionMonths < 1) {
      items.push({ title: "Emergency Cash Conservation", reason: `Cash cushion at ${cashCushionMonths.toFixed(1)} months — critical.`, step: "Accelerate accounts receivable collection; delay discretionary purchases.", impact: `Each ${formatCurrency(monthlyOpCosts * 0.1)} saved extends runway by ~3 days`, severity: 5 });
    }
    if (mfgCoverage < 0.5) {
      items.push({ title: "Collect Outstanding Deposits", reason: `Manufacturing coverage at ${(mfgCoverage * 100).toFixed(0)}% — deposits may not cover production.`, step: "Follow up on outstanding customer deposits before starting new production runs.", impact: `Closing the gap reduces ${formatCurrency(outstandingMfgLiability)} in unfunded manufacturing liability`, severity: 3 });
    }
    return items.sort((a, b) => b.severity - a.severity).slice(0, 3);
  }, [m, cogsPct30d, remainingGap, ownerTarget, cashCushionMonths, monthlyOpCosts, mfgCoverage, outstandingMfgLiability, salesRevenue30d]);

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

  /* ══════ Business Pulse Score ══════ */
  const pulseScore = Math.round(Math.min(100, Math.max(0,
    0.35 * Math.min(100, Math.max(0, (netProfitMargin30d + 0.2) / 0.4 * 100)) +
    0.25 * Math.min(100, Math.max(0, m.closeRate / 0.10 * 100)) +
    0.25 * Math.min(100, Math.max(0, cashCushionMonths / 6 * 100)) +
    0.15 * Math.min(100, Math.max(0, (0.8 - cogsPct30d) / 0.5 * 100))
  )));
  const pulseLabel = pulseScore >= 70 ? "Strong" : pulseScore >= 45 ? "Watch" : "Needs Attention";
  const pulseColor = pulseScore >= 70 ? "emerald" : pulseScore >= 45 ? "amber" : "red";
  const pulseSubtitle = pulseScore >= 70
    ? "Business is moving in the right direction"
    : pulseScore >= 40
    ? "Margins are compressed — monitor closely"
    : "Cash and conversion need attention";

  /* ══════ Watchouts ══════ */
  const watchouts = useMemo(() => {
    const items: { text: string }[] = [];
    if (m.closeRate < 0.05) items.push({ text: "Close rate below target" });
    if (cogsPct30d > 0.50) items.push({ text: "COGS above target" });
    if (cashCushionMonths < 3) items.push({ text: "Cash runway tight" });
    if (shopifyCapPaid30d > 0) items.push({ text: "Shopify Capital drag active" });
    return items.slice(0, 2);
  }, [m.closeRate, cogsPct30d, cashCushionMonths, shopifyCapPaid30d]);

  /* ══════ Business Insight Narrative ══════ */
  const insightNarrative = useMemo(() => {
    // Sentence 1 — Marketing + Conversion context
    let s1: string;
    if (m.rangeRoas > 5 && costPerLead < 50 && m.closeRate < 0.05) {
      s1 = `Marketing is generating leads efficiently at ${formatCurrency(costPerLead)} per lead with strong ROAS, but the close rate of ${(m.closeRate * 100).toFixed(1)}% suggests much of that demand is not yet converting.`;
    } else if (m.rangeRoas > 5 && m.closeRate >= 0.05) {
      s1 = "Marketing and sales are both performing well — ROAS is strong and close rate is healthy.";
    } else if (m.rangeRoas <= 1 && m.adsSpendTotal > 0) {
      s1 = `Marketing is not producing profitable sales — ROAS is below breakeven at ${m.rangeRoas.toFixed(1)}x.`;
    } else {
      s1 = `Marketing is generating returns at ${m.rangeRoas.toFixed(1)}x ROAS with a ${(m.closeRate * 100).toFixed(1)}% close rate.`;
    }

    // Sentence 2 — Margin/cost pressure
    let s2: string;
    if (cogsPct30d > 0.55) {
      s2 = `Production costs are consuming ${(cogsPct30d * 100).toFixed(0)}% of revenue, compressing margins significantly.`;
    } else if (netProfitMargin30d < 0) {
      s2 = `The business is operating at a net loss with a ${(netProfitMargin30d * 100).toFixed(1)}% margin.`;
    } else {
      s2 = `Margins are at ${(netProfitMargin30d * 100).toFixed(1)}% net profit, with COGS at ${(cogsPct30d * 100).toFixed(0)}% of revenue.`;
    }

    // Sentence 3 — Leverage (strict priority)
    let s3: string;
    if (cashCushionMonths < 1.5) {
      s3 = `The most urgent lever is cash preservation — runway is critically short at ${cashCushionMonths.toFixed(1)} months.`;
    } else if (cogsPct30d > 0.60) {
      s3 = `The biggest opportunity is reducing production costs, currently at ${(cogsPct30d * 100).toFixed(0)}% of revenue.`;
    } else if (m.closeRate < 0.05) {
      s3 = "The highest-impact lever is improving conversion — each 1% increase adds meaningful revenue.";
    } else {
      s3 = "Continue optimizing current operations to maintain momentum.";
    }

    return `${s1} ${s2} ${s3}`;
  }, [m.rangeRoas, m.adsSpendTotal, m.closeRate, costPerLead, cogsPct30d, netProfitMargin30d, cashCushionMonths]);

  /* ── Momentum directions ── */
  const revDir = trendSignals?.revenue ?? "flat";
  const closeDir = trendSignals?.closeRate ?? "flat";
  const profitDir = trendSignals ? trendSignals.revenue : "flat"; // proxy

  /* ── Action dismiss/complete state ── */
  const [completedIds, setCompletedIds] = useState<string[]>(getCompletedActions);
  const [dismissedMap, setDismissedMap] = useState<Record<string, number>>(getDismissedActions);

  const markComplete = useCallback((id: string) => {
    const next = [...completedIds, id];
    setCompletedIds(next);
    localStorage.setItem("completedActions", JSON.stringify(next));
  }, [completedIds]);

  const markDismissed = useCallback((id: string) => {
    const next = { ...dismissedMap, [id]: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    setDismissedMap(next);
    localStorage.setItem("dismissedActions", JSON.stringify(next));
  }, [dismissedMap]);

  const filteredActions = actions.filter(a => {
    const id = slugify(a.title);
    if (completedIds.includes(id)) return false;
    const expiry = dismissedMap[id];
    if (expiry && Date.now() < expiry) return false;
    return true;
  });

  const topAction = filteredActions[0] ?? null;

  /* ══════ RENDER ══════ */
  return (
    <div className="space-y-6">

      {/* ═══ SECTION 1: BUSINESS PULSE ═══ */}
      <Card className="overflow-hidden">
        <CardContent className="pt-8 pb-6 px-8 text-center space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Business Pulse</p>
          <div className="flex items-center justify-center gap-4">
            <span className={cn(
              "text-6xl font-extrabold tabular-nums",
              pulseColor === "emerald" && "text-emerald-600 dark:text-emerald-400",
              pulseColor === "amber" && "text-amber-600 dark:text-amber-400",
              pulseColor === "red" && "text-destructive",
            )}>
              {pulseScore}
            </span>
            <Badge variant="outline" className={cn(
              "text-sm px-3 py-1",
              pulseColor === "emerald" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
              pulseColor === "amber" && "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
              pulseColor === "red" && "bg-destructive/10 text-destructive border-destructive/30",
            )}>
              {pulseLabel}
            </Badge>
          </div>
          <Progress
            value={pulseScore}
            className={cn(
              "h-3 max-w-md mx-auto",
              pulseColor === "emerald" && "[&>div]:bg-emerald-500",
              pulseColor === "amber" && "[&>div]:bg-amber-500",
              pulseColor === "red" && "[&>div]:bg-destructive",
            )}
          />
          <p className="text-sm text-muted-foreground">{pulseSubtitle}</p>
          <p className="text-xs text-muted-foreground/70">
            Primary Constraint: {cashCushionMonths < 1.5 ? "Cash Runway" : cogsPct30d > 0.60 ? "Production Costs" : m.closeRate < 0.05 ? "Lead Conversion" : "Maintain Momentum"}
          </p>
        </CardContent>
      </Card>

      {/* ═══ SECTION 2: BUSINESS MOMENTUM ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Revenue", value: formatCurrency(salesRevenue30d), dir: revDir, sub: "30-day" },
          { label: "Net Profit", value: formatCurrency(netProfit30d), dir: profitDir, sub: "30-day" },
          { label: "Close Rate", value: formatPercent(m.closeRate), dir: closeDir, sub: "New leads" },
        ].map(({ label, value, dir, sub }) => (
          <Card key={label}>
            <CardContent className="pt-6 pb-5 px-6 flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className={cn("text-3xl font-bold tabular-nums", label === "Net Profit" && (netProfit30d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"))}>
                  {value}
                </p>
                <p className="text-[11px] text-muted-foreground">{sub}</p>
              </div>
              <div className={cn("flex flex-col items-center gap-0.5 pt-1", trendColor(dir))}>
                <TrendArrow direction={dir} />
                <span className="text-[10px] font-medium capitalize">{dir}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ═══ SECTION 3: CASH RUNWAY ═══ */}
      <Card>
        <CardContent className="pt-6 pb-5 px-8 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cash Runway</p>
            <span className="text-sm text-muted-foreground">{formatCurrency(cashInBank)} in bank</span>
          </div>
          <div className="flex items-end gap-3">
            <span className={cn(
              "text-4xl font-bold tabular-nums",
              cashCushionMonths >= 3 && "text-emerald-600 dark:text-emerald-400",
              cashCushionMonths >= 1 && cashCushionMonths < 3 && "text-amber-600 dark:text-amber-400",
              cashCushionMonths < 1 && "text-destructive",
            )}>
              {cashCushionMonths >= 99 ? "6+" : cashCushionMonths.toFixed(1)}
            </span>
            <span className="text-sm text-muted-foreground pb-1">months</span>
          </div>
          <Progress
            value={Math.min(cashCushionMonths / 6, 1) * 100}
            className={cn(
              "h-3",
              cashCushionMonths >= 3 && "[&>div]:bg-emerald-500",
              cashCushionMonths >= 1 && cashCushionMonths < 3 && "[&>div]:bg-amber-500",
              cashCushionMonths < 1 && "[&>div]:bg-destructive",
            )}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span>3 mo</span>
            <span>6 mo</span>
          </div>
        </CardContent>
      </Card>

      {/* ═══ SECTION 4: WATCHOUTS ═══ */}
      <Card>
        <CardContent className="pt-5 pb-4 px-8 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Watchouts</p>
          {watchouts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-1">No major watchouts today.</p>
          ) : (
            <div className="space-y-1.5">
              {watchouts.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-sm">{w.text}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ SECTION 5: BUSINESS INSIGHT ═══ */}
      <Card className="bg-muted/40">
        <CardContent className="pt-5 pb-4 px-8 space-y-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Business Insight</p>
          </div>
          <p className="text-[15px] leading-relaxed text-foreground/90">{insightNarrative}</p>
        </CardContent>
      </Card>

      {/* ═══ SECTION 6: TODAY'S PRIORITIES ═══ */}
      {(() => {
        const priorities: { icon: typeof Flame; title: string; description: string; impact: string }[] = [];
        // Priority 1 — Revenue
        if (m.closeRate < 0.05 && m.totalLeads > 50) {
          priorities.push({ icon: Flame, title: "Reactivate Dormant Leads", description: `${m.totalLeads} leads exist in the pipeline with a ${(m.closeRate * 100).toFixed(1)}% close rate.`, impact: "Moving conversion toward 5% could unlock additional revenue." });
        } else {
          priorities.push({ icon: Flame, title: "Strengthen Sales Pipeline", description: "Continue nurturing existing leads to maintain conversion.", impact: "Consistent follow-up compounds over time." });
        }
        // Priority 2 — Cost
        if (cogsPct30d > 0.60) {
          priorities.push({ icon: Settings, title: "Reduce Production Costs", description: `COGS currently consume ${(cogsPct30d * 100).toFixed(0)}% of revenue.`, impact: "Reducing toward 50–55% would significantly increase margins." });
        } else {
          priorities.push({ icon: Settings, title: "Optimize Cost Structure", description: `COGS at ${(cogsPct30d * 100).toFixed(0)}% — monitor for upward pressure.`, impact: "Maintaining cost discipline protects margins." });
        }
        // Priority 3 — Growth (always)
        priorities.push({ icon: Rocket, title: "Expand Organic Lead Flow", description: "Create or improve one SEO landing page targeting marquee sign searches.", impact: "Organic traffic lowers cost per lead over time." });

        return (
          <Card>
            <CardContent className="pt-5 pb-4 px-8 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Today's Priorities</p>
              {priorities.map(p => (
                <div key={p.title} className="flex gap-3 items-start">
                  <p.icon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="text-sm text-muted-foreground">{p.description}</p>
                    <p className="text-xs text-muted-foreground/70">Impact: {p.impact}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* ═══ SECTION 7: FOCUS TODAY ═══ */}
      <Card className="border-2 border-primary/30">
        <CardContent className="pt-6 pb-5 px-8 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Focus Today</p>
          </div>
          {topAction ? (
            <div className="space-y-2">
              <p className="text-lg font-bold">{topAction.title}</p>
              <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Reason:</span> {topAction.reason}</p>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400"><span className="text-foreground">Impact:</span> {topAction.impact}</p>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" className="text-xs h-7 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                  onClick={() => markComplete(slugify(topAction.title))}>✓ Done</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-foreground"
                  onClick={() => markDismissed(slugify(topAction.title))}>✕ Dismiss</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No urgent actions — stay the course.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
