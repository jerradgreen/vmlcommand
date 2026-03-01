import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  TrendingUp, DollarSign, ShoppingCart, Percent, Calculator, Landmark,
  Users, Phone, Wallet, BarChart3, Target,
} from "lucide-react";

export interface ProjectionDefaults {
  leadsPerMonth: number;
  closeRatePct: number;
  aov: number;
  adSpendPerMonth: number;
  cogsPct: number;
  overheadPerMonth: number;
  remittancePct: number;
  hasActiveLoan: boolean;
}

function CurrencyInput({ value, onChange, id }: { value: number; onChange: (v: number) => void; id: string }) {
  const [raw, setRaw] = useState(value.toFixed(2));
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
      <Input
        id={id}
        className="pl-7 font-mono"
        value={raw}
        onChange={(e) => { setRaw(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n); }}
        onBlur={() => setRaw(value.toFixed(2))}
      />
    </div>
  );
}

function PctInput({ value, onChange, id }: { value: number; onChange: (v: number) => void; id: string }) {
  const [raw, setRaw] = useState((value * 100).toFixed(2));
  return (
    <div className="relative">
      <Input
        id={id}
        className="pr-7 font-mono"
        value={raw}
        onChange={(e) => { setRaw(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n / 100); }}
        onBlur={() => setRaw((value * 100).toFixed(2))}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
    </div>
  );
}

