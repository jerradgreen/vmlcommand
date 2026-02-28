/**
 * MetricSpec — unified configuration for every clickable dashboard card.
 *
 * Each spec describes:
 *   - title / subtitle shown in the drilldown header
 *   - formula: line-by-line breakdown items (each is a label + value-key)
 *   - dataTable: optional list query to show rows (e.g. ad spend transactions)
 *   - mixesDepositsAndSales: triggers the Sales Coverage badge/warning
 */

export type MetricSpecId =
  // Revenue Engine
  | "mtd_revenue"
  | "mtd_sales"
  | "close_rate"
  // Ad Performance
  | "yesterday_ad_spend"
  | "mtd_ad_spend"
  | "mtd_roas"
  | "ad_spend_pct"
  // Cost Structure
  | "mtd_cogs"
  | "cogs_pct"
  | "mtd_overhead"
  | "overhead_pct"
  | "total_operating_cost"
  // Shopify Capital
  | "shopify_capital_remaining"
  | "shopify_capital_paid"
  | "shopify_capital_in_range"
  // Unit Economics
  | "marketing_cpo"
  | "revenue_per_sale"
  | "gp_per_sale"
  | "loan_per_sale"
  | "np_per_sale"
  // Cash & Survival
  | "net_profit"
  | "profit_margin"
  | "next7_due"
  | "net_after_upcoming_due"
  // Additional
  | "total_leads"
  | "new_lead_revenue"
  | "repeat_direct_revenue"
  | "unmatched_sales"
  | "mtd_bills_paid"
  | "mtd_cogs_paid"
  | "net_after_ads";

export interface FormulaLine {
  label: string;
  /** Key into the metrics object, or a literal value */
  valueKey: string;
  /** "+" for additive, "-" for subtractive, "=" for result */
  sign: "+" | "-" | "=" | "info";
}

export type DataTableType =
  | "ad_expenses"
  | "sales_list"
  | "sales_new_lead"
  | "sales_repeat_direct"
  | "sales_unmatched"
  | "leads_list"
  | "bills_paid"
  | "cogs_paid"
  | "cogs_txns"
  | "overhead_txns"
  | "next7_bills"
  | "next7_cogs"
  | "shopify_capital_loans";

export interface MetricSpec {
  title: string;
  subtitle?: string;
  formula: FormulaLine[];
  dataTables?: DataTableType[];
  mixesDepositsAndSales?: boolean;
}

