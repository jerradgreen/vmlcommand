import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "@/hooks/useDashboardMetrics";
import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear, format } from "date-fns";

const STYLE_BUCKETS = [
  "3D Layered Logo Sign",
  "Wall Hanging Letters",
  "Mobile Vendors",
  "Event Style Letters",
  "Rental Inventory Package",
  "Zaxby's",
  "Misc",
  "Unknown",
] as const;

/** Only these buckets are shown in the performance chart, in display order */
const DISPLAY_STYLES: StyleBucket[] = [
  "3D Layered Logo Sign",
  "Wall Hanging Letters",
  "Mobile Vendors",
  "Event Style Letters",
  "Rental Inventory Package",
];

export type StyleBucket = (typeof STYLE_BUCKETS)[number];

// Order matters — first match wins. Exact-ish checks (zaxby, misc) come before broad keywords.
const STYLE_KEYWORDS: [StyleBucket, string[]][] = [
  ["Zaxby's", ["zaxby"]],
  ["Misc", ["misc"]],
  ["Rental Inventory Package", ["rental", "package"]],
  ["Event Style Letters", ["event"]],
  ["3D Layered Logo Sign", ["layered", "logo", "3d"]],
  ["Wall Hanging Letters", ["wall", "hanging"]],
  ["Mobile Vendors", ["mobile", "vendor"]],
];

function normalizeStyle(signStyle: string | null | undefined, cognitoForm?: string | null, phraseText?: string | null): StyleBucket {
  // Try sign_style first
  if (signStyle && signStyle.trim()) {
    const lower = signStyle.toLowerCase();
    for (const [bucket, keywords] of STYLE_KEYWORDS) {
      if (keywords.some((kw) => lower.includes(kw))) return bucket;
    }
  }
  // Fall back to cognito_form name
  if (cognitoForm && cognitoForm.trim()) {
    const lower = cognitoForm.toLowerCase();
    for (const [bucket, keywords] of STYLE_KEYWORDS) {
      if (keywords.some((kw) => lower.includes(kw))) return bucket;
    }
  }
  // Fall back to raw_payload phrase/message text (no "marquee" in STYLE_KEYWORDS so it stays Unknown)
  if (phraseText && phraseText.trim()) {
    const lower = phraseText.toLowerCase();
    // Special case: marquee + rental co-occurrence → Rental
    if (lower.includes("marquee") && (lower.includes("rental") || lower.includes("package"))) {
      return "Rental Inventory Package";
    }
    for (const [bucket, keywords] of STYLE_KEYWORDS) {
      if (keywords.some((kw) => lower.includes(kw))) return bucket;
    }
  }
  return "Unknown";
}

export interface SignStyleRow {
  style: StyleBucket;
  leads: number;
  sales: number;
  customers: number;
  closeRate: number | null;
  revenue: number;
  revenuePerLead: number | null;
  avgSaleValue: number | null;
}

function getDateBounds(range: DateRange): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (range.preset) {
    case "all": return { from: null, to: null };
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "7d": return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30d": return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "mtd": return { from: startOfMonth(now), to: endOfDay(now) };
    case "ytd": return { from: startOfYear(now), to: endOfDay(now) };
    case "last_year": { const ly = now.getFullYear() - 1; return { from: new Date(ly, 0, 1), to: endOfDay(new Date(ly, 11, 31)) }; }
    case "12m": return { from: startOfDay(subDays(now, 364)), to: endOfDay(now) };
    case "custom": return { from: range.from ?? null, to: range.to ?? null };
    default: return { from: null, to: null };
  }
}

export function useSignStyleMetrics(range: DateRange) {
  const { from, to } = getDateBounds(range);
  const key = from ? format(from, "yyyy-MM-dd") : "all";
  const keyEnd = to ? format(to, "yyyy-MM-dd") : "all";

  return useQuery({
    queryKey: ["sign-style-metrics", key, keyEnd],
    queryFn: async () => {
      // Query leads (paginated to avoid 1000-row limit)
      const allLeads: { sign_style: string | null; cognito_form: string | null; raw_payload: any }[] = [];
      let leadsFrom = 0;
      const pageSize = 1000;
      while (true) {
        let leadsQ = supabase.from("leads").select("sign_style, cognito_form, raw_payload");
        if (from) leadsQ = leadsQ.gte("submitted_at", from.toISOString());
        if (to) leadsQ = leadsQ.lte("submitted_at", to.toISOString());
        const { data, error: leadsErr } = await leadsQ.range(leadsFrom, leadsFrom + pageSize - 1);
        if (leadsErr) throw leadsErr;
        allLeads.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
        leadsFrom += pageSize;
      }

      // Query sales (paginated)
      const allSales: { sign_style: string | null; revenue: number | null; email: string | null; lead_id: string | null }[] = [];
      let salesFrom = 0;
      while (true) {
        let salesQ = supabase.from("sales").select("sign_style, revenue, email, lead_id");
        if (from) salesQ = salesQ.gte("date", format(from, "yyyy-MM-dd"));
        if (to) salesQ = salesQ.lte("date", format(to, "yyyy-MM-dd"));
        const { data, error: salesErr } = await salesQ.range(salesFrom, salesFrom + pageSize - 1);
        if (salesErr) throw salesErr;
        allSales.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
        salesFrom += pageSize;
      }

      // Aggregate leads by bucket
      const leadCounts: Record<StyleBucket, number> = {} as any;
      for (const b of STYLE_BUCKETS) leadCounts[b] = 0;
      for (const row of allLeads) {
        const phraseText = [
          row.raw_payload?.["What word(s) will you spell? Or numbers?"],
          row.raw_payload?.["Message-Anything else?"],
        ].filter(Boolean).join(" ");
        leadCounts[normalizeStyle(row.sign_style, row.cognito_form, phraseText || null)]++;
      }

      // Aggregate sales by bucket
      const saleCounts: Record<StyleBucket, number> = {} as any;
      const saleRevenue: Record<StyleBucket, number> = {} as any;
      const customerSets: Record<StyleBucket, Set<string>> = {} as any;
      for (const b of STYLE_BUCKETS) { saleCounts[b] = 0; saleRevenue[b] = 0; customerSets[b] = new Set(); }
      for (const row of allSales) {
        const bucket = normalizeStyle(row.sign_style);
        saleCounts[bucket]++;
        saleRevenue[bucket] += Number(row.revenue) || 0;
        // Unique customer: prefer lead_id, fallback to email
        const custKey = row.lead_id ?? (row.email ? row.email.toLowerCase().trim() : null);
        if (custKey) customerSets[bucket].add(custKey);
      }

      // Build rows
      const rows: SignStyleRow[] = STYLE_BUCKETS.map((style) => {
        const leads = leadCounts[style];
        const sales = saleCounts[style];
        const customers = customerSets[style].size;
        const revenue = saleRevenue[style];
        return {
          style,
          leads,
          sales,
          customers,
          closeRate: leads > 0 ? customers / leads : null,
          revenue,
          revenuePerLead: leads > 0 ? revenue / leads : null,
          avgSaleValue: sales > 0 ? revenue / sales : null,
        };
      });

      // Sort by revenue desc
      return rows;
    },
  });
}