function OutputCard({ title, value, icon: Icon, colorClass }: {
  title: string; value: string; icon: React.ElementType; colorClass?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", colorClass)}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function ProjectionSandbox({ defaults }: { defaults: ProjectionDefaults }) {
  /* ── Inputs ── */
  const [leadsPerMonth, setLeadsPerMonth] = useState(defaults.leadsPerMonth);
  const [closeRate, setCloseRate] = useState(defaults.closeRatePct);
  const [aov, setAov] = useState(defaults.aov);
  const [adSpend, setAdSpend] = useState(defaults.adSpendPerMonth);
  const [cogsPct, setCogsPct] = useState(defaults.cogsPct);
  const [overhead, setOverhead] = useState(defaults.overheadPerMonth);
  const [remittancePct, setRemittancePct] = useState(defaults.remittancePct);
  const [useCloser, setUseCloser] = useState(false);
  const [costPerCall, setCostPerCall] = useState(0);
  const [commissionPct, setCommissionPct] = useState(0);

  /* ── Calculations ── */
  const calc = useMemo(() => {
    const sales = leadsPerMonth * closeRate;
    const revenue = sales * aov;
    const cogs = revenue * cogsPct;
    const loanRemittance = defaults.hasActiveLoan ? revenue * remittancePct : 0;
    const commission = useCloser ? revenue * commissionPct : 0;
    const callCost = useCloser ? leadsPerMonth * costPerCall : 0;
    const closerCost = commission + callCost;

    const netProfit = revenue - cogs - adSpend - overhead - loanRemittance - closerCost;
    const netMargin = revenue > 0 ? netProfit / revenue : 0;
    const profitPerSale = sales > 0 ? netProfit / sales : 0;

    // Break-even close rate: solve for cr where net = 0
    // net = (leads * cr * aov) - (leads * cr * aov * cogsPct) - adSpend - overhead - (leads * cr * aov * remPct) - closerCosts
    // closerCosts when closer enabled = (leads * cr * aov * commPct) + (leads * costPerCall)
    // Without closer: net = leads*cr*aov*(1 - cogsPct - remPct) - adSpend - overhead = 0
    // cr = (adSpend + overhead) / (leads * aov * (1 - cogsPct - remPct))
    // With closer: net = leads*cr*aov*(1 - cogsPct - remPct - commPct) - leads*costPerCall - adSpend - overhead = 0
    // cr = (adSpend + overhead + leads*costPerCall) / (leads * aov * (1 - cogsPct - remPct - commPct))
    const effectiveRemPct = defaults.hasActiveLoan ? remittancePct : 0;
    let breakEvenCr: number | null = null;
    if (useCloser) {
      const denom = leadsPerMonth * aov * (1 - cogsPct - effectiveRemPct - commissionPct);
      if (denom > 0) breakEvenCr = (adSpend + overhead + leadsPerMonth * costPerCall) / denom;
    } else {
      const denom = leadsPerMonth * aov * (1 - cogsPct - effectiveRemPct);
      if (denom > 0) breakEvenCr = (adSpend + overhead) / denom;
    }

    return { sales, revenue, cogs, loanRemittance, closerCost, netProfit, netMargin, profitPerSale, breakEvenCr };
  }, [leadsPerMonth, closeRate, aov, adSpend, cogsPct, overhead, remittancePct, useCloser, costPerCall, commissionPct, defaults.hasActiveLoan]);

  const profitColor = calc.netProfit < 0
    ? "text-destructive"
    : calc.netMargin < 0.10
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-emerald-600 dark:text-emerald-400";

  const marginColor = calc.netMargin < 0
    ? "text-destructive"
    : calc.netMargin < 0.10
      ? "text-yellow-600 dark:text-yellow-400"
      : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <h2 className="text-lg font-semibold">Projections / Scenario Sandbox</h2>
        <p className="text-sm text-muted-foreground">"If I change the levers, what happens?"</p>
      </div>

      {/* ── INPUT CONTROLS ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Input Controls</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Leads */}
            <div className="space-y-2">
              <Label htmlFor="proj-leads" className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Leads Per Month</Label>
              <Input id="proj-leads" type="number" className="font-mono" value={leadsPerMonth} onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) setLeadsPerMonth(n); }} />
            </div>

            {/* Close Rate */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Target className="h-3.5 w-3.5" /> Close Rate: {(closeRate * 100).toFixed(1)}%</Label>
              <Slider min={0} max={15} step={0.1} value={[(closeRate * 100)]} onValueChange={([v]) => setCloseRate(v / 100)} />
            </div>

            {/* AOV */}
            <div className="space-y-2">
              <Label htmlFor="proj-aov" className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5" /> Average Order Value</Label>
              <CurrencyInput id="proj-aov" value={aov} onChange={setAov} />
            </div>

            {/* Ad Spend */}
            <div className="space-y-2">
              <Label htmlFor="proj-ads" className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Ad Spend Per Month</Label>
              <CurrencyInput id="proj-ads" value={adSpend} onChange={setAdSpend} />
            </div>

            {/* COGS % */}
            <div className="space-y-2">
              <Label htmlFor="proj-cogs" className="flex items-center gap-2"><Percent className="h-3.5 w-3.5" /> Estimated COGS %</Label>
              <PctInput id="proj-cogs" value={cogsPct} onChange={setCogsPct} />
            </div>

            {/* Overhead */}
            <div className="space-y-2">
              <Label htmlFor="proj-oh" className="flex items-center gap-2"><Calculator className="h-3.5 w-3.5" /> Overhead Per Month</Label>
              <CurrencyInput id="proj-oh" value={overhead} onChange={setOverhead} />
            </div>

            {/* Shopify Capital Remittance */}
            {defaults.hasActiveLoan && (
              <div className="space-y-2">
                <Label htmlFor="proj-rem" className="flex items-center gap-2"><Landmark className="h-3.5 w-3.5" /> Shopify Capital Remittance %</Label>
                <PctInput id="proj-rem" value={remittancePct} onChange={setRemittancePct} />
              </div>
            )}
          </div>

          {/* Closer Toggle */}
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={useCloser} onCheckedChange={setUseCloser} id="proj-closer" />
              <Label htmlFor="proj-closer" className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> Use Closer</Label>
            </div>
            {useCloser && (
              <div className="grid gap-6 md:grid-cols-2 pl-4 border-l-2 border-muted">
                <div className="space-y-2">
                  <Label htmlFor="proj-callcost">Cost per Qualified Call</Label>
                  <CurrencyInput id="proj-callcost" value={costPerCall} onChange={setCostPerCall} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proj-comm">Commission % per Sale</Label>
                  <PctInput id="proj-comm" value={commissionPct} onChange={setCommissionPct} />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── OUTPUT CARDS ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <OutputCard title="Projected Sales (Monthly)" value={calc.sales.toFixed(1)} icon={ShoppingCart} />
        <OutputCard title="Revenue (Monthly)" value={formatCurrency(calc.revenue)} icon={DollarSign} />
        <OutputCard title="Revenue (Annual)" value={formatCurrency(calc.revenue * 12)} icon={DollarSign} />
        <OutputCard title="Net Profit (Monthly)" value={formatCurrency(calc.netProfit)} icon={Wallet} colorClass={profitColor} />
        <OutputCard title="Net Profit (Annual)" value={formatCurrency(calc.netProfit * 12)} icon={Wallet} colorClass={profitColor} />
        <OutputCard title="Net Margin %" value={formatPercent(calc.netMargin)} icon={Percent} colorClass={marginColor} />
        <OutputCard title="Profit Per Sale" value={formatCurrency(calc.profitPerSale)} icon={TrendingUp} colorClass={profitColor} />
        {defaults.hasActiveLoan && (
          <OutputCard title="Loan Remittance (Monthly)" value={formatCurrency(calc.loanRemittance)} icon={Landmark} />
        )}
        {useCloser && (
          <OutputCard title="Closer Cost (Monthly)" value={formatCurrency(calc.closerCost)} icon={Phone} />
        )}
      </div>

      {/* ── BREAK-EVEN ── */}
      {calc.breakEvenCr != null && calc.breakEvenCr >= 0 && calc.breakEvenCr <= 1 && (
        <Card className={cn(
          "border-2",
          closeRate >= calc.breakEvenCr
            ? "border-emerald-500/50 bg-emerald-500/5 dark:border-emerald-400/40 dark:bg-emerald-400/5"
            : "border-destructive/50 bg-destructive/5",
        )}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Break-Even Close Rate</p>
            <p className="text-2xl font-bold mt-1">{(calc.breakEvenCr * 100).toFixed(2)}%</p>
            <p className="text-sm text-muted-foreground mt-2">
              You must close <span className="font-semibold">{(calc.breakEvenCr * 100).toFixed(2)}%</span> of leads to break even.
              {closeRate >= calc.breakEvenCr
                ? " ✅ Your current rate is above break-even."
                : " ⚠️ Your current rate is below break-even."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
