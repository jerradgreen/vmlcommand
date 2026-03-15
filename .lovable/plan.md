

## Add Dismiss & Completion System for Actions

### File: `src/components/CeoMorningBrief.tsx`

**Action ID**: Each action already has a unique `title` — use that as the stable key (kebab-cased via simple slug function).

**New logic before `topAction` derivation (~line 254):**

1. Define two localStorage helpers:
   - `getCompletedActions(): string[]` — reads `completedActions` from localStorage
   - `getDismissedActions(): Record<string, number>` — reads `dismissedActions` (map of id → expiry timestamp), prunes expired entries
   - `markComplete(id: string)` — adds to completedActions, persists
   - `markDismissed(id: string)` — adds to dismissedActions with `Date.now() + 30 days`, persists

2. Add `useState` for `completedIds` and `dismissedMap` (initialized from localStorage). This ensures re-renders when user clicks buttons.

3. Filter `actions` array before picking `topAction`:
   ```
   const filteredActions = actions.filter(a => {
     const id = slugify(a.title);
     if (completedIds.includes(id)) return false;
     const expiry = dismissedMap[id];
     if (expiry && Date.now() < expiry) return false;
     return true;
   });
   const topAction = filteredActions[0] ?? null;
   ```

**UI change in Focus Today card (~line 392):**

Add two small buttons below the action content:
- `✓ Done` (ghost button, green text) — calls `markComplete` and updates state
- `✕ Dismiss` (ghost button, muted text) — calls `markDismissed` and updates state

Buttons are small (`text-xs`), inline, right-aligned. Only shown when `topAction` exists.

**No other files changed.** No database changes needed — localStorage only.

