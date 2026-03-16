

## Enhance CeoMorningBrief — Motivational Updates + Today's Priorities

### File: `src/components/CeoMorningBrief.tsx`

---

### 1. Update Pulse Label (line 210)

Change threshold from `>= 40` to `>= 45`, and `"Risk"` to `"Needs Attention"`:

```typescript
const pulseLabel = pulseScore >= 70 ? "Strong" : pulseScore >= 45 ? "Watch" : "Needs Attention";
```

Also update `pulseColor` to use `>= 45` instead of `>= 40`.

---

### 2. Add Primary Constraint (after line 333)

Insert a small muted line below the pulse subtitle, inside the existing pulse card:

```jsx
<p className="text-xs text-muted-foreground/70">
  Primary Constraint: {primaryConstraint}
</p>
```

Derive `primaryConstraint` using strict priority:
1. `cashCushionMonths < 1.5` → "Cash Runway"
2. `cogsPct30d > 0.60` → "Production Costs"
3. `closeRate < 0.05` → "Lead Conversion"
4. Fallback → "Maintain Momentum"

---

### 3. Add "Today's Priorities" Section (between Business Insight and Focus Today)

Insert a new card section with 3 stacked priority rows.

**Import** `Flame, Settings, Rocket` from `lucide-react` (for 🔥⚙🚀 equivalents).

**Priority logic (using existing metrics):**

| # | Condition | Title | Description | Impact |
|---|-----------|-------|-------------|--------|
| 1 | `closeRate < 0.05 && totalLeads > 50` | Reactivate Dormant Leads | "{totalLeads} leads exist with {closeRate}% close rate." | "Moving conversion toward 5% could unlock additional revenue." |
| 1 fallback | always | Strengthen Sales Pipeline | "Continue nurturing existing leads to maintain conversion." | "Consistent follow-up compounds over time." |
| 2 | `cogsPct30d > 0.60` | Reduce Production Costs | "COGS currently consume {cogsPct}% of revenue." | "Reducing toward 50–55% would significantly increase margins." |
| 2 fallback | always | Optimize Cost Structure | "COGS at {cogsPct}% — monitor for upward pressure." | "Maintaining cost discipline protects margins." |
| 3 | always | Expand Organic Lead Flow | "Create or improve one SEO landing page targeting marquee sign searches." | "Organic traffic lowers cost per lead over time." |

**Card design:**
```jsx
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
```

---

### 4. No Changes To

- Calculation logic or metrics
- Insight narrative
- localStorage dismiss system
- Focus Today section (remains as final section)
- Any other existing sections

### Section Order After Changes

1. Business Pulse (with primary constraint)
2. Business Momentum
3. Cash Runway
4. Watchouts
5. Business Insight
6. **Today's Priorities** ← new
7. Focus Today

