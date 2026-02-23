import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Check, X, RefreshCw, Zap, Database, Link2, Search,
  Sparkles, BarChart3, ChevronDown, ChevronUp,
} from "lucide-react";

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
  const [linkingSaleId, setLinkingSaleId] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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

  const confirmMatch = useMutation({
    mutationFn: async ({
      saleId, leadId, matchMethod, confidence, reason,
    }: {
      saleId: string; leadId: string; matchMethod: string; confidence: number; reason: string;
    }) => {
      const { error } = await supabase
        .from("sales")
        .update({
          lead_id: leadId,
          match_method: matchMethod as string,
          match_confidence: confidence,
          match_reason: reason,
          sale_type: "new_lead" as string,
          suggested_lead_id: null,
          suggested_score: null,
          suggested_reasons: null,
        })
        .eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Match confirmed");
      setLinkingSaleId(null);
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
          lead_id: null, match_method: null, match_confidence: null, match_reason: null,
          sale_type: "repeat_direct" as string,
          suggested_lead_id: null, suggested_score: null, suggested_reasons: null,
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

  const backfillEmailMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("backfill_email_matches");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`Email backfill matched ${count} sales`);
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales-count"] });
    },
    onError: (err: any) => toast.error(`Email backfill failed: ${err.message}`),
  });

  const backfillSmartMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("backfill_smart_matches", {
        lookback_days: 120,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result) => {
      toast.success(`Smart backfill linked ${result?.linked_count ?? 0} sales (${result?.still_unmatched_after ?? '?'} remaining)`);
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales-count"] });
    },
    onError: (err: any) => toast.error(`Smart backfill failed: ${err.message}`),
  });

  const bulkSuggestMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("bulk_generate_suggestions", {
        lookback_days: 365,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (result) => {
      toast.success(`Suggestions generated: ${result?.with_suggestions ?? 0} matched, ${result?.no_suggestions ?? 0} without`);
      queryClient.invalidateQueries({ queryKey: ["unmatched-sales"] });
    },
    onError: (err: any) => toast.error(`Suggestion generation failed: ${err.message}`),
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

  const visibleSales = (unmatchedSales ?? []).filter((s) => {
    const isDismissed = dismissedIds.has(s.order_id);
    return showDismissed || !isDismissed;
  });

  if (isLoading) {
    return <p className="text-muted-foreground py-8 text-center">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attribution Inbox</h1>
          <p className="text-muted-foreground text-sm">
            {visibleSales.length} unmatched sales to review
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => backfillEmailMutation.mutate()} disabled={backfillEmailMutation.isPending}>
            <Database className="h-3 w-3 mr-1" />
            {backfillEmailMutation.isPending ? "Running…" : "Backfill Email"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => backfillSmartMutation.mutate()} disabled={backfillSmartMutation.isPending}>
            <Zap className="h-3 w-3 mr-1" />
            {backfillSmartMutation.isPending ? "Running…" : "Auto-Link"}
          </Button>
          <Button variant="default" size="sm" onClick={() => bulkSuggestMutation.mutate()} disabled={bulkSuggestMutation.isPending}>
            <Sparkles className="h-3 w-3 mr-1" />
            {bulkSuggestMutation.isPending ? "Generating…" : "Generate Suggestions"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDiagnostics(!showDiagnostics)}>
            <BarChart3 className="h-3 w-3 mr-1" /> Diagnostics
          </Button>
          <Switch checked={showDismissed} onCheckedChange={setShowDismissed} />
          <span className="text-sm text-muted-foreground">Show dismissed</span>
        </div>
      </div>

      {showDiagnostics && <DiagnosticsPanel />}

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
            const isDismissed = dismissedIds.has(sale.order_id);
            return (
              <SaleCard
                key={sale.id}
                sale={sale}
                isDismissed={isDismissed}
                onConfirm={(leadId, method, confidence, reason) =>
                  confirmMatch.mutate({ saleId: sale.id, leadId, matchMethod: method, confidence, reason })
                }
                onMarkRepeat={() => markRepeat.mutate(sale.id)}
                onDismiss={() => handleDismiss(sale.order_id)}
                onLink={() => setLinkingSaleId(sale.id)}
              />
            );
          })}
        </div>
      )}

      {linkingSaleId && (
        <LinkModal
          saleId={linkingSaleId}
          onClose={() => setLinkingSaleId(null)}
          onConfirm={(leadId, score, reason) =>
            confirmMatch.mutate({
              saleId: linkingSaleId, leadId, matchMethod: "manual", confidence: score, reason,
            })
          }
        />
      )}
    </div>
  );
}

