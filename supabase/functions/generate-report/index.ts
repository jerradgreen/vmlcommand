import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { metrics, dateLabel } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `You are a fractional CFO analyzing a small e-commerce business (custom signs/marquees). Generate a business health report for the period: ${dateLabel}.

Here are the key metrics:
- Revenue (bank deposits): $${metrics.depositRevenue?.toLocaleString() ?? 0}
- Sales sheet revenue: $${metrics.rangeRevenue?.toLocaleString() ?? 0}
- Total Sales: ${metrics.totalSales ?? 0}
- Total Leads: ${metrics.totalLeads ?? 0}
- Close Rate: ${((metrics.closeRate ?? 0) * 100).toFixed(1)}%
- Avg Order Value: $${metrics.avgOrderValue?.toFixed(0) ?? 0}
- Avg Days Lead → Sale: ${metrics.avgDaysLeadToSale?.toFixed(1) ?? "N/A"}
- New Lead Revenue: $${metrics.newLeadRevenue?.toLocaleString() ?? 0} (${metrics.newLeadSalesCount ?? 0} sales)
- Repeat/Direct Revenue: $${metrics.repeatDirectRevenue?.toLocaleString() ?? 0} (${metrics.repeatDirectSalesCount ?? 0} sales)
- Unmatched Sales: ${metrics.unmatchedCount ?? 0}
- Ad Spend: $${metrics.adsSpendTotal?.toLocaleString() ?? 0}
- ROAS: ${metrics.rangeRoas?.toFixed(2) ?? 0}x
- Ad Spend % of Revenue: ${((metrics.adsSpendTotal ?? 0) / Math.max(metrics.depositRevenue ?? 1, 1) * 100).toFixed(1)}%
- COGS (cash): $${metrics.cogsTotal?.toLocaleString() ?? 0}
- Accrued Mfg Remaining: $${metrics.accruedMfgRemaining?.toLocaleString() ?? 0}
- Adjusted COGS: $${metrics.adjustedCogsTotal?.toLocaleString() ?? 0}
- COGS % of Revenue: ${((metrics.adjustedCogsPct ?? 0) * 100).toFixed(1)}%
- Overhead: $${metrics.overheadTotal?.toLocaleString() ?? 0} (Recurring: $${metrics.overheadRecurringTotal?.toLocaleString() ?? 0}, One-time: $${metrics.overheadOneTimeTotal?.toLocaleString() ?? 0})
- Overhead Monthly Run-Rate: $${metrics.overheadMonthlyRunRate?.toLocaleString() ?? 0}
- Total Operating Cost Run-Rate: $${metrics.totalOpCostMonthlyRunRate?.toLocaleString() ?? 0}/mo
- Net Profit Run-Rate: $${metrics.netProfitMonthlyRunRate?.toLocaleString() ?? 0}/mo
- Profit Margin Run-Rate: ${((metrics.profitMarginPctRunRate ?? 0) * 100).toFixed(1)}%
- Revenue per Sale: $${metrics.revenuePerSale?.toFixed(0) ?? 0}
- Gross Profit per Sale: $${metrics.contributionMarginPerSale?.toFixed(0) ?? 0}
- Net Profit per Sale: $${metrics.netProfitPerSaleRunRate?.toFixed(0) ?? 0}
- Marketing Cost per Sale: $${metrics.fullyLoadedCPO?.toFixed(0) ?? 0}
- Shopify Capital Remaining: $${metrics.shopifyCapitalRemaining?.toLocaleString() ?? 0}
- Shopify Capital Paid (period): $${metrics.shopifyCapitalPaidInRange?.toLocaleString() ?? 0}
- Next 7 Days Due: $${((metrics.next7BillsDue ?? 0) + (metrics.next7CogsDue ?? 0)).toLocaleString()}
- Cash in Bank: $${metrics.cashInBank?.toLocaleString() ?? "N/A"}
- Net Cash Position: $${metrics.netCashPosition?.toLocaleString() ?? "N/A"}

Return a JSON response using the tool provided.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a fractional CFO generating business health reports. Be specific, data-driven, and actionable. Use actual numbers from the metrics provided." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_report",
              description: "Generate a structured business health report",
              parameters: {
                type: "object",
                properties: {
                  quickBullets: {
                    type: "array",
                    items: { type: "string" },
                    description: "5-8 bullet points summarizing key metrics, health indicators, and red flags. Each bullet should be 1-2 sentences max.",
                  },
                  detailedSummary: {
                    type: "string",
                    description: "2-3 paragraph analysis covering revenue performance, cost structure efficiency, profitability trends, and cash position. Keep it concise - readable in under 2 minutes.",
                  },
                  actionItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short action title" },
                        description: { type: "string", description: "1-2 sentence explanation of what to do and why" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["title", "description", "priority"],
                    },
                    description: "3-5 specific, actionable recommendations to improve business health",
                  },
                  healthScore: {
                    type: "string",
                    enum: ["critical", "needs_attention", "healthy", "strong"],
                    description: "Overall business health assessment",
                  },
                },
                required: ["quickBullets", "detailedSummary", "actionItems", "healthScore"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_report" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits required. Please add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Failed to generate report insights" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No structured response from AI");
    }

    const report = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
