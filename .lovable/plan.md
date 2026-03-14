

## Add Business Insight Section with Refined Narrative Logic

### Single file: `src/components/CeoMorningBrief.tsx`

**1. Import** `Lightbulb` from `lucide-react` (line 7).

**2. Add `costPerLead` variable** after existing derived metrics (~line 105):
```typescript
const costPerLead = m.totalLeads > 0 ? m.adsSpendTotal / m.totalLeads : 0;
```

**3. Add `insightNarrative` useMemo** (~after watchouts memo):

**Sentence 1 — Marketing + Conversion context:**
- If `rangeRoas > 5 && costPerLead < 50 && closeRate < 0.05` → "Marketing is generating leads efficiently at $X per lead with strong ROAS, but the close rate of X% suggests much of that demand is not yet converting."
- If `rangeRoas > 5 && closeRate >= 0.05` → "Marketing and sales are both performing well — ROAS is strong and close rate is healthy."
- If `rangeRoas <= 1 && adsSpendTotal > 0` → "Marketing is not producing profitable sales — ROAS is below breakeven at Xx."
- Else (middle ground) → "Marketing is generating returns at Xx ROAS with a X% close rate."

**Sentence 2 — Margin/cost pressure:**
- If `cogsPct30d > 0.55` → "Production costs are consuming X% of revenue, compressing margins significantly."
- If `netProfitMargin30d < 0` → "The business is operating at a net loss with a X% margin."
- Else → "Margins are at X% net profit, with COGS at X% of revenue."

**Sentence 3 — Leverage (strict priority order):**
1. `cashCushionMonths < 1.5` → "The most urgent lever is cash preservation — runway is critically short at X months."
2. `cogsPct30d > 0.60` → "The biggest opportunity is reducing production costs, currently at X% of revenue."
3. `closeRate < 0.05` → "The highest-impact lever is improving conversion — each 1% increase adds meaningful revenue."
4. Fallback → "Continue optimizing current operations to maintain momentum."

Only one lever chosen per the priority chain.

**4. Insert card between Watchouts and Focus Today** (~line 333):
```jsx
<Card className="bg-muted/40">
  <CardContent className="pt-5 pb-4 px-8 space-y-2">
    <div className="flex items-center gap-2">
      <Lightbulb className="h-5 w-5 text-amber-500" />
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Business Insight</p>
    </div>
    <p className="text-[15px] leading-relaxed text-foreground/90">{insightNarrative}</p>
  </CardContent>
</Card>
```

No changes to any existing calculations, UI sections, or layout.

