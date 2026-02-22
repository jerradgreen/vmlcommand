import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, X, RefreshCw, Zap } from "lucide-react";
import { getSmartSuggestions, shouldAutoApply, type SmartSuggestion } from "@/lib/smartMatch";

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
        .limit(2000);
      if (error) throw error;
      return data;
    },
  });

  const confirmMatch = useMutation({
    mutationFn: async ({
      saleId,
      leadId,
      matchMethod,
      confidence,
      reason,
    }: {
      saleId: string;
      leadId: string;
      matchMethod: string;
      confidence: number;
      reason: string;
    }) => {
      const { error } = await supabase
        .from("sales")
        .update({
          lead_id: leadId,
          match_method: matchMethod as string,
          match_confidence: confidence,
          match_reason: reason,
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

  // Memoised smart suggestions per sale
  const suggestionsMap = useMemo(() => {
    if (!unmatchedSales || !candidateLeads) return new Map<string, SmartSuggestion[]>();
    const map = new Map<string, SmartSuggestion[]>();
    for (const sale of unmatchedSales) {
      map.set(sale.id, getSmartSuggestions(sale, candidateLeads, 3));
    }
    return map;
  }, [unmatchedSales, candidateLeads]);

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
            const suggestions = suggestionsMap.get(sale.id) ?? [];
            const isDismissed = dismissedIds.has(sale.order_id);
            return (
              <SaleCard
                key={sale.id}
                sale={sale}
                suggestions={suggestions}
                isDismissed={isDismissed}
                onConfirm={(leadId, method, confidence, reason) =>
                  confirmMatch.mutate({
                    saleId: sale.id,
                    leadId,
                    matchMethod: method,
                    confidence,
                    reason,
                  })
                }
                onMarkRepeat={() => markRepeat.mutate(sale.id)}
                onDismiss={() => handleDismiss(sale.order_id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sale Card component ─────────────────────────────────
function SaleCard({
  sale,
  suggestions,
  isDismissed,
  onConfirm,
  onMarkRepeat,
  onDismiss,
}: {
  sale: any;
  suggestions: SmartSuggestion[];
  isDismissed: boolean;
  onConfirm: (leadId: string, method: string, confidence: number, reason: string) => void;
  onMarkRepeat: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card className={isDismissed ? "opacity-50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {sale.order_id} — {formatCurrency(Number(sale.revenue) || 0)}
            {isDismissed && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Dismissed
              </Badge>
            )}
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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Zap className="h-3 w-3" /> Smart Suggestions
            </p>
            {suggestions.map((s) => {
              const autoApply = shouldAutoApply(s, sale);
              return (
                <div
                  key={s.lead.id}
                  className="flex items-start justify-between rounded-md border p-3 gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {s.lead.name || "Unknown"}
                      {autoApply && (
                        <Badge className="ml-2 text-xs" variant="default">Auto-eligible</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.lead.email} · {s.lead.phrase || "No phrase"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.lead.submitted_at ? format(new Date(s.lead.submitted_at), "MMM d, yyyy") : "—"}
                      {" · "}{s.lead.cognito_form || "—"}
                      {" · "}<span className="font-mono">{s.lead.lead_id}</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {s.score}pts
                      </Badge>
                      {s.reasons.map((r, i) => (
                        <Badge key={i} variant="outline" className="text-xs font-normal">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() =>
                      onConfirm(
                        s.lead.id,
                        "smart_suggested",
                        s.score,
                        s.reasons.join("; ")
                      )
                    }
                  >
                    <Check className="h-3 w-3 mr-1" /> Confirm
                  </Button>
                </div>
              );
            })}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No suggested leads found.</p>
        )}

        <div className="flex gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onMarkRepeat}>
            <RefreshCw className="h-3 w-3 mr-1" /> Repeat/Direct
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            <X className="h-3 w-3 mr-1" /> Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
