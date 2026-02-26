import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parse } from "date-fns";

interface MonthlyRow {
  month: string; // YYYY-MM
  deposits: number;
  salesRevenue: number;
  gap: number;
  cumulativeGap: number;
}

interface ReconciliationData {
  months: MonthlyRow[];
  totalDeposits: number;
  totalSales: number;
  totalGap: number;
}

export function useReconciliation() {
  return useQuery<ReconciliationData>({
    queryKey: ["reconciliation"],
    queryFn: async () => {
      // Fetch all revenue-related deposits (positive amounts, customer_payment or platform_payout)
      const { data: deposits, error: depErr } = await supabase
        .from("financial_transactions")
        .select("txn_date, amount")
        .in("txn_subcategory", ["customer_payment", "platform_payout"])
        .gt("amount", 0);
      if (depErr) throw depErr;

      // Fetch all sales with revenue
      const { data: sales, error: salesErr } = await supabase
        .from("sales")
        .select("date, revenue")
        .not("revenue", "is", null);
      if (salesErr) throw salesErr;

      // Aggregate by month
      const depositsByMonth: Record<string, number> = {};
      for (const d of deposits ?? []) {
        const m = d.txn_date?.slice(0, 7); // YYYY-MM
        if (m) depositsByMonth[m] = (depositsByMonth[m] || 0) + Number(d.amount);
      }

      const salesByMonth: Record<string, number> = {};
      for (const s of sales ?? []) {
        const m = s.date?.slice(0, 7);
        if (m) salesByMonth[m] = (salesByMonth[m] || 0) + Number(s.revenue);
      }

      // Union all months
      const allMonths = Array.from(new Set([...Object.keys(depositsByMonth), ...Object.keys(salesByMonth)])).sort();

      let cumGap = 0;
      const months: MonthlyRow[] = allMonths.map((m) => {
        const dep = depositsByMonth[m] || 0;
        const rev = salesByMonth[m] || 0;
        const gap = dep - rev;
        cumGap += gap;
        return { month: m, deposits: dep, salesRevenue: rev, gap, cumulativeGap: cumGap };
      });

      const totalDeposits = months.reduce((s, r) => s + r.deposits, 0);
      const totalSales = months.reduce((s, r) => s + r.salesRevenue, 0);

      return { months, totalDeposits, totalSales, totalGap: totalDeposits - totalSales };
    },
  });
}
