import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, X, RefreshCw } from "lucide-react";

export default function Attribution() {
  const queryClient = useQueryClient();

  // Unmatched sales
  const { data: unmatchedSales, isLoading } = useQuery({
    queryKey: ["unmatched-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("sale_type", "unknown")
        .is("lead_id", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Candidate leads for matching (last 120 days to cover 60-day windows)
  const { data: candidateLeads } = useQuery({
    queryKey: ["candidate-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("submitted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const confirmMatch = useMutation({
    mutationFn: async ({ saleId, leadId }: { saleId: string; leadId: string }) => {
      const { error } = await supabase
        .from("sales")
        .update({
          lead_id: leadId,
          match_method: "manual" as string,
          match_confidence: 80,
          match_reason: "Manually confirmed match",
          sale_type: "new_lead" as string,
        })
        .eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Match confirmed");
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
  });

  const markRepeat = useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await supabase
        .from("sales")
        .update({
          lead_id: null,
          match_method: null,
          match_confidence: null,
          match_reason: null,
          sale_type: "repeat_direct" as string,
        })
        .eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as repeat/direct");
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    },
  });

  // Simple matching: find leads with same email_norm within 60-day window
  function getSuggestedLeads(sale: any) {
    if (!candidateLeads || !sale.email_norm) return [];
    const saleDate = new Date(sale.date);
    const sixtyDaysBefore = new Date(saleDate);
    sixtyDaysBefore.setDate(sixtyDaysBefore.getDate() - 60);

    return candidateLeads
      .filter((l) => {
        if (!l.email_norm || !l.submitted_at) return false;
        const leadDate = new Date(l.submitted_at);
        return (
          l.email_norm === sale.email_norm &&
          leadDate >= sixtyDaysBefore &&
          leadDate <= saleDate
        );
      })
      .sort((a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime())
      .slice(0, 3)
      .map((l) => ({
        ...l,
        confidence: 90,
        reason: `Email match, lead ${Math.round((saleDate.getTime() - new Date(l.submitted_at!).getTime()) / 86400000)} days before sale`,
      }));
  }

  if (isLoading) {
    return <p className="text-muted-foreground py-8 text-center">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attribution Inbox</h1>
        <p className="text-muted-foreground text-sm">
          {(unmatchedSales ?? []).length} unmatched sales to review
        </p>
      </div>

      {(unmatchedSales ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            All sales have been attributed! 🎉
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(unmatchedSales ?? []).map((sale) => {
            const suggestions = getSuggestedLeads(sale);
            return (
              <Card key={sale.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {sale.order_id} — {formatCurrency(Number(sale.revenue) || 0)}
                    </CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {sale.date ? format(new Date(sale.date), "MMM d, yyyy") : "—"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {sale.product_name} · {sale.email || "No email"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {suggestions.length > 0 ? (
                    <>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Suggested Leads
                      </p>
                      {suggestions.map((lead) => (
                        <div key={lead.id} className="flex items-center justify-between rounded-md border p-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">{lead.name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{lead.email} · {lead.phrase || "No phrase"}</p>
                            <div className="flex gap-2">
                              <Badge variant="secondary" className="text-xs">{lead.confidence}% confidence</Badge>
                              <span className="text-xs text-muted-foreground">{lead.reason}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => confirmMatch.mutate({ saleId: sale.id, leadId: lead.id })}
                          >
                            <Check className="h-3 w-3 mr-1" /> Confirm
                          </Button>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No suggested leads found.</p>
                  )}

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markRepeat.mutate(sale.id)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> Repeat/Direct
                    </Button>
                    <Button variant="ghost" size="sm">
                      <X className="h-3 w-3 mr-1" /> Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
