

## Morning Brief Rebuild — Final Plan with 3 Adjustments

### Overview

Rebuild the Morning Brief with corrected COGS logic, multi-window data, 4-section layout, and the 3 requested adjustments applied.

---

### Data Fetching (`src/pages/MorningBrief.tsx`)

Three parallel fetches using existing hooks:

```
metrics30d  = useDashboardMetrics({ preset: "30d" })   // operational
metrics12m  = useDashboardMetrics({ preset: "12m" })   // baseline assumptions
metricsMtd  = useDashboardMetrics({ preset: "mtd" })   // owner draw progress
cashMetrics = useCashMetrics({ preset: "30d" })         // live balances + flow
trends      = useTrendData({ preset: "30d" })           // trend signals
```

Pass all three metric sets as separate props to `CeoMorningBrief`.

---

### Adjustment 1: Explicit COGS by Time Window

Define three separate COGS variables inside `CeoMorningBrief`, each using the same formula:

```
briefCogs30d = metrics30d.allocatedMfgTotal + metrics30d.accruedMfgRemaining
briefCogs12m = metrics12m.allocatedMfgTotal + metrics12m.accruedMfgRemaining
briefCogsMtd = metricsMtd.allocatedMfgTotal + metricsMtd.accruedMfgRemaining
```

Logic: `allocatedMfgTotal` = actual manufacturing allocated to sales in that window. `accruedMfgRemaining` = estimated 50% cost for unallocated sales in that window. This is exactly the per-sale COGS the user requested — no bank-feed COGS, no cumulative liability.

These are used as follows:
- `briefCogs30d` → Profitability section, Margin Watch, Opportunity Alerts, Action Engine
- `briefCogs12m` → Lead Value baseline (gross margin calculation)
- `briefCogsMtd` → Owner Income Tracker (Gross Profit This Month)

Manufacturing liability remains separate: `outstandingMfgLiability` uses `metrics12m.accruedMfgRemaining` as best proxy for cumulative.

---

### Adjustment 2: Owner Income Tracker Label Clarity

Labels will be:

| Metric | Label |
|--------|-------|
| `ownerDraw + overhead + adSpend` | **Required Gross Profit to Cover Draw + Ads + Overhead** |
| `depositRevenueMtd - briefCogsMtd` | **Gross Profit This Month** |
| `required - actual` | **Remaining Gap** |
| Status | **On Track** or **Behind Pace** |

Formula breakdown shown as footnote:
> Required = $10,000 draw + overhead run-rate + ad spend run-rate

---

### Adjustment 3: Keep Margin Watch and Next 3 Sales Impact

Both sections are preserved:

- **Margin Watch** → stays in **Business Health** section (after Manufacturing Liability), updated to use `briefCogs30d` for COGS % instead of `adjustedCogsPct`
- **Next 3 Sales Impact** → stays in **Revenue Engine** section (after Marketing Engine Health), unchanged

---

### 4-Section Layout

**BUSINESS HEALTH** (`Shield` icon)
1. Owner Target Simulator (input)
2. Owner Draw Safety (run-rate based)
3. Cash Forecast Timeline (with projection basis label)
4. Manufacturing Liability + Coverage Ratio (with approximate label)
5. Margin Watch (using `briefCogs30d`)

**REVENUE ENGINE** (`ShoppingCart` icon)
1. Sales Engine Status (Cognito leads, sales, close rate — 30d)
2. Marketing Engine Health (ROAS, CPO, ad spend — 30d)
3. Next 3 Sales Impact (preserved)

**PROFITABILITY** (`PieChart` icon)
1. Revenue (30d deposits)
2. COGS (`briefCogs30d` — actual + estimated)
3. Gross Profit, Profit Margin
4. Ad Spend, Overhead, Net Profit

**OWNER INCOME TRACKER** (`Target` icon)
1. Required Gross Profit to Cover Draw + Ads + Overhead
2. Gross Profit This Month (`depositRevenueMtd - briefCogsMtd`)
3. Remaining Gap
4. Lead Value (12m baseline: `aov12m × closeRate12m × grossMargin12m`)
5. Leads Required This Month
6. Leads Generated (30d)
7. Status badge: On Track / Behind Pace

**WHAT TO DO TODAY** (`Zap` icon) — kept as 5th group
1. Opportunity Alerts (using `briefCogs30d` for COGS triggers)
2. Action Engine / Today's Priorities
3. Trend Signals

Removed: Revenue Pipeline Coverage (redundant with Owner Income Tracker lead math), Quote Engagement Monitor placeholder.

---

### Files Modified

| File | Changes |
|------|---------|
| `src/pages/MorningBrief.tsx` | Add 12m + MTD fetches, pass 3 metric sets as props |
| `src/components/CeoMorningBrief.tsx` | New props interface (metrics30d/12m/mtd), explicit briefCogs variables, 5-section layout, Profitability section, Owner Income Tracker with clear labels, updated Opportunity Alerts + Action Engine to use briefCogs30d |