export const metricSpecs: Record<MetricSpecId, MetricSpec> = {
  // ── Revenue Engine ──
  mtd_revenue: {
    title: "Revenue",
    formula: [
      { label: "Bank Deposits (Revenue)", valueKey: "depositRevenue", sign: "=" },
      { label: "Sales Sheet Total", valueKey: "rangeRevenue", sign: "info" },
    ],
    dataTables: ["sales_list"],
  },
  mtd_sales: {
    title: "Sales",
    formula: [
      { label: "Total Sales", valueKey: "totalSales", sign: "=" },
    ],
    dataTables: ["sales_list"],
  },
  close_rate: {
    title: "Confirmed Close Rate",
    formula: [
      { label: "New Lead Sales", valueKey: "newLeadSalesCount", sign: "info" },
      { label: "Total Leads", valueKey: "totalLeads", sign: "info" },
      { label: "Close Rate", valueKey: "_closeRatePct", sign: "=" },
    ],
    dataTables: ["sales_new_lead", "leads_list"],
  },

  // ── Ad Performance ──
  yesterday_ad_spend: {
    title: "Yesterday Ad Spend",
    formula: [
      { label: "Yesterday Ad Spend", valueKey: "yesterdayAdSpend", sign: "=" },
    ],
    dataTables: ["ad_expenses"],
  },
  mtd_ad_spend: {
    title: "Ad Spend",
    formula: [
      { label: "Ad Spend", valueKey: "adsSpendTotal", sign: "=" },
    ],
    dataTables: ["ad_expenses"],
  },
  mtd_roas: {
    title: "ROAS Breakdown",
    formula: [
      { label: "Revenue (bank deposits)", valueKey: "depositRevenue", sign: "+" },
      { label: "Ad Spend", valueKey: "adsSpendTotal", sign: "-" },
      { label: "ROAS", valueKey: "_roas", sign: "=" },
    ],
    dataTables: ["ad_expenses", "sales_list"],
  },
  ad_spend_pct: {
    title: "Ad Spend % of Revenue",
    formula: [
      { label: "Ad Spend", valueKey: "adsSpendTotal", sign: "info" },
      { label: "Revenue", valueKey: "depositRevenue", sign: "info" },
      { label: "Ad Spend %", valueKey: "_adSpendPct", sign: "=" },
    ],
  },

  // ── Cost Structure ──
  mtd_cogs: {
    title: "COGS (Adjusted)",
    formula: [
      { label: "Cash COGS (paid)", valueKey: "cogsTotal", sign: "+" },
      { label: "Accrued Mfg Remaining", valueKey: "accruedMfgRemaining", sign: "+" },
      { label: "Adjusted COGS", valueKey: "adjustedCogsTotal", sign: "=" },
    ],
    dataTables: ["cogs_txns"],
  },
  mtd_cogs_paid: {
    title: "COGS Paid",
    formula: [
      { label: "COGS Paid", valueKey: "cogsTotal", sign: "=" },
    ],
    dataTables: ["cogs_paid"],
  },
  cogs_pct: {
    title: "COGS % of Revenue",
    formula: [
      { label: "Adjusted COGS", valueKey: "adjustedCogsTotal", sign: "info" },
      { label: "Revenue", valueKey: "depositRevenue", sign: "info" },
      { label: "COGS %", valueKey: "_cogsPct", sign: "=" },
    ],
  },
  mtd_overhead: {
    title: "Overhead",
    formula: [
      { label: "Overhead (actual)", valueKey: "overheadTotal", sign: "=" },
      { label: "Recurring", valueKey: "overheadRecurringTotal", sign: "info" },
      { label: "One-time", valueKey: "overheadOneTimeTotal", sign: "info" },
      { label: "Monthly Run-Rate", valueKey: "overheadMonthlyRunRate", sign: "info" },
    ],
    dataTables: ["overhead_txns"],
  },
  mtd_bills_paid: {
    title: "Bills Paid",
    formula: [
      { label: "Bills Paid", valueKey: "overheadTotal", sign: "=" },
    ],
    dataTables: ["bills_paid"],
  },
  overhead_pct: {
    title: "Overhead % of Revenue",
    formula: [
      { label: "Overhead (actual)", valueKey: "overheadTotal", sign: "info" },
      { label: "Revenue", valueKey: "depositRevenue", sign: "info" },
      { label: "Overhead %", valueKey: "_overheadPct", sign: "=" },
    ],
  },
  total_operating_cost: {
    title: "Total Operating Cost (Monthly Run-Rate)",
    formula: [
      { label: "COGS (run-rate)", valueKey: "cogsMonthlyRunRate", sign: "+" },
      { label: "Ad Spend (run-rate)", valueKey: "adsMonthlyRunRate", sign: "+" },
      { label: "Overhead (run-rate)", valueKey: "overheadMonthlyRunRate", sign: "+" },
      { label: "Loan Repay (run-rate)", valueKey: "loanMonthlyRunRate", sign: "+" },
      { label: "Monthly Run-Rate", valueKey: "totalOpCostMonthlyRunRate", sign: "=" },
      { label: "Actual Total Spent", valueKey: "adjustedTotalOperatingCost", sign: "info" },
    ],
  },

  // ── Shopify Capital ──
  shopify_capital_remaining: {
    title: "Shopify Capital Remaining",
    formula: [
      { label: "Total Payback Cap", valueKey: "_paybackCap", sign: "info" },
      { label: "Paid To Date", valueKey: "shopifyCapitalPaid", sign: "-" },
      { label: "Remaining Balance", valueKey: "shopifyCapitalRemaining", sign: "=" },
    ],
    dataTables: ["shopify_capital_loans"],
  },
  shopify_capital_paid: {
    title: "Shopify Capital Paid (All Time)",
    formula: [
      { label: "Paid To Date", valueKey: "shopifyCapitalPaid", sign: "=" },
    ],
    dataTables: ["shopify_capital_loans"],
  },
  shopify_capital_in_range: {
    title: "Shopify Capital Paid (Period)",
    formula: [
      { label: "Paid In Range", valueKey: "shopifyCapitalPaidInRange", sign: "=" },
    ],
    dataTables: ["shopify_capital_loans"],
  },

  // ── Unit Economics ──
  marketing_cpo: {
    title: "Marketing Cost per Sale",
    formula: [
      { label: "Total Marketing Cost", valueKey: "fullyLoadedMarketingCost", sign: "info" },
      { label: "Total Sales", valueKey: "_totalSales", sign: "info" },
      { label: "Cost per Sale", valueKey: "fullyLoadedCPO", sign: "=" },
    ],
    mixesDepositsAndSales: true,
  },
  revenue_per_sale: {
    title: "Revenue per Sale",
    formula: [
      { label: "Revenue (bank deposits)", valueKey: "depositRevenue", sign: "info" },
      { label: "Total Sales", valueKey: "_totalSales", sign: "info" },
      { label: "Revenue per Sale", valueKey: "revenuePerSale", sign: "=" },
    ],
    mixesDepositsAndSales: true,
  },
  gp_per_sale: {
    title: "Gross Profit per Sale",
    formula: [
      { label: "Revenue per Sale", valueKey: "revenuePerSale", sign: "+" },
      { label: "COGS per Sale", valueKey: "_cogsPerSale", sign: "-" },
      { label: "Gross Profit per Sale", valueKey: "contributionMarginPerSale", sign: "=" },
    ],
    mixesDepositsAndSales: true,
  },
  loan_per_sale: {
    title: "Loan Cost per Affected Sale",
    formula: [
      { label: "Shopify Capital Paid (in range)", valueKey: "shopifyCapitalPaidInRange", sign: "info" },
      { label: "Qualifying Shopify Sales", valueKey: "_loanQualifyingSalesCount", sign: "info" },
      { label: "Loan Cost per Affected Sale", valueKey: "loanPaybackPerSale", sign: "=" },
    ],
  },
  np_per_sale: {
    title: "Net Profit per Sale",
    formula: [
      { label: "Adjusted Net Profit", valueKey: "adjustedNetProfit", sign: "info" },
      { label: "÷ Sales Count", valueKey: "_totalSales", sign: "info" },
      { label: "Net Profit per Sale", valueKey: "profitPerSale", sign: "=" },
    ],
    mixesDepositsAndSales: true,
  },

  // ── Cash & Survival ──
  net_profit: {
    title: "Net Profit Proxy",
    formula: [
      { label: "Revenue (bank deposits)", valueKey: "depositRevenue", sign: "+" },
      { label: "Ad Spend", valueKey: "adsSpendTotal", sign: "-" },
      { label: "COGS (adjusted)", valueKey: "adjustedCogsTotal", sign: "-" },
      { label: "Overhead", valueKey: "overheadTotal", sign: "-" },
      { label: "Shopify Capital (in range)", valueKey: "shopifyCapitalPaidInRange", sign: "-" },
      { label: "Net Profit", valueKey: "adjustedNetProfit", sign: "=" },
    ],
  },
  profit_margin: {
    title: "Net Profit Margin %",
    formula: [
      { label: "Net Profit", valueKey: "adjustedNetProfit", sign: "info" },
      { label: "Revenue", valueKey: "depositRevenue", sign: "info" },
      { label: "Profit Margin %", valueKey: "_profitMarginPct", sign: "=" },
    ],
  },
  next7_due: {
    title: "Next 7 Days Due",
    formula: [
      { label: "Bills Due", valueKey: "next7BillsDue", sign: "+" },
      { label: "COGS Due", valueKey: "next7CogsDue", sign: "+" },
      { label: "Total Due", valueKey: "_next7TotalDue", sign: "=" },
    ],
    dataTables: ["next7_bills", "next7_cogs"],
  },
  net_after_upcoming_due: {
    title: "Net After Upcoming Due",
    formula: [
      { label: "Net Profit", valueKey: "adjustedNetProfit", sign: "+" },
      { label: "Next 7 Days Due", valueKey: "_next7TotalDue", sign: "-" },
      { label: "Net After Upcoming Due", valueKey: "_netAfterUpcomingDue", sign: "=" },
    ],
  },
  total_leads: {
    title: "Total Leads",
    formula: [
      { label: "Leads in Range", valueKey: "totalLeads", sign: "=" },
    ],
    dataTables: ["leads_list"],
  },
  new_lead_revenue: {
    title: "New Lead Revenue",
    formula: [
      { label: "New Lead Revenue", valueKey: "newLeadRevenue", sign: "=" },
      { label: "New Lead Sales", valueKey: "newLeadSalesCount", sign: "info" },
    ],
    dataTables: ["sales_new_lead"],
  },
  repeat_direct_revenue: {
    title: "Repeat/Direct Revenue",
    formula: [
      { label: "Repeat/Direct Revenue", valueKey: "repeatDirectRevenue", sign: "=" },
      { label: "Repeat/Direct Sales", valueKey: "repeatDirectSalesCount", sign: "info" },
    ],
    dataTables: ["sales_repeat_direct"],
  },
  unmatched_sales: {
    title: "Unmatched Sales",
    formula: [
      { label: "Unmatched Sales", valueKey: "unmatchedCount", sign: "=" },
    ],
    dataTables: ["sales_unmatched"],
  },
  net_after_ads: {
    title: "Net After Ads",
    formula: [
      { label: "Revenue (bank deposits)", valueKey: "depositRevenue", sign: "+" },
      { label: "Ad Spend", valueKey: "adsSpendTotal", sign: "-" },
      { label: "Net After Ads", valueKey: "_netAfterAds", sign: "=" },
    ],
    dataTables: ["ad_expenses", "sales_list"],
  },
};
