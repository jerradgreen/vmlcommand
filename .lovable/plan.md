

## Plan: Allocate Wire Transfer to VML18410 & VML18412

### The Math

| | VML18412 | VML18410 |
|---|---|---|
| Revenue | $3,720 | $8,000 |
| Manufacturing cost | $1,458 | — |
| Wire allocation | $1,458 | $2,155 ($3,613 − $1,458) |
| Remaining est. COGS | $0 (fully paid) | $600 (4 unpaid units) |
| Total est. COGS | $1,458 | $2,755 ($2,155 + $600) |
| New `estimated_cogs_pct` | 0.392 ($1,458/$3,720) | 0.3444 ($2,755/$8,000) |
| New `manufacturing_status` | `paid` | `unpaid` (still has $600 outstanding) |

### Data Operations (no code changes needed)

1. **Insert two `cogs_allocations` rows** linking the wire transfer (`87bb8072...`) to each sale with the correct amounts ($1,458 and $2,155).

2. **Update `estimated_cogs_pct`** on both sales so the estimated totals reflect reality instead of the default 50%.

3. **Update `manufacturing_status`** on VML18412 to `paid`. Leave VML18410 as `unpaid` since $600 remains.

### Note on 70% Auto-Clear Rule
VML18410's allocation ($2,155) is ~78% of its estimated COGS ($2,755), which would normally trigger the auto-clear to "paid." I'll keep it as `unpaid` since you specifically want $600 to remain outstanding. If the COGS Reconciliation page auto-clears it later, we can adjust the threshold or override it.

