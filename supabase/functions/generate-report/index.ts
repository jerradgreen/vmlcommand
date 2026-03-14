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

    const costPerSaleDisplay = metrics.costPerSale != null ? `$${metrics.costPerSale.toFixed(0)}` : "N/A (no new-lead sales)";

    const prompt = `You are a fractional CFO analyzing a small e-commerce business (custom signs/marquees). Generate a business health report for the period: ${dateLabel}.

IMPORTANT: COGS and profitability metrics below are based on booked sales revenue (not bank deposits). Cash metrics are shown separately. Always refer to individual orders as "sales" or "orders", never "units".

Here are the key metrics:

--- PROFITABILITY (Sales-Based) ---
- Sales Revenue (booked): $${(metrics.salesRevenue ?? metrics.rangeRevenue ?? 0).toLocaleString()}
- COGS (Actual + Estimated): $${(metrics.briefCogs ?? metrics.adjustedCogsTotal ?? 0).toLocaleString()}
- COGS % of Sales Revenue: ${((metrics.cogsPct ?? metrics.adjustedCogsPct ?? 0) * 100).toFixed(1)}%
- Gross Profit: $${(metrics.grossProfit ?? 0).toLocaleString()}
- Gross Margin: ${((metrics.grossMargin ?? 0) * 100).toFixed(1)}%
- Ad Spend: $${(metrics.adsSpendTotal ?? 0).toLocaleString()}
- Cost Per New-Lead Sale: ${costPerSaleDisplay}
- Overhead: $${(metrics.overheadTotal ?? 0).toLocaleString()} (Recurring: $${(metrics.overheadRecurringTotal ?? 0).toLocaleString()}, One-time: $${(metrics.overheadOneTimeTotal ?? 0).toLocaleString()})
- Shopify Capital Paid (period): $${(metrics.shopifyCapitalPaidInRange ?? 0).toLocaleString()}
- Net Profit: $${(metrics.netProfit ?? 0).toLocaleString()}
- Net Margin: ${((metrics.netMargin ?? 0) * 100).toFixed(1)}%

--- CASH METRICS (Deposit-Based) ---
- Bank Deposits (cash collected): $${(metrics.depositRevenue ?? 0).toLocaleString()}
- Cash in Bank: $${(metrics.cashInBank ?? "N/A").toLocaleString?.() ?? "N/A"}
- Net Cash Position: $${(metrics.netCashPosition ?? "N/A").toLocaleString?.() ?? "N/A"}
- Shopify Capital Remaining: $${(metrics.shopifyCapitalRemaining ?? 0).toLocaleString()}
- Next 7 Days Due: $${((metrics.next7BillsDue ?? 0) + (metrics.next7CogsDue ?? 0)).toLocaleString()}

--- SALES & MARKETING ---
- Total Sales: ${metrics.totalSales ?? 0}
- New-Lead Sales: ${metrics.newLeadSalesCount ?? 0}
- Total Leads (Cognito): ${metrics.totalLeads ?? 0}
- New-Lead Close Rate: ${((metrics.closeRate ?? 0) * 100).toFixed(1)}%
- Avg Order Value: $${(metrics.avgOrderValue ?? 0).toFixed(0)}
- Avg Days Lead → Sale: ${(metrics.avgDaysLeadToSale ?? "N/A")}
- New Lead Revenue: $${(metrics.newLeadRevenue ?? 0).toLocaleString()} (${metrics.newLeadSalesCount ?? 0} sales)
- Repeat/Direct Revenue: $${(metrics.repeatDirectRevenue ?? 0).toLocaleString()} (${metrics.repeatDirectSalesCount ?? 0} sales)
- Unmatched Sales: ${metrics.unmatchedCount ?? 0}
- ROAS: ${(metrics.rangeRoas ?? 0).toFixed(2)}x
- Revenue per Sale: $${(metrics.revenuePerSale ?? 0).toFixed(0)}
- Cost Per Lead: ${metrics.costPerLead != null ? `$${metrics.costPerLead.toFixed(0)}` : "N/A (no leads)"}
- Revenue Per Lead (New Leads): ${metrics.revenuePerLead != null ? `$${metrics.revenuePerLead.toFixed(0)}` : "N/A (no leads)"}

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
          { role: "system", content: "You are a fractional CFO generating business health reports. Be specific, data-driven, and actionable. Use actual numbers from the metrics provided. Note: profitability metrics use booked sales revenue as the basis, not cash deposits. Always refer to individual orders as 'sales' or 'orders', never 'units'." },
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
