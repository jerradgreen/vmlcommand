import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear, format, addDays } from "date-fns";

export type DatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "mtd" | "ytd" | "last_year" | "12m" | "custom";

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
    case "last_year": {
      const ly = now.getFullYear() - 1;
      return { from: new Date(ly, 0, 1), to: endOfDay(new Date(ly, 11, 31)) };
    }
    case "12m":
      return { from: startOfDay(subDays(now, 364)), to: endOfDay(now) };
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

      const now = new Date();
      const yesterdayStr = format(subDays(now, 1), "yyyy-MM-dd");
      const todayStr = format(now, "yyyy-MM-dd");
      const next7Str = format(addDays(now, 7), "yyyy-MM-dd");

      // "All Time" defaults rangeFrom to 2000-01-01 (Fix Pack B)
      const rangeFrom = from ? format(from, "yyyy-MM-dd") : "2025-01-01";
      const rangeTo = to ? format(to, "yyyy-MM-dd") : format(now, "yyyy-MM-dd");

      // NOTE: txn_category='transfer' is NOT an expense and must be excluded from expense totals.
      // Cost rollups are computed server-side via get_cost_rollups RPC which enforces:
      //   txn_type='business', txn_category IS NOT NULL, txn_category != 'transfer'
      //   Results are abs(sum(amount)) — always positive for display.

      const [
        leadsRes, salesRes, earliestRes,
        yesterdayExpRes,
        costRollupsRes,
        rangeSalesRevRes,
        // Legacy fallback queries
        rangeBillsPaidRes, rangeCogsPaidRes, rangeExpRes,
        // Future-dated due items (always absolute, not in financial_transactions)
        next7BillsRes, next7CogsRes,
        // Fully loaded marketing rollup (scalar numeric)
        marketingRollupRes,
        // Deposit-based revenue (hybrid approach: bank = source of truth)
        depositRevenueRes,
        personalDrawRes,
        shopifyCapitalRes,
        salesCountsRes,
        accrualRollupRes,
      ] = await Promise.all([
        leadsCountQuery,
        salesQuery,
        earliestQuery,
        supabase.from("expenses").select("amount").eq("category", "ads").eq("date", yesterdayStr),
        supabase.rpc("get_cost_rollups", { p_from: rangeFrom, p_to: rangeTo }),
        supabase.from("sales").select("revenue").gte("date", rangeFrom).lte("date", rangeTo),
        supabase.from("bills").select("amount").eq("status", "paid").gte("date", rangeFrom).lte("date", rangeTo),
        supabase.from("cogs_payments").select("amount").eq("status", "paid").gte("date", rangeFrom).lte("date", rangeTo),
        supabase.from("expenses").select("amount").eq("category", "ads").gte("date", rangeFrom).lte("date", rangeTo),
        supabase.from("bills").select("amount").in("status", ["due", "scheduled"]).gte("due_date", todayStr).lte("due_date", next7Str),
        supabase.from("cogs_payments").select("amount").in("status", ["due", "scheduled"]).gte("due_date", todayStr).lte("due_date", next7Str),
        supabase.rpc("get_marketing_rollup", { p_from: rangeFrom, p_to: rangeTo }),
        // Deposit-based revenue: customer_payment + platform_payout (positive amounts)
        supabase
          .from("financial_transactions")
          .select("amount")
          .in("txn_subcategory", ["customer_payment", "platform_payout"])
          .gt("amount", 0)
          .gte("txn_date", rangeFrom)
          .lte("txn_date", rangeTo),
        // Personal draw rollup
        supabase.rpc("get_personal_draw_rollup", { p_from: rangeFrom, p_to: rangeTo }),
        // Shopify Capital summary
        supabase.rpc("get_shopify_capital_summary", { p_from: rangeFrom, p_to: rangeTo }),
        // Sales counts by segment
        supabase.rpc("get_sales_counts", { p_from: rangeFrom, p_to: rangeTo }),
        // Accrued manufacturing COGS rollup
        supabase.rpc("get_accrued_mfg_cogs_rollup", { p_from: rangeFrom, p_to: rangeTo }),
      ]);

      const sales = salesRes.data ?? [];
      const totalLeads = leadsRes.count ?? 0;
      const totalSales = sales.length;
      const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);

      const newLeadSales = sales.filter((s) => s.sale_type === "new_lead");
      const repeatDirectSales = sales.filter((s) => s.sale_type === "repeat_direct");
      const unmatchedSales = sales.filter((s) => s.sale_type === "unknown" && !s.lead_id);
      const newLeadSalesCount = newLeadSales.length;
      const repeatDirectSalesCount = repeatDirectSales.length;
      const unmatchedSalesCount = unmatchedSales.length;

      const closeRate = totalLeads > 0 ? newLeadSalesCount / totalLeads : 0;

      // Avg Days Lead to Sale
      const matchedNewLeadSales = sales.filter((s) => s.sale_type === "new_lead" && s.lead_id);
      let avgDaysLeadToSale: number | null = null;
      if (matchedNewLeadSales.length > 0) {
        const leadIds = [...new Set(matchedNewLeadSales.map((s) => s.lead_id!))];
        const { data: leadsData } = await supabase
          .from("leads")
          .select("id, submitted_at")
          .in("id", leadIds);
        if (leadsData && leadsData.length > 0) {
          const leadMap = new Map(leadsData.map((l) => [l.id, l.submitted_at]));
          const daysArr: number[] = [];
          for (const sale of matchedNewLeadSales) {
            const submittedAt = leadMap.get(sale.lead_id!);
            if (submittedAt && sale.date) {
              const diff = (new Date(sale.date).getTime() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
              if (diff >= 0) daysArr.push(diff);
            }
          }
          if (daysArr.length > 0) {
            avgDaysLeadToSale = daysArr.reduce((a, b) => a + b, 0) / daysArr.length;
          }
        }
      }

      const newLeadRevenue = newLeadSales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);
      const repeatDirectRevenue = repeatDirectSales.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);
      const earliestDate = earliestRes.data?.[0]?.date ?? null;

      // ── Cost rollups from RPC (primary source) ──
      // NOTE: txn_category='transfer' is NOT an expense and must be excluded from expense totals.
      const rollups = costRollupsRes.data as { cogs_total: number; ads_spend_total: number; overhead_total: number } | null;
      let cogsTotal = Number(rollups?.cogs_total ?? 0);
      let adsSpendTotal = Number(rollups?.ads_spend_total ?? 0);
      let overheadTotal = Number(rollups?.overhead_total ?? 0);

      // Legacy fallback: only use if RPC returned all zeros AND legacy has data
      const legacyCogs = (rangeCogsPaidRes.data ?? []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      const legacyOverhead = (rangeBillsPaidRes.data ?? []).reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      const legacyAds = (rangeExpRes.data ?? []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      if (cogsTotal === 0 && legacyCogs > 0) cogsTotal = legacyCogs;
      if (adsSpendTotal === 0 && legacyAds > 0) adsSpendTotal = legacyAds;
      if (overheadTotal === 0 && legacyOverhead > 0) overheadTotal = legacyOverhead;

      // ── Shopify Capital ──
      const capitalData = shopifyCapitalRes.data as { paid_to_date: number; remaining_balance: number; paid_in_range: number; loan_qualifying_sales_count_in_range: number } | null;
      const shopifyCapitalPaid = Number(capitalData?.paid_to_date ?? 0);
      const shopifyCapitalRemaining = Number(capitalData?.remaining_balance ?? 0);
      const shopifyCapitalPaidInRange = Number(capitalData?.paid_in_range ?? 0);
      const loanQualifyingSalesCountInRange = Number(capitalData?.loan_qualifying_sales_count_in_range ?? 0);

      // Sales counts by segment
      const salesCountsData = salesCountsRes.data as { all_sales_count: number; shopify_sales_count: number; loan_qualifying_sales_count: number } | null;
      const shopifySalesCountInRange = Number(salesCountsData?.shopify_sales_count ?? 0);

      const totalOperatingCost = cogsTotal + adsSpendTotal + overheadTotal + shopifyCapitalPaidInRange;
      const rangeRevenue = (rangeSalesRevRes.data ?? []).reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);

      // Deposit-based revenue (hybrid approach: bank deposits = source of truth for total revenue)
      const depositRevenue = (depositRevenueRes.data ?? []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      // AOV uses deposit revenue (bank = source of truth), not sales sheet
      const avgOrderValue = totalSales > 0 ? depositRevenue / totalSales : 0;

      // Use deposit revenue for profit calculations (more accurate than sales sheet)
      const netProfitProxy = depositRevenue - totalOperatingCost;
      // Safe division: return 0 when revenue is 0 (not NaN/Infinity)
      const profitMarginPct = depositRevenue > 0 ? netProfitProxy / depositRevenue : 0;
      const rangeRoas = adsSpendTotal > 0 ? depositRevenue / adsSpendTotal : 0;
      // Coverage: what % of deposit revenue is accounted for in sales records
      const salesCoveragePct = depositRevenue > 0 ? rangeRevenue / depositRevenue : 0;

      const yesterdayAdSpend = (yesterdayExpRes.data ?? []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const next7BillsDue = (next7BillsRes.data ?? []).reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      const next7CogsDue = (next7CogsRes.data ?? []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

      // ── Unit Economics ──
      const fullyLoadedMarketingCost = Number(marketingRollupRes.data ?? 0);
      const rangeSalesCount = totalSales;
      const fullyLoadedCPO = rangeSalesCount > 0 ? fullyLoadedMarketingCost / rangeSalesCount : 0;
      const revenuePerSale = rangeSalesCount > 0 ? depositRevenue / rangeSalesCount : 0;
      const cogsPerSale = rangeSalesCount > 0 ? cogsTotal / rangeSalesCount : 0;
      const contributionMarginPerSale = revenuePerSale - cogsPerSale;
      const marketingPerSale = rangeSalesCount > 0 ? fullyLoadedMarketingCost / rangeSalesCount : 0;
      // Loan payback per sale uses ONLY loan-qualifying sales as denominator
      const loanPaybackPerSale = loanQualifyingSalesCountInRange > 0 ? shopifyCapitalPaidInRange / loanQualifyingSalesCountInRange : 0;
      // Net profit per sale uses overall averages for global costs, loan spread across all sales as avg
      const loanPaybackPerSaleAvg = rangeSalesCount > 0 ? shopifyCapitalPaidInRange / rangeSalesCount : 0;
      const profitPerSale = revenuePerSale - cogsPerSale - marketingPerSale - loanPaybackPerSaleAvg;
      const marketingPctOfRevenue = depositRevenue > 0 ? fullyLoadedMarketingCost / depositRevenue : 0;

      // ── Personal Draw ──
      const personalDrawTotal = Number(personalDrawRes.data ?? 0);

      // ── Accrual COGS Overlay ──
      const accrualData = accrualRollupRes.data as {
        estimated_mfg_total: number; allocated_mfg_total: number;
        accrued_mfg_remaining_total: number;
        unpaid_count: number; partial_count: number; paid_count: number;
      } | null;
      const accruedMfgRemaining = Number(accrualData?.accrued_mfg_remaining_total ?? 0);
      const estimatedMfgTotal = Number(accrualData?.estimated_mfg_total ?? 0);
      const allocatedMfgTotal = Number(accrualData?.allocated_mfg_total ?? 0);
      const mfgUnpaidCount = Number(accrualData?.unpaid_count ?? 0);
      const mfgPartialCount = Number(accrualData?.partial_count ?? 0);
      const mfgPaidCount = Number(accrualData?.paid_count ?? 0);
      const adjustedCogsTotal = cogsTotal + accruedMfgRemaining;
      const adjustedTotalOperatingCost = adjustedCogsTotal + adsSpendTotal + overheadTotal + shopifyCapitalPaidInRange;
      const adjustedNetProfit = depositRevenue - adjustedTotalOperatingCost;
      const adjustedCogsPct = depositRevenue > 0 ? adjustedCogsTotal / depositRevenue : 0;
      const adjustedProfitMarginPct = depositRevenue > 0 ? adjustedNetProfit / depositRevenue : 0;

      return {
        earliestDate,
        totalRevenue,
        totalLeads,
        totalSales,
        closeRate,
        avgOrderValue,
        avgDaysLeadToSale,
        newLeadRevenue,
        repeatDirectRevenue,
        newLeadSalesCount,
        repeatDirectSalesCount,
        unmatchedCount: unmatchedSalesCount,
        yesterdayAdSpend,
        cogsTotal,
        adsSpendTotal,
        overheadTotal,
        totalOperatingCost,
        depositRevenue,
        rangeRevenue,
        rangeRoas,
        netProfitProxy,
        profitMarginPct,
        salesCoveragePct,
        next7BillsDue,
        next7CogsDue,
        fullyLoadedMarketingCost,
        fullyLoadedCPO,
        revenuePerSale,
        contributionMarginPerSale,
        profitPerSale,
        marketingPctOfRevenue,
        personalDrawTotal,
        shopifyCapitalPaid,
        shopifyCapitalRemaining,
        shopifyCapitalPaidInRange,
        loanPaybackPerSale,
        loanQualifyingSalesCountInRange,
        shopifySalesCountInRange,
        accruedMfgRemaining,
        estimatedMfgTotal,
        allocatedMfgTotal,
        mfgUnpaidCount,
        mfgPartialCount,
        mfgPaidCount,
        adjustedCogsTotal,
        adjustedTotalOperatingCost,
        adjustedNetProfit,
        adjustedCogsPct,
        adjustedProfitMarginPct,
        // Pass-through date bounds for drilldowns (exact same values used in all queries)
        rangeFrom,
        rangeTo,
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
      const fetchAll = async <T>(queryFactory: (from: number, to: number) => any) => {
        const pageSize = 1000;
        let start = 0;
        const allRows: T[] = [];

        while (true) {
          const { data, error } = await queryFactory(start, start + pageSize - 1);
          if (error) throw error;

          const chunk = data ?? [];
          allRows.push(...chunk);

          if (chunk.length < pageSize) break;
          start += pageSize;
        }

        return allRows;
      };

      const [leads, sales, expenses] = await Promise.all([
        fetchAll<{ submitted_at: string | null }>((fromRow, toRow) =>
          supabase
            .from("leads")
            .select("submitted_at")
            .gte("submitted_at", trendFrom.toISOString())
            .lte("submitted_at", trendTo.toISOString())
            .order("submitted_at")
            .range(fromRow, toRow)
        ),
        fetchAll<{ date: string | null; revenue: number | null }>((fromRow, toRow) =>
          supabase
            .from("sales")
            .select("date, revenue")
            .gte("date", format(trendFrom, "yyyy-MM-dd"))
            .lte("date", format(trendTo, "yyyy-MM-dd"))
            .order("date")
            .range(fromRow, toRow)
        ),
        fetchAll<{ date: string | null; amount: number | null }>((fromRow, toRow) =>
          supabase
            .from("expenses")
            .select("date, amount")
            .eq("category", "ads")
            .gte("date", format(trendFrom, "yyyy-MM-dd"))
            .lte("date", format(trendTo, "yyyy-MM-dd"))
            .order("date")
            .range(fromRow, toRow)
        ),
      ]);


      const dayMap: Record<string, { date: string; leads: number; sales: number; revenue: number; adSpend: number }> = {};
      for (let i = 0; i <= days; i++) {
        const d = format(subDays(trendTo, days - i), "yyyy-MM-dd");
        dayMap[d] = { date: d, leads: 0, sales: 0, revenue: 0, adSpend: 0 };
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

      expenses.forEach((e) => {
        if (e.date) {
          const d = typeof e.date === "string" ? e.date : format(new Date(e.date), "yyyy-MM-dd");
          if (dayMap[d]) {
            dayMap[d].adSpend += Number(e.amount) || 0;
          }
        }
      });

      return Object.values(dayMap);
    },
  });
}
