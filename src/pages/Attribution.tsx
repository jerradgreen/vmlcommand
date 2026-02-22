import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, X, RefreshCw } from "lucide-react";

const DISMISSED_KEY = "vml-dismissed-sales";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

export default function Attribution() {
  const queryClient = useQueryClient();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(loadDismissed);
  const [showDismissed, setShowDismissed] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales-count"] });
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
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales-count"] });
    },
  });

  const handleDismiss = useCallback((orderId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      saveDismissed(next);
      return next;
    });
    toast("Sale dismissed from view");
  }, []);

  function getSuggestedLeads(sale: any) {
    if (!candidateLeads || !sale.email_norm) return [];
    const saleDate = new Date(sale.date);
    const sixtyDaysBefore = new Date(saleDate);
    sixtyDaysBefore.setDate(sixtyDaysBefore.getDate() - 60);

    return candidateLeads
      .filter((l) => {
        if (!l.email_norm || !l.submitted_at) return false;
        const leadDate = new Date(l.submitted_at);
        return l.email_norm === sale.email_norm && leadDate >= sixtyDaysBefore && leadDate <= saleDate;
      })
      .sort((a, b) => new Date(b.submitted_at!).getTime() - new Date(a.submitted_at!).getTime())
      .slice(0, 3)
      .map((l) => ({
        ...l,
        confidence: 90,
        reason: `Email match, lead ${Math.round((saleDate.getTime() - new Date(l.submitted_at!).getTime()) / 86400000)} days before sale`,
      }));
  }

  // Filter dismissed
  const visibleSales = (unmatchedSales ?? []).filter((s) => {
    const isDismissed = dismissedIds.has(s.order_id);
    return showDismissed || !isDismissed;
  });

  if (isLoading) {
    return <p className="text-muted-foreground py-8 text-center">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attribution Inbox</h1>
          <p className="text-muted-foreground text-sm">
            {visibleSales.length} unmatched sales to review
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={showDismissed} onCheckedChange={setShowDismissed} />
          <span className="text-sm text-muted-foreground">Show dismissed</span>
        </div>
      </div>

      {visibleSales.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {(unmatchedSales ?? []).length === 0
              ? "All sales have been attributed! 🎉"
              : "All remaining sales are dismissed. Toggle \"Show dismissed\" to see them."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleSales.map((sale) => {
            const suggestions = getSuggestedLeads(sale);
            const isDismissed = dismissedIds.has(sale.order_id);
            return (
              <Card key={sale.id} className={isDismissed ? "opacity-50" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {sale.order_id} — {formatCurrency(Number(sale.revenue) || 0)}
                      {isDismissed && <Badge variant="secondary" className="ml-2 text-xs">Dismissed</Badge>}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismiss(sale.order_id)}
                    >
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
