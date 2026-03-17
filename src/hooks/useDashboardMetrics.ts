import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear, format, addDays } from "date-fns";

export type DatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "mtd" | "ytd" | "last_year" | "6m" | "12m" | "custom";

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
    case "6m":
      return { from: startOfDay(subDays(now, 182)), to: endOfDay(now) };
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
        // Overhead recurring vs one-time split
        overheadSplitRes,
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
        // Overhead one-time split
        supabase
          .from("financial_transactions")
          .select("amount")
          .eq("txn_type", "business")
          .eq("is_recurring", false)
          .in("txn_category", ['software','subscriptions','contractor_payments','office_expense',
            'rent','utilities','insurance','equipment','creative_services','seo',
            'advertising_tools','education','taxes','bank_fees','interest'])
          .gte("txn_date", rangeFrom)
          .lte("txn_date", rangeTo),
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
      const marketingPctOfRevenue = depositRevenue > 0 ? fullyLoadedMarketingCost / depositRevenue : 0;

      // ── Personal Draw ──
      const personalDrawTotal = Number(personalDrawRes.data ?? 0);

      // ── Overhead recurring/one-time split ──
      const overheadOneTimeTotal = (overheadSplitRes.data ?? []).reduce((sum, d) => sum + Math.abs(Number(d.amount) || 0), 0);
      const overheadRecurringTotal = overheadTotal - overheadOneTimeTotal;

      // ── Monthly run-rate: recurring ÷ months in range + one-time ÷ 12 ──
      const rangeDays = Math.max(1, Math.ceil((new Date(rangeTo).getTime() - new Date(rangeFrom).getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const rangeMonths = Math.max(1, rangeDays / 30.44); // avg days per month
      const overheadMonthlyRunRate = (overheadRecurringTotal / rangeMonths) + (overheadOneTimeTotal / 12);


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
      const profitPerSale = rangeSalesCount > 0 ? adjustedNetProfit / rangeSalesCount : 0;

      // Monthly run-rates for all cost components
      // Cash COGS is a recurring flow → divide by months in range
      // Accrued MFG remaining is a backlog liability → amortize over 12 months (like one-time overhead)
      const cashCogsMonthlyRunRate = cogsTotal / rangeMonths;
      const accruedMfgMonthlyRunRate = accruedMfgRemaining / 12;
      const cogsMonthlyRunRate = cashCogsMonthlyRunRate + accruedMfgMonthlyRunRate;
      const adsMonthlyRunRate = adsSpendTotal / rangeMonths;
      const loanMonthlyRunRate = shopifyCapitalPaidInRange / rangeMonths;
      const totalOpCostMonthlyRunRate = cogsMonthlyRunRate + adsMonthlyRunRate + overheadMonthlyRunRate + loanMonthlyRunRate;
      // Run-rate net profit: monthly revenue minus monthly run-rate costs
      const revenueMonthlyRunRate = depositRevenue / rangeMonths;
      const netProfitMonthlyRunRate = revenueMonthlyRunRate - totalOpCostMonthlyRunRate;
      const netProfitPerSaleRunRate = rangeSalesCount > 0 ? netProfitMonthlyRunRate * rangeMonths / rangeSalesCount : 0;
      const profitMarginPctRunRate = revenueMonthlyRunRate > 0 ? netProfitMonthlyRunRate / revenueMonthlyRunRate : 0;

      // Sales-based profit waterfall (briefCogs = actual allocated + estimated accrued)
      const briefCogs = allocatedMfgTotal + accruedMfgRemaining;
      const salesRevenue = rangeRevenue;
      const grossProfit = salesRevenue - briefCogs;
      const grossMargin = salesRevenue > 0 ? grossProfit / salesRevenue : 0;
      const cogsPct = salesRevenue > 0 ? briefCogs / salesRevenue : 0;
      const netProfit = grossProfit - adsSpendTotal - overheadTotal - shopifyCapitalPaidInRange;
      const netMargin = salesRevenue > 0 ? netProfit / salesRevenue : 0;

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
        overheadRecurringTotal,
        overheadOneTimeTotal,
        overheadMonthlyRunRate,
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
        cogsMonthlyRunRate,
        adsMonthlyRunRate,
        loanMonthlyRunRate,
        accruedMfgMonthlyRunRate,
        totalOpCostMonthlyRunRate,
        revenueMonthlyRunRate,
        netProfitMonthlyRunRate,
        netProfitPerSaleRunRate,
        profitMarginPctRunRate,
        // Sales-based profit waterfall
        briefCogs,
        salesRevenue,
        grossProfit,
        grossMargin,
        cogsPct,
        netProfit,
        netMargin,
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

      // Extend lookback by 30 days for rolling window calculation
      const extendedFrom = subDays(trendFrom, 30);

      const [leads, sales, expenses] = await Promise.all([
        fetchAll<{ submitted_at: string | null }>((fromRow, toRow) =>
          supabase
            .from("leads")
            .select("submitted_at")
            .gte("submitted_at", extendedFrom.toISOString())
            .lte("submitted_at", trendTo.toISOString())
            .order("submitted_at")
            .range(fromRow, toRow)
        ),
        fetchAll<{ date: string | null; revenue: number | null; sale_type: string; lead_id: string | null }>((fromRow, toRow) =>
          supabase
            .from("sales")
            .select("date, revenue, sale_type, lead_id")
            .gte("date", format(extendedFrom, "yyyy-MM-dd"))
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

      // Fetch lead submission dates for days-to-close calculation
      const newLeadSalesWithLead = sales.filter(s => s.sale_type === "new_lead" && s.lead_id);
      const leadIds = [...new Set(newLeadSalesWithLead.map(s => s.lead_id!))];
      let leadSubmitMap = new Map<string, string>();
      if (leadIds.length > 0) {
        // Fetch in chunks of 200
        for (let i = 0; i < leadIds.length; i += 200) {
          const chunk = leadIds.slice(i, i + 200);
          const { data: leadsData } = await supabase
            .from("leads")
            .select("id, submitted_at")
            .in("id", chunk);
          if (leadsData) {
            leadsData.forEach(l => { if (l.submitted_at) leadSubmitMap.set(l.id, l.submitted_at); });
          }
        }
      }

      // Build extended dayMap (includes 30-day lookback for rolling window)
      const extendedDays = Math.ceil((trendTo.getTime() - extendedFrom.getTime()) / (1000 * 60 * 60 * 24));
      const extDayMap: Record<string, { leads: number; newLeadSales: number; daysToClose: number[] }> = {};
      for (let i = 0; i <= extendedDays; i++) {
        const d = format(subDays(trendTo, extendedDays - i), "yyyy-MM-dd");
        extDayMap[d] = { leads: 0, newLeadSales: 0, daysToClose: [] };
      }

      leads.forEach((l) => {
        if (l.submitted_at) {
          const d = format(new Date(l.submitted_at), "yyyy-MM-dd");
          if (extDayMap[d]) extDayMap[d].leads++;
        }
      });

      // For days-to-close, only count the FIRST sale per lead (deduplicate)
      const firstSalePerLead = new Map<string, { date: string; diff: number }>();
      sales.forEach((s) => {
        if (s.date && s.sale_type === "new_lead" && s.lead_id) {
          const submittedAt = leadSubmitMap.get(s.lead_id);
          if (submittedAt) {
            const saleDate = typeof s.date === "string" ? s.date : format(new Date(s.date), "yyyy-MM-dd");
            const diff = (new Date(saleDate).getTime() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
            if (diff >= 0) {
              const existing = firstSalePerLead.get(s.lead_id);
              if (!existing || saleDate < existing.date) {
                firstSalePerLead.set(s.lead_id, { date: saleDate, diff });
              }
            }
          }
        }
      });

      sales.forEach((s) => {
        if (s.date) {
          const d = typeof s.date === "string" ? s.date : format(new Date(s.date), "yyyy-MM-dd");
          if (extDayMap[d] && s.sale_type === "new_lead") {
            extDayMap[d].newLeadSales++;
            if (s.lead_id) {
              const first = firstSalePerLead.get(s.lead_id);
              if (first && first.date === d) {
                extDayMap[d].daysToClose.push(first.diff);
              }
            }
          }
        }
      });

      // Build display dayMap with cumulative metrics
      const dayMap: Record<string, { date: string; leads: number; sales: number; revenue: number; cumulativeRevenue: number; adSpend: number; closeRate: number | null; daysToClose: number | null }> = {};
      const allExtDates = Object.keys(extDayMap).sort();

      // Cumulative days-to-close: running average matching KPI card logic
      const allDaysToClose: number[] = [];
      let cumulativeRevenue = 0;

      for (let i = 0; i <= days; i++) {
        const d = format(subDays(trendTo, days - i), "yyyy-MM-dd");
        dayMap[d] = { date: d, leads: 0, sales: 0, revenue: 0, cumulativeRevenue: 0, adSpend: 0, closeRate: null, daysToClose: null };

        // Close Rate: 30-day rolling window
        const closeRateWindowStart = format(subDays(new Date(d), 29), "yyyy-MM-dd");
        let windowLeads = 0;
        let windowNewLeadSales = 0;

        for (const wd of allExtDates) {
          if (wd >= closeRateWindowStart && wd <= d && extDayMap[wd]) {
            windowLeads += extDayMap[wd].leads;
            windowNewLeadSales += extDayMap[wd].newLeadSales;
          }
        }

        // Days to Close: cumulative running average (all closes up to this date)
        if (extDayMap[d]) {
          allDaysToClose.push(...extDayMap[d].daysToClose);
        }

        dayMap[d].closeRate = windowLeads > 0 ? windowNewLeadSales / windowLeads : null;
        dayMap[d].daysToClose = allDaysToClose.length > 0
          ? allDaysToClose.reduce((a, b) => a + b, 0) / allDaysToClose.length
          : null;
      }

      // Populate standard metrics and cumulative revenue (only for display range)
      leads.forEach((l) => {
        if (l.submitted_at) {
          const d = format(new Date(l.submitted_at), "yyyy-MM-dd");
          if (dayMap[d]) dayMap[d].leads++;
        }
      });

      // Sort sales by date for cumulative calculation
      const sortedDisplayDates = Object.keys(dayMap).sort();

      sales.forEach((s) => {
        if (s.date) {
          const d = typeof s.date === "string" ? s.date : format(new Date(s.date), "yyyy-MM-dd");
          if (dayMap[d]) {
            dayMap[d].sales++;
            dayMap[d].revenue += Number(s.revenue) || 0;
          }
        }
      });

      // Build cumulative revenue
      let runningRevenue = 0;
      for (const d of sortedDisplayDates) {
        runningRevenue += dayMap[d].revenue;
        dayMap[d].cumulativeRevenue = runningRevenue;
      }

      expenses.forEach((e) => {
        if (e.date) {
          const d = typeof e.date === "string" ? e.date : format(new Date(e.date), "yyyy-MM-dd");
          if (dayMap[d]) {
            dayMap[d].adSpend += Number(e.amount) || 0;
          }
        }
      });

      // Smooth bulk ad spend entries: redistribute lump-sum months into daily averages
      const monthGroups: Record<string, string[]> = {};
      for (const d of sortedDisplayDates) {
        const ym = d.slice(0, 7); // YYYY-MM
        if (!monthGroups[ym]) monthGroups[ym] = [];
        monthGroups[ym].push(d);
      }

      for (const [, days] of Object.entries(monthGroups)) {
        if (days.length < 7) continue;

        const nonZeroIdxs = days
          .map((d, idx) => (dayMap[d].adSpend > 0 ? idx : -1))
          .filter((idx) => idx >= 0);

        if (nonZeroIdxs.length === 0) continue;

        // Case 1: fully bulk month (e.g. one monthly entry) → spread across whole month
        if (nonZeroIdxs.length <= 3) {
          const monthTotal = days.reduce((sum, d) => sum + dayMap[d].adSpend, 0);
          if (monthTotal > 0) {
            const monthAvg = monthTotal / days.length;
            for (const d of days) dayMap[d].adSpend = Math.round(monthAvg * 100) / 100;
          }
          continue;
        }

        // Case 2: leading bulk entry before daily-ish tracking begins (e.g. Feb 1-21 lump, Feb 22+ daily)
        const firstNonZeroIdx = nonZeroIdxs[0];
        const prefixDays = days.slice(0, firstNonZeroIdx + 1);
        const prefixNonZero = prefixDays.filter((d) => dayMap[d].adSpend > 0);

        if (firstNonZeroIdx >= 6 && prefixNonZero.length === 1) {
          const prefixTotal = prefixDays.reduce((sum, d) => sum + dayMap[d].adSpend, 0);
          if (prefixTotal > 0) {
            const prefixAvg = prefixTotal / prefixDays.length;
            for (const d of prefixDays) {
              dayMap[d].adSpend = Math.round(prefixAvg * 100) / 100;
            }
          }
        }
      }

      return Object.values(dayMap);
    },
  });
}
