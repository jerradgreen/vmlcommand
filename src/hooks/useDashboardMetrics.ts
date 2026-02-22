import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subDays, format } from "date-fns";

export function useDashboardMetrics() {
  const now = new Date();
  const mtdStart = startOfMonth(now);
  const mtdEnd = endOfMonth(now);

  return useQuery({
    queryKey: ["dashboard-metrics", format(mtdStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const [leadsRes, salesRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, submitted_at")
          .gte("submitted_at", mtdStart.toISOString())
          .lte("submitted_at", mtdEnd.toISOString()),
        supabase
          .from("sales")
          .select("id, revenue, sale_type, match_method, lead_id, date")
          .gte("date", format(mtdStart, "yyyy-MM-dd"))
          .lte("date", format(mtdEnd, "yyyy-MM-dd")),
      ]);

      const leads = leadsRes.data ?? [];
      const sales = salesRes.data ?? [];

      const totalLeads = leads.length;
      const totalSales = sales.length;
      const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);

      const emailExactSales = sales.filter((s) => s.match_method === "email_exact");
      const newLeadSales = sales.filter((s) => s.sale_type === "new_lead");
      const repeatDirectSales = sales.filter((s) => s.sale_type === "repeat_direct");
      const unmatchedSales = sales.filter((s) => s.sale_type === "unknown" && !s.lead_id);

      const strictCloseRate = totalLeads > 0 ? emailExactSales.length / totalLeads : 0;
      const confirmedCloseRate = totalLeads > 0 ? newLeadSales.length / totalLeads : 0;
      const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
      const newLeadRevenue = newLeadSales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);
      const repeatDirectRevenue = repeatDirectSales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);

      return {
        totalRevenue,
        totalLeads,
        totalSales,
        strictCloseRate,
        confirmedCloseRate,
        avgOrderValue,
        newLeadRevenue,
        repeatDirectRevenue,
        unmatchedCount: unmatchedSales.length,
      };
    },
  });
}

export function useTrendData() {
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);

  return useQuery({
    queryKey: ["trend-data", format(thirtyDaysAgo, "yyyy-MM-dd")],
    queryFn: async () => {
      const [leadsRes, salesRes] = await Promise.all([
        supabase
          .from("leads")
          .select("submitted_at")
          .gte("submitted_at", thirtyDaysAgo.toISOString())
          .order("submitted_at"),
        supabase
          .from("sales")
          .select("date, revenue")
          .gte("date", format(thirtyDaysAgo, "yyyy-MM-dd"))
          .order("date"),
      ]);

      const leads = leadsRes.data ?? [];
      const sales = salesRes.data ?? [];

      // Build daily aggregates
      const days: Record<string, { date: string; leads: number; sales: number; revenue: number }> = {};
      for (let i = 0; i <= 30; i++) {
        const d = format(subDays(now, 30 - i), "yyyy-MM-dd");
        days[d] = { date: d, leads: 0, sales: 0, revenue: 0 };
      }

      leads.forEach((l) => {
        if (l.submitted_at) {
          const d = format(new Date(l.submitted_at), "yyyy-MM-dd");
          if (days[d]) days[d].leads++;
        }
      });

      sales.forEach((s) => {
        if (s.date) {
          const d = typeof s.date === "string" ? s.date : format(new Date(s.date), "yyyy-MM-dd");
          if (days[d]) {
            days[d].sales++;
            days[d].revenue += Number(s.revenue) || 0;
          }
        }
      });

      return Object.values(days);
    },
  });
}
