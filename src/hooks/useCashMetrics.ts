import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "./useDashboardMetrics";
import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear, format } from "date-fns";

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
    case "6m": return { from: startOfDay(subDays(now, 182)), to: endOfDay(now) };
    case "12m": return { from: startOfDay(subDays(now, 364)), to: endOfDay(now) };
    case "custom": return { from: range.from ?? null, to: range.to ?? null };
    default: return { from: null, to: null };
  }
}

export function useCashMetrics(range: DateRange) {
  const { from, to } = getDateBounds(range);
  const rangeFrom = from ? format(from, "yyyy-MM-dd") : "2000-01-01";
  const rangeTo = to ? format(to, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["cash-metrics", rangeFrom, rangeTo],
    queryFn: async () => {
      const [balancesRes, txnRes] = await Promise.all([
        supabase.from("account_balances").select("account_type, balance, updated_at"),
        supabase.from("financial_transactions").select("amount").gte("txn_date", rangeFrom).lte("txn_date", rangeTo),
      ]);

      const balances = balancesRes.data ?? [];
      let cashInBank = 0;
      let totalCreditCardDebt = 0;
      let lastUpdated: string | null = null;

      for (const a of balances) {
        const bal = Number(a.balance) || 0;
        if (a.account_type === "credit_card") {
          totalCreditCardDebt += bal;
        } else {
          cashInBank += bal;
        }
        // Track most recent updated_at
        if (a.updated_at && (!lastUpdated || a.updated_at > lastUpdated)) {
          lastUpdated = a.updated_at;
        }
      }

      const netCashPosition = cashInBank - totalCreditCardDebt;

      const txns = txnRes.data ?? [];
      let totalInflow = 0;
      let totalOutflow = 0;
      for (const t of txns) {
        const amt = Number(t.amount) || 0;
        if (amt > 0) totalInflow += amt;
        else totalOutflow += amt;
      }
      totalOutflow = Math.abs(totalOutflow);

      return {
        cashInBank,
        cardsOwedDisplay: totalCreditCardDebt,
        netCashPosition,
        totalInflow,
        totalOutflow,
        lastUpdated,
        hasData: balances.length > 0 || txns.length > 0,
      };
    },
  });
}
