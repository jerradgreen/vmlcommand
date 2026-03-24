

## Plan: Sales Rep CRM with Role-Based Access

### Overview
Create a dedicated CRM page for sales reps that shows only their assigned lead styles. The rep logs in with their own account and sees nothing but the CRM — no dashboard, no sidebar, no metrics. You (the admin) control which sign styles each rep can access, starting with Rental and unlocking more over time.

### Database Changes

1. **`user_roles` table** — maps auth users to roles (`admin` or `sales_rep`)
   - Columns: `id`, `user_id` (references auth.users), `role` (enum: admin, sales_rep)
   - `has_role()` security definer function for safe RLS checks
   - Your current account gets the `admin` role automatically

2. **`rep_style_access` table** — controls which styles each rep can see
   - Columns: `id`, `user_id`, `sign_style` (text), `unlocked_at` (timestamp)
   - You add rows to grant a rep access to a style (e.g. start with "Rental Inventory Package")

3. **`rep_lead_actions` table** — tracks rep activity on leads (calls, notes, status updates)
   - Columns: `id`, `user_id`, `lead_id`, `action_type` (called, emailed, quoted, closed, lost, note), `body` (text), `created_at`

### CRM Page (`/crm`)

A clean, focused page with:
- **Lead queue**: Filterable list of leads matching the rep's unlocked styles, sorted newest first
- **Lead card/detail view**: Shows all lead info (name, email, phone, phrase, sign style, size, budget, notes, raw_payload fields, submission date)
- **Action buttons**: Log Call, Log Email, Add Note, Mark Quoted, Mark Won, Mark Lost
- **Activity timeline**: Shows the rep's past actions on each lead
- **Status filters**: New / Contacted / Quoted / Won / Lost tabs
- **Search**: By name, email, or phrase

No charts, no revenue data, no financial metrics — just leads and actions.

### Routing & Access Control

- **AuthGuard** updated to fetch the user's role after login
- **New `RepLayout` component**: Minimal layout with no sidebar — just a top bar with "VML" branding and sign-out button
- **Route structure**:
  - Sales reps → redirected to `/crm` on login, only `/crm` route accessible
  - Admin → current behavior unchanged, plus a new Settings section to manage reps
- **Login page**: After sign-in, check role → redirect to `/` (admin) or `/crm` (rep)

### Admin Controls (Settings page)

A new "Sales Reps" section in Settings:
- **Create rep account**: Email + temporary password (uses Supabase admin invite or you create accounts manually)
- **Style access manager**: Toggle which styles each rep can see
- **View rep activity**: Quick summary of calls/actions per rep

### Technical Details

- Role check uses `has_role()` security definer function (no recursive RLS)
- `rep_style_access` has RLS: reps can only read their own rows, admin can read/write all
- `rep_lead_actions` has RLS: reps can only read/write their own actions, admin can read all
- Leads table keeps existing open RLS (rep reads leads, filters client-side by their unlocked styles — or we add a server-side filter via a database function for better security)
- Rep accounts created with signups enabled temporarily or via Supabase admin API edge function

### Files to Create/Modify

- **New**: `src/pages/SalesRepCRM.tsx` — main CRM page
- **New**: `src/components/RepLayout.tsx` — minimal layout for reps
- **New**: `src/components/RepLeadCard.tsx` — lead detail + action panel
- **New**: `src/hooks/useRepRole.ts` — fetches user role, provides context
- **Modified**: `src/App.tsx` — add `/crm` route under RepLayout
- **Modified**: `src/components/AuthGuard.tsx` — role-aware redirect
- **Modified**: `src/pages/Login.tsx` — redirect based on role
- **Modified**: `src/pages/Settings.tsx` — add rep management section
- **Migration**: Create `user_roles`, `rep_style_access`, `rep_lead_actions` tables + RLS + `has_role()` function

