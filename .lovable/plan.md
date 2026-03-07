

# PDF Report Download Feature

## Overview
Add a "Download Report" button next to the date picker on the Dashboard. When clicked, it generates a PDF containing a quick summary (bullet points, key metrics, mini charts) and a detailed summary with analysis and action items, all based on the selected date range. The AI-generated insights will use the existing Lovable AI integration.

## Architecture

### 1. New Edge Function: `generate-report`
- Accepts all computed metrics + trend data as input
- Calls Lovable AI (Gemini Flash) with a structured prompt to generate:
  - **Quick Summary**: 5-8 bullet points on key metrics, health indicators, and red flags
  - **Action Items**: 3-5 specific recommendations to improve business health
  - **Detailed Summary**: 2-3 paragraph analysis covering revenue, costs, profitability, and trends
- Returns the AI-generated text sections as JSON

### 2. Client-side PDF Generation
- Install `jspdf` package for PDF creation
- New component: `src/components/ReportGenerator.tsx`
  - Button in the Dashboard header area (next to the date picker)
  - On click: calls the edge function for AI insights, then builds a PDF with:
    - **Page 1 — Quick Summary**: Company name, date range, key KPI table (Revenue, Sales, AOV, ROAS, Net Profit, Profit Margin), bullet-point highlights, and a simple visual bar for cost breakdown (COGS/Ads/Overhead as % of revenue)
    - **Page 2 — Detailed Analysis**: AI-generated narrative, action items list, and cost structure breakdown table
  - Uses `jspdf` directly (no html2canvas needed — text + tables + simple shapes for charts)

### 3. Dashboard Integration
- Add a `Download` icon button next to the date range selector
- Pass current `metrics`, `trends`, `cashMetrics`, and `dateRange` to the report generator
- Show loading state while generating

## Data Flow

```text
User clicks "Download Report"
  → ReportGenerator gathers metrics (already loaded)
  → Calls generate-report edge function with metrics summary
  → Edge function calls Lovable AI for insights
  → Returns { quickSummary, detailedSummary, actionItems }
  → Client builds PDF with jspdf using metrics + AI text
  → Browser downloads PDF
```

## Technical Details

- **Package**: `jspdf` (lightweight, no DOM dependency)
- **Edge Function**: `supabase/functions/generate-report/index.ts` — uses LOVABLE_API_KEY, calls Gemini Flash
- **PDF Layout**: Letter size, 2 pages max, clean typography with section headers, tables for metrics, and bullet lists for insights
- **Config**: Add `[functions.generate-report]` with `verify_jwt = false` to config.toml

## Files Changed
1. `supabase/functions/generate-report/index.ts` — new edge function
2. `src/components/ReportGenerator.tsx` — new component (button + PDF builder)
3. `src/pages/Dashboard.tsx` — add Download Report button + import ReportGenerator
4. Install `jspdf` package

