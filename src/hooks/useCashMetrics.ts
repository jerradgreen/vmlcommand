import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateRange } from "./useDashboardMetrics";
import { subDays, startOfDay, endOfDay, startOfMonth, startOfYear, format } from "date-fns";

const CREDIT_PATTERN = /card|visa|mastercard|discover|amex/i;

function classifyAccount(account_name?: string | null, institution?: string | null): "credit" | "bank" {
  const combined = `${account_name ?? ""} ${institution ?? ""}`;
  return CREDIT_PATTERN.test(combined) ? "credit" : "bank";
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
      const [accountsRes, txnRes] = await Promise.all([
        supabase.from("financial_accounts").select("account_name, institution, balance"),
        supabase.from("financial_transactions").select("amount").gte("txn_date", rangeFrom).lte("txn_date", rangeTo),
      ]);

      const accounts = accountsRes.data ?? [];
      let cashInBank = 0;
      let cardsTotalRaw = 0;

      for (const a of accounts) {
        const bal = Number(a.balance) || 0;
        if (classifyAccount(a.account_name, a.institution) === "credit") {
          cardsTotalRaw += bal;
        } else {
          cashInBank += bal;
        }
      }

      const cardsOwedDisplay = Math.abs(cardsTotalRaw);
      const netCashPosition = cashInBank + cardsTotalRaw;

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
        cardsTotalRaw,
        cardsOwedDisplay,
        netCashPosition,
        totalInflow,
        totalOutflow,
        hasData: accounts.length > 0 || txns.length > 0,
      };
    },
  });
}
