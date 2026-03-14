

## Redesign CeoMorningBrief — Visual Executive Pulse

### Overview
Complete rewrite of the render section (lines 354-876). All calculation logic (lines 1-352) stays untouched. The 12+ cards collapse into 5 ultra-scannable sections.

### File: `src/components/CeoMorningBrief.tsx`

**Keep lines 1-352 exactly as-is** (types, derived metrics, opportunity alerts, action engine, trend signals).

**Add new logic before the return** (~line 353):

```typescript
// Business Pulse Score (0-100)
// Net Profit Margin: 35% weight — scale: -20% → 0pts, +20% → 100pts
// Close Rate: 25% weight — scale: 0% → 0pts, 10% → 100pts
// Cash Cushion: 25% weight — scale: 0mo → 0pts, 6mo+ → 100pts
// COGS%: 15% weight — scale: 80%+ → 0pts, 30% → 100pts (inverted)
const pulseScore = Math.round(Math.min(100, Math.max(0,
  0.35 * Math.min(100, Math.max(0, (netProfitMargin30d + 0.2) / 0.4 * 100)) +
  0.25 * Math.min(100, Math.max(0, m.closeRate / 0.10 * 100)) +
  0.25 * Math.min(100, Math.max(0, cashCushionMonths / 6 * 100)) +
  0.15 * Math.min(100, Math.max(0, (0.8 - cogsPct30d) / 0.5 * 100))
)));
const pulseLabel = pulseScore >= 70 ? "Strong" : pulseScore >= 40 ? "Watch" : "Risk";
const pulseColor = pulseScore >= 70 ? "emerald" : pulseScore >= 40 ? "amber" : "red";
const pulseSubtitle = pulseScore >= 70
  ? "Business is moving in the right direction"
  : pulseScore >= 40
  ? "Margins are compressed — monitor closely"
  : "Cash and conversion need attention";
```

**Replace entire render (lines 354-876) with 5 sections:**

#### Section 1 — Business Pulse
- Large score number (text-5xl) with label badge (Strong/Watch/Risk)
- Horizontal progress bar (`Progress` component) colored by score band
- Subtitle underneath in muted text
- Single card, visually dominant

#### Section 2 — Business Momentum
- 3-column grid of tiles: Revenue (30d), Net Profit (30d), Close Rate
- Each tile: large value + `TrendArrow` from existing `trendSignals`
- Revenue trend from `trendSignals.revenue`, close rate from `trendSignals.closeRate`
- Net profit trend: compare `netProfitMargin30d` direction (derive from revenue trend as proxy, or use "flat" if no trend data)
- Color: green if "up", amber if "flat", red if "down"

#### Section 3 — Cash Runway
- Single card with visual progress bar scaled 0-6 months
- Display `cashCushionMonths` value as "X.X months"
- Bar fill: `Math.min(cashCushionMonths / 6, 1) * 100`%
- Green ≥ 3, amber 1-3, red < 1
- Also show cash in bank value as secondary text

#### Section 4 — Watchouts
- Max 2 items from a filtered rules list (reuse existing thresholds):
  - `m.closeRate < 0.05` → "Close rate below target"
  - `cogsPct30d > 0.50` → "COGS above target"
  - `cashCushionMonths < 3` → "Cash runway tight"
  - `shopifyCapPaid30d > 0` → "Shopify Capital drag active"
- Show `AlertTriangle` icon per item, one line each
- If none triggered: "No major watchouts today." in muted text
- Slice to max 2

#### Section 5 — Focus Today
- Single card with accent border
- Show only `actions[0]` (top priority from existing action engine)
- Title in bold, one-line reason, one-line impact
- If no actions: "No urgent actions — stay the course."

**Remove from render:** Owner Target Simulator, Cash Position detail, Cash Forecast chart, Manufacturing Liability, Margin Watch, Sales Engine Status, Marketing Engine Health (cost/revenue/contribution per lead), Next 3 Sales Impact, 30-Day P&L Summary, Owner Income Tracker, Opportunity Alerts card, multiple action cards, Trend Signals card. Collapse/expand toggle also removed (brief is always short enough).

**Remove unused imports:** `Input`, `ChartContainer`, `LineChart`, `Line`, `XAxis`, `YAxis`, `ReferenceLine`, `Tooltip`, `Lightbulb`, `Factory`, `ShoppingCart`, `Megaphone`, `ArrowRight`, `ChevronDown`, `ChevronUp`, `PrecisionBadge`, `SectionHeader`. Keep `Progress` (add import).

### File: `src/pages/MorningBrief.tsx`
- Change subtitle to "Executive summary — what matters today"

### No changes to:
- `ReportGenerator.tsx` (PDF keeps full detail)
- `generate-report/index.ts` (AI prompt keeps all metrics)
- Any calculation logic

