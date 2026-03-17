import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "@/hooks/useDashboardMetrics";
import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear, format } from "date-fns";

const STYLE_BUCKETS = [
  "3D Layered Logo Sign",
  "Event Style Letters",
  "Misc",
  "Mobile Vendors",
  "Rental Inventory Package",
  "Wall Hanging Letters",
  "Zaxby's",
  "Unknown",
] as const;

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

function normalizeStyle(raw: string | null | undefined): StyleBucket {
  if (!raw || !raw.trim()) return "Unknown";
  const lower = raw.toLowerCase();
  for (const [bucket, keywords] of STYLE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return bucket;
  }
  return "Unknown";
}

export interface SignStyleRow {
  style: StyleBucket;
  leads: number;
  sales: number;
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
      const allLeads: { sign_style: string | null }[] = [];
      let leadsFrom = 0;
      const pageSize = 1000;
      while (true) {
        let leadsQ = supabase.from("leads").select("sign_style");
        if (from) leadsQ = leadsQ.gte("submitted_at", from.toISOString());
        if (to) leadsQ = leadsQ.lte("submitted_at", to.toISOString());
        const { data, error: leadsErr } = await leadsQ.range(leadsFrom, leadsFrom + pageSize - 1);
        if (leadsErr) throw leadsErr;
        allLeads.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
        leadsFrom += pageSize;
      }

      // Query sales
      let salesQ = supabase.from("sales").select("sign_style, revenue");
      if (from) salesQ = salesQ.gte("date", format(from, "yyyy-MM-dd"));
      if (to) salesQ = salesQ.lte("date", format(to, "yyyy-MM-dd"));
      const { data: salesData, error: salesErr } = await salesQ;
      if (salesErr) throw salesErr;

      // Aggregate leads by bucket
      const leadCounts: Record<StyleBucket, number> = {} as any;
      for (const b of STYLE_BUCKETS) leadCounts[b] = 0;
      for (const row of allLeads) {
        leadCounts[normalizeStyle(row.sign_style)]++;
      }

      // Aggregate sales by bucket
      const saleCounts: Record<StyleBucket, number> = {} as any;
      const saleRevenue: Record<StyleBucket, number> = {} as any;
      for (const b of STYLE_BUCKETS) { saleCounts[b] = 0; saleRevenue[b] = 0; }
      for (const row of salesData ?? []) {
        const bucket = normalizeStyle(row.sign_style);
        saleCounts[bucket]++;
        saleRevenue[bucket] += Number(row.revenue) || 0;
      }

      // Build rows
      const rows: SignStyleRow[] = STYLE_BUCKETS.map((style) => {
        const leads = leadCounts[style];
        const sales = saleCounts[style];
        const revenue = saleRevenue[style];
        return {
          style,
          leads,
          sales,
          closeRate: leads > 0 ? sales / leads : null,
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
