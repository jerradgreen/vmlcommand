

## CEO Morning Brief — Corrections for Phase 1

### 1. Revenue Pipeline Coverage (Revised Formula)

**Problem**: `newLeadSalesCount × closeRate × avgOrderValue` double-counts conversion — `newLeadSalesCount` already IS the converted leads, so multiplying by `closeRate` again is wrong.

**Fix**: Use **unconverted leads** as the pipeline:

```
Pipeline Leads = totalLeads − newLeadSalesCount
Expected Pipeline Revenue = Pipeline Leads × closeRate × avgOrderValue
Revenue Target = ownerTarget / profitMarginPctRunRate
Coverage % = Expected Pipeline Revenue / Revenue Target
```

This represents leads that entered the funnel but haven't converted yet, multiplied by the historical close rate. Label: **"Approximate — based on unconverted leads × historical close rate × AOV"**.

If `totalLeads − newLeadSalesCount` is zero or negative, show "No open pipeline leads detected" with a muted state.

---

### 2. Manufacturing Liability Tracker (Revised Focus)

**Problem**: Current plan shows allocation progress. User wants **cash-production pressure** — are customer deposits covering manufacturing obligations?

**Available data**:
- `accruedMfgRemaining` — outstanding manufacturing cost not yet paid (this is "Total Manufacturing Owed")
- `allocatedMfgTotal` — total mfg cost allocated to orders (estimated cost basis)
- `depositRevenue` — bank deposits from customers (but this is ALL deposits, not per-open-order)
- No per-order "deposit received" field exists in the schema

**Fix**: Use `depositRevenue` (total customer deposits in range) as a proxy for cash received against production, and `accruedMfgRemaining` as the outstanding liability.

Display:
- **Total Manufacturing Owed**: `accruedMfgRemaining`
- **Customer Deposits Received** (proxy): `depositRevenue` — labeled as "Total deposits, not order-specific"
- **Production Coverage Ratio**: `depositRevenue / (depositRevenue + accruedMfgRemaining)` — what portion of total production cost is already funded by collected revenue
- Green (>80%) / Yellow (50-80%) / Red (<50%)

Label the entire section: **"Approximate — uses total deposits as proxy; per-order deposit tracking not yet available"**

Small formula text: `Coverage = Total Deposits ÷ (Total Deposits + Unpaid Mfg Cost)`

---

### Everything Else

No changes to the other 10 sections — they remain as previously approved.

### Files to create/modify
- **New**: `src/components/CeoMorningBrief.tsx` — full component with all 12 sections including these corrections
- **Modified**: `src/pages/Dashboard.tsx` — import and render at top of dashboard

