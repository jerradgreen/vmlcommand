import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear, format, addDays } from "date-fns";

export type DatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "mtd" | "ytd" | "custom";

export interface DateRange {
  preset: DatePreset;
  from?: Date;
  to?: Date;
}

function getDateBounds(range: DateRange): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (range.preset) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "mtd":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "ytd":
      return { from: startOfYear(now), to: endOfDay(now) };
    case "custom":
      return { from: range.from ?? null, to: range.to ?? null };
    default:
      return { from: null, to: null };
  }
}

export function useDashboardMetrics(range: DateRange) {
  const { from, to } = getDateBounds(range);
  const key = from ? format(from, "yyyy-MM-dd") : "all";
  const keyEnd = to ? format(to, "yyyy-MM-dd") : "all";

  return useQuery({
    queryKey: ["dashboard-metrics", key, keyEnd],
    queryFn: async () => {
      let leadsCountQuery = supabase.from("leads").select("id", { count: "exact", head: true });
      let salesQuery = supabase.from("sales").select("id, revenue, sale_type, match_method, lead_id, date");
      const earliestQuery = supabase.from("sales").select("date").order("date", { ascending: true }).limit(1);

      if (from) {
        leadsCountQuery = leadsCountQuery.gte("submitted_at", from.toISOString());
        salesQuery = salesQuery.gte("date", format(from, "yyyy-MM-dd"));
      }
      if (to) {
        leadsCountQuery = leadsCountQuery.lte("submitted_at", to.toISOString());
        salesQuery = salesQuery.lte("date", format(to, "yyyy-MM-dd"));
      }

      // Date range for ad spend / bills / cogs — use selected range, fallback to MTD
      const now = new Date();
      const mtdFrom = format(startOfMonth(now), "yyyy-MM-dd");
      const mtdTo = format(now, "yyyy-MM-dd");
      const yesterdayStr = format(subDays(now, 1), "yyyy-MM-dd");
      const todayStr = format(now, "yyyy-MM-dd");
      const next7Str = format(addDays(now, 7), "yyyy-MM-dd");

      // For ad spend section: use selected range if set, otherwise MTD
      const rangeFrom = from ? format(from, "yyyy-MM-dd") : mtdFrom;
      const rangeTo = to ? format(to, "yyyy-MM-dd") : mtdTo;

      const [
        leadsRes, salesRes, earliestRes,
        yesterdayExpRes, rangeExpRes, rangeSalesRevRes,
        rangeBillsPaidRes, rangeCogsPaidRes,
        next7BillsRes, next7CogsRes,
      ] = await Promise.all([
        leadsCountQuery,
        salesQuery,
        earliestQuery,
        supabase.from("expenses").select("amount").eq("category", "ads").eq("date", yesterdayStr),
        supabase.from("expenses").select("amount").eq("category", "ads").gte("date", rangeFrom).lte("date", rangeTo),
        supabase.from("sales").select("revenue").gte("date", rangeFrom).lte("date", rangeTo),
        // Bills paid in range
        supabase.from("bills").select("amount").eq("status", "paid").gte("date", rangeFrom).lte("date", rangeTo),
        // COGS paid in range
        supabase.from("cogs_payments").select("amount").eq("status", "paid").gte("date", rangeFrom).lte("date", rangeTo),
        // Next 7 days bills due (always absolute)
        supabase.from("bills").select("amount").in("status", ["due", "scheduled"]).gte("due_date", todayStr).lte("due_date", next7Str),
        // Next 7 days COGS due (always absolute)
        supabase.from("cogs_payments").select("amount").in("status", ["due", "scheduled"]).gte("due_date", todayStr).lte("due_date", next7Str),
      ]);

      const sales = salesRes.data ?? [];
      const totalLeads = leadsRes.count ?? 0;
      const totalSales = sales.length;
      const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);

      const newLeadSales = sales.filter((s) => s.sale_type === "new_lead");
      const repeatDirectSales = sales.filter((s) => s.sale_type === "repeat_direct");
      const unmatchedSales = sales.filter((s) => s.sale_type === "unknown" && !s.lead_id);

      const nonRepeatSales = sales.filter((s) => s.sale_type !== "repeat_direct");
      const closeRate = totalLeads > 0 ? nonRepeatSales.length / totalLeads : 0;

      const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
      const newLeadRevenue = newLeadSales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);
      const repeatDirectRevenue = repeatDirectSales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);
      const earliestDate = earliestRes.data?.[0]?.date ?? null;

      const yesterdayAdSpend = (yesterdayExpRes.data ?? []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const rangeAdSpend = (rangeExpRes.data ?? []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const rangeRevenue = (rangeSalesRevRes.data ?? []).reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);
      const rangeRoas = rangeAdSpend > 0 ? rangeRevenue / rangeAdSpend : 0;
      const netAfterAds = rangeRevenue - rangeAdSpend;

      const rangeBillsPaid = (rangeBillsPaidRes.data ?? []).reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      const rangeCogsPaid = (rangeCogsPaidRes.data ?? []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      const next7BillsDue = (next7BillsRes.data ?? []).reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      const next7CogsDue = (next7CogsRes.data ?? []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      const rangeNetAfterAdsAndBills = rangeRevenue - rangeAdSpend - rangeBillsPaid;
      const rangeProfitProxy = rangeRevenue - rangeAdSpend - rangeBillsPaid - rangeCogsPaid;

      return {
        earliestDate,
        totalRevenue,
        totalLeads,
        totalSales,
        closeRate,
        avgOrderValue,
        newLeadRevenue,
        repeatDirectRevenue,
        unmatchedCount: unmatchedSales.length,
        yesterdayAdSpend,
        mtdAdSpend: rangeAdSpend,
        mtdRevenue: rangeRevenue,
        mtdRoas: rangeRoas,
        netAfterAds,
        mtdBillsPaid: rangeBillsPaid,
        mtdCogsPaid: rangeCogsPaid,
        next7BillsDue,
        next7CogsDue,
        mtdNetAfterAdsAndBills: rangeNetAfterAdsAndBills,
        mtdProfitProxy: rangeProfitProxy,
      };
    },
  });
}

