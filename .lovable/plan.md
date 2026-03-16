

## Improve Conversion Priority Wording + Add Revenue Opportunity Card

### File: `src/components/CeoMorningBrief.tsx`

**1. Add derived metrics (~line 121, after existing derived metrics):**
```typescript
const targetCloseRate = 0.05;
const expectedSalesAtTarget = m.totalLeads > 0 ? Math.floor(m.totalLeads * targetCloseRate) : 0;
const additionalSalesOpportunity = Math.max(expectedSalesAtTarget - m.newLeadSalesCount, 0);
const additionalRevenueOpportunity = additionalSalesOpportunity * m.avgOrderValue;
```

**2. Update Priority 1 wording (line 436):**
Replace "Reactivate Dormant Leads" with "Improve Lead Conversion" and update description/impact text per the spec.

**3. Insert Revenue Opportunity card (between Business Insight ~line 429 and Today's Priorities ~line 431):**

New card showing:
- Header: "Revenue Opportunity"
- Subtitle line: `Current Close Rate: X% • Target Close Rate: 5%`
- Two side-by-side metrics: additional sales count + additional revenue at 5% conversion
- Uses `formatCurrency` (already imported)

No changes to existing calculations, layout sections, or dismiss system.