// ── Diagnostics Panel ─────────────────────────────────
function DiagnosticsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["attribution-diagnostics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_attribution_diagnostics");
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading diagnostics…</p>;
  if (!data) return null;

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diagnostics</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
          <Stat label="Unmatched" value={data.total_unmatched} />
          <Stat label="With Suggestion" value={data.with_suggestion} />
          <Stat label="No Suggestion" value={data.no_suggestion} />
          <Stat label="Free Email" value={data.free_email_domain} />
          <Stat label="Corporate" value={data.corporate_domain} />
          <Stat label="No Email" value={data.no_email} />
        </div>
        {data.top_tokens && data.top_tokens.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Top tokens in unmatched sales:</p>
            <div className="flex flex-wrap gap-1">
              {data.top_tokens.slice(0, 15).map((t: any, i: number) => (
                <Badge key={i} variant="outline" className="text-xs font-mono">
                  {t.tok} ({t.cnt})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-bold">{value ?? 0}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ── Sale Card ─────────────────────────────────────────
function SaleCard({
  sale, isDismissed, onConfirm, onMarkRepeat, onDismiss, onLink,
}: {
  sale: any;
  isDismissed: boolean;
  onConfirm: (leadId: string, method: string, confidence: number, reason: string) => void;
  onMarkRepeat: () => void;
  onDismiss: () => void;
  onLink: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const hasSuggestion = sale.suggested_lead_id != null;

  return (
    <Card className={isDismissed ? "opacity-50" : ""}>
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
        {/* Pre-computed suggestion */}
        {hasSuggestion && (
          <PreComputedSuggestion
            sale={sale}
            onConfirm={onConfirm}
          />
        )}

        {/* On-demand suggestions */}
        {showMore && (
          <InlineSuggestions
            saleId={sale.id}
            onConfirm={onConfirm}
          />
        )}

        <div className="flex gap-2 pt-2 border-t flex-wrap">
          {!hasSuggestion && (
            <Button variant="outline" size="sm" onClick={() => setShowMore(!showMore)}>
              <Zap className="h-3 w-3 mr-1" /> {showMore ? "Hide" : "Find Suggestions"}
            </Button>
          )}
          {hasSuggestion && (
            <Button variant="outline" size="sm" onClick={() => setShowMore(!showMore)}>
              {showMore ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              {showMore ? "Hide More" : "More Options"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onLink}>
            <Link2 className="h-3 w-3 mr-1" /> Link
          </Button>
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

// ── Pre-Computed Suggestion (shown by default on card) ──
function PreComputedSuggestion({
  sale,
  onConfirm,
}: {
  sale: any;
  onConfirm: (leadId: string, method: string, confidence: number, reason: string) => void;
}) {
  const { data: lead } = useQuery({
    queryKey: ["lead-preview", sale.suggested_lead_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, email, phrase, submitted_at")
        .eq("id", sale.suggested_lead_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!sale.suggested_lead_id,
  });

  if (!lead) return null;

  const reasons: string[] = sale.suggested_reasons || [];

  return (
    <div className="flex items-start justify-between rounded-md border border-primary/20 bg-primary/5 p-3 gap-3">
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-primary" />
          <p className="text-xs font-medium text-primary uppercase tracking-wide">
            Top Suggestion · {sale.suggested_score ?? 0} pts
          </p>
        </div>
        <p className="text-sm font-medium">{lead.name || "Unknown"}</p>
        <p className="text-xs text-muted-foreground truncate">
          {lead.email} · {lead.phrase || "No phrase"}
        </p>
        <p className="text-xs text-muted-foreground">
          {lead.submitted_at ? format(new Date(lead.submitted_at), "MMM d, yyyy") : "—"}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {reasons.map((r: string, i: number) => (
            <Badge key={i} variant="outline" className="text-xs font-normal">{r}</Badge>
          ))}
        </div>
      </div>
      <Button size="sm" onClick={() => onConfirm(lead.id, "manual", 100, reasons.join("; "))}>
        <Check className="h-3 w-3 mr-1" /> Confirm
      </Button>
    </div>
  );
}

// ── Inline Suggestions (loaded on-demand) ─────────────────
function InlineSuggestions({
  saleId, onConfirm,
}: {
  saleId: string;
  onConfirm: (leadId: string, method: string, confidence: number, reason: string) => void;
}) {
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["match-suggestions", saleId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_match_suggestions", {
        p_sale_id: saleId, lookback_days: 365, limit_n: 5,
      });
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading suggestions…</p>;
  if (!suggestions || suggestions.length === 0) {
    return <p className="text-sm text-muted-foreground">No suggested leads found.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Zap className="h-3 w-3" /> All Candidates
      </p>
      {suggestions.map((s: any) => (
        <SuggestionRow
          key={s.lead_id}
          suggestion={s}
          onConfirm={() => onConfirm(s.lead_id, "manual", 100, (s.reasons || []).join("; "))}
        />
      ))}
    </div>
  );
}

// ── Suggestion Row ────────────────────────────────────────
function SuggestionRow({ suggestion, onConfirm }: { suggestion: any; onConfirm: () => void }) {
  return (
    <div className="flex items-start justify-between rounded-md border p-3 gap-3">
      <div className="space-y-1 min-w-0 flex-1">
        <p className="text-sm font-medium">{suggestion.lead_name || "Unknown"}</p>
        <p className="text-xs text-muted-foreground truncate">
          {suggestion.lead_email} · {suggestion.lead_phrase || "No phrase"}
        </p>
        <p className="text-xs text-muted-foreground">
          {suggestion.lead_submitted_at ? format(new Date(suggestion.lead_submitted_at), "MMM d, yyyy") : "—"}
          {suggestion.score != null && <span className="ml-2 font-mono">{suggestion.score} pts</span>}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(suggestion.reasons || []).map((r: string, i: number) => (
            <Badge key={i} variant="outline" className="text-xs font-normal">{r}</Badge>
          ))}
        </div>
      </div>
      <Button size="sm" onClick={onConfirm}>
        <Check className="h-3 w-3 mr-1" /> Confirm
      </Button>
    </div>
  );
}

// ── Link Modal ────────────────────────────────────────────
function LinkModal({
  saleId, onClose, onConfirm,
}: {
  saleId: string;
  onClose: () => void;
  onConfirm: (leadId: string, score: number, reason: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["link-suggestions", saleId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_match_suggestions", {
        p_sale_id: saleId, lookback_days: 365, limit_n: 5,
      });
      if (error) throw error;
      return data as any[];
    },
  });

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    const { data, error } = await supabase.rpc("search_leads", {
      search_term: searchTerm.trim(), limit_n: 20,
    });
    setSearching(false);
    if (error) { toast.error("Search failed: " + error.message); return; }
    setSearchResults(data as any[]);
  };

  const hasSuggestions = suggestions && suggestions.length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link Sale to Lead</DialogTitle>
          <DialogDescription>Confirm a suggested lead or search manually.</DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading suggestions…</p>}
        {hasSuggestions && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggested Leads</p>
            {suggestions!.map((s: any) => (
              <SuggestionRow
                key={s.lead_id}
                suggestion={s}
                onConfirm={() => onConfirm(s.lead_id, 100, (s.reasons || []).join("; "))}
              />
            ))}
          </div>
        )}

        <div className="space-y-3 pt-3 border-t">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {hasSuggestions ? "Or search manually" : "Search for a lead"}
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Search by name, email, or phrase…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button variant="outline" onClick={handleSearch} disabled={searching}>
              <Search className="h-4 w-4 mr-1" />
              {searching ? "…" : "Search"}
            </Button>
          </div>

          {searchResults && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground">No leads found.</p>
          )}
          {searchResults && searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((lead: any) => (
                <div key={lead.lead_id} className="flex items-center justify-between rounded-md border p-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{lead.lead_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {lead.lead_email} · {lead.lead_phrase || "No phrase"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lead.lead_submitted_at ? format(new Date(lead.lead_submitted_at), "MMM d, yyyy") : "—"}
                      {" · "}<span className="font-mono">{lead.lead_text_id}</span>
                    </p>
                  </div>
                  <Button size="sm" onClick={() => onConfirm(lead.lead_id, 0, "manual_search")}>
                    <Link2 className="h-3 w-3 mr-1" /> Link
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
