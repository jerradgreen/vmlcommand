

## Daily Operational Brief — Final Adjustments

Two small fixes to the approved plan before implementation:

### 1. Manufacturing Liability — Label as Approximate

Since `accruedMfgRemaining` is cumulative but `depositRevenue` comes from the 30d window, the coverage ratio mixes time horizons. Fix: add a precision badge and formula footnote:

- Badge: **"Approximate — deposits reflect last 30 days; liability is cumulative"**
- Footnote: `Coverage = 30d Deposits ÷ (30d Deposits + Total Unpaid Mfg Cost)`

No formula change — just explicit labeling so it's not misread as exact.

### 2. Cash Forecast — Add Projection Basis Label

Add a small muted label below the 30-day cash outlook chart:

> "Projection based on last 30 days average daily net cash flow"

This prevents the chart from being interpreted as a guaranteed forecast.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/MorningBrief.tsx` | Remove date selector, hardcode `{ preset: "30d" }`, simplify header |
| `src/components/CeoMorningBrief.tsx` | Full rewrite: add 3 visual groups (Business Health / Revenue Engine / What To Do Today), Opportunity Alerts section, Action Engine, precision labels for Mfg Liability and Cash Forecast, all existing sections preserved |