export function useTrendData(range: DateRange) {
  const { from, to } = getDateBounds(range);
  const trendFrom = from ?? subDays(new Date(), 30);
  const trendTo = to ?? new Date();
  const days = Math.ceil((trendTo.getTime() - trendFrom.getTime()) / (1000 * 60 * 60 * 24));

  return useQuery({
    queryKey: ["trend-data", format(trendFrom, "yyyy-MM-dd"), format(trendTo, "yyyy-MM-dd")],
    queryFn: async () => {
      const [leadsRes, salesRes] = await Promise.all([
        supabase
          .from("leads")
          .select("submitted_at")
          .gte("submitted_at", trendFrom.toISOString())
          .lte("submitted_at", trendTo.toISOString())
          .order("submitted_at"),
        supabase
          .from("sales")
          .select("date, revenue")
          .gte("date", format(trendFrom, "yyyy-MM-dd"))
          .lte("date", format(trendTo, "yyyy-MM-dd"))
          .order("date"),
      ]);

      const leads = leadsRes.data ?? [];
      const sales = salesRes.data ?? [];

      const dayMap: Record<string, { date: string; leads: number; sales: number; revenue: number }> = {};
      for (let i = 0; i <= days; i++) {
        const d = format(subDays(trendTo, days - i), "yyyy-MM-dd");
        dayMap[d] = { date: d, leads: 0, sales: 0, revenue: 0 };
      }

      leads.forEach((l) => {
        if (l.submitted_at) {
          const d = format(new Date(l.submitted_at), "yyyy-MM-dd");
          if (dayMap[d]) dayMap[d].leads++;
        }
      });

      sales.forEach((s) => {
        if (s.date) {
          const d = typeof s.date === "string" ? s.date : format(new Date(s.date), "yyyy-MM-dd");
          if (dayMap[d]) {
            dayMap[d].sales++;
            dayMap[d].revenue += Number(s.revenue) || 0;
          }
        }
      });

      return Object.values(dayMap);
    },
  });
}
