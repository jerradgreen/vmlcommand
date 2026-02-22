

# VML Command Center — Phase 1 Plan (Updated)

## Overview
A CEO-level dashboard for Vintage Marquee Lights providing at-a-glance visibility into revenue, leads, sales, close rate, and trends. Built with Supabase (Lovable Cloud). Phase 1 focuses on reliable, honest KPIs backfilled from CSV uploads, with an attribution workflow that is transparent about certainty.

---

## 1. Database Setup (Supabase)

### Leads Table
- **Core fields:** lead_id (unique, built as `CF-{cognito_form}-{cognito_entry_number}`), cognito_form, cognito_entry_number, submitted_at, status, name, email, phone, phrase, sign_style, size_text, budget_text, notes, raw_payload (jsonb)
- **Computed field:** email_norm — stored as `lower(trim(email))` for reliable matching
- **Indexes:** submitted_at, email_norm

### Sales Table
- **Core fields:** order_id (unique), date, email, product_name, revenue, raw_payload (jsonb)
- **Computed field:** email_norm — stored as `lower(trim(email))`
- **Attribution fields:** lead_id (nullable FK), match_confidence (0–100), match_method (`email_exact`, `phrase_suggested`, `manual`, or null), match_reason (text explanation)
- **Sale type:** sale_type (`new_lead`, `repeat_direct`, `unknown`; defaults to `unknown` on import)
- **Indexes:** date, email_norm, lead_id

---

## 2. Data Import

### Leads Import
- Upload **multiple** Cognito Forms CSV files at once (one per sign style/form type)
- Preview parsed rows before confirming import
- Map known columns into normalized fields; store the entire original row in raw_payload
- Auto-generate lead_id as `CF-{cognito_form}-{cognito_entry_number}`
- Deduplicate on lead_id — skip rows that already exist

### Sales Import
- Upload a single sales CSV (Google Sheets export)
- Preview parsed rows before confirming
- **Skip summary/total rows** — only import rows with a non-empty order_id and valid revenue number
- Deduplicate on order_id — skip rows that already exist
- All imported sales default to sale_type = `unknown`

---

## 3. Attribution & Matching System

### Automatic Email Matching (runs on import)
- Match a sale to a lead when:
  - email_norm values match exactly
  - AND lead.submitted_at is within 60 days **before** sale.date (lead must precede the sale)
- If multiple leads qualify, pick the **most recent** lead prior to the sale date
- Auto-matched sales get: match_method = `email_exact`, appropriate confidence score, sale_type = `new_lead`

### Suggested Matches (Attribution Inbox)
- For unmatched sales, surface top candidate leads based on fuzzy phrase similarity within the 60-day window
- Each suggestion shows: match_confidence (0–100), match_reason (e.g., "phrase overlap 78%", "email match", "timing: lead 12 days before sale")

### Attribution Inbox Actions
For each unmatched sale, the user can:
1. **Confirm match** → sets lead_id, match_method, match_confidence, sale_type = `new_lead`
2. **Mark as repeat/direct** → sets sale_type = `repeat_direct`, clears lead_id
3. **Dismiss suggestions** → keeps the sale unmatched (sale_type stays `unknown`)

---

## 4. Dashboard (Homepage)

### Metric Cards (MTD)
- **Revenue MTD** — total revenue this month
- **Leads MTD** — total leads received this month
- **Sales MTD** — total number of sales this month
- **Strict Close Rate MTD** — (sales matched by exact email only) ÷ (total leads) — a baseline measure
- **Confirmed Close Rate MTD** — (new_lead sales: email_exact + manually confirmed) ÷ (total leads) — the actionable conversion metric
- **Average Order Value MTD** — revenue ÷ number of sales
- **New Lead Revenue MTD** — revenue from sales where sale_type = `new_lead`
- **Repeat/Direct Revenue MTD** — revenue from sales where sale_type = `repeat_direct`
- **Unmatched Sales Count** — clickable link to the Attribution Inbox

### Charts (simple line charts, rolling 30 days)
- Revenue trend
- Leads trend
- Sales trend

---

## 5. Leads Page
- Searchable, filterable table of all leads
- Filters: date range, cognito_form / sign_style
- Each row shows a matched/unmatched indicator (whether the lead is linked to a sale)
- Click to view full lead details

---

## 6. Sales Page
- Searchable, filterable table of all sales
- Filters: date range
- Each row shows: linked lead info, match confidence, match method, sale_type
- Click to view full sale details

---

## 7. Attribution Inbox
- Lists all unmatched sales (sale_type = `unknown`, no lead_id)
- For each sale, shows top suggested lead matches with confidence score and reason
- Action buttons: Confirm match, Mark as repeat/direct, Dismiss
- Fast workflow designed for quick decision-making

---

## 8. Design & Navigation
- Sidebar or top navigation: Dashboard, Leads, Sales, Attribution Inbox
- Clean card-based layout, clear typography, light color scheme
- Optimized for desktop (CEO on laptop/monitor), responsive as secondary concern
- Simple and functional — clarity over design complexity

---

## Out of Scope (Phase 2+)
- Ad spend APIs
- Expense automation
- Bank feed integrations
- Manufacturing cost allocation per order

