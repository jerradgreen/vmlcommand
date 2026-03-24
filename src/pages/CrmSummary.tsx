import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Phone, Mail, MessageSquare, CheckCircle, XCircle, DollarSign, TrendingUp } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from "date-fns";
import { cn } from "@/lib/utils";

interface RepAction {
  id: string;
  user_id: string;
  lead_id: string;
  action_type: string;
  body: string | null;
  created_at: string;
}

interface RepSummary {
  id: string;
  email: string;
  calls: number;
  emails: number;
  notes: number;
  quoted: number;
  won: number;
  lost: number;
  total: number;
  lastActive: string | null;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  called: <Phone className="h-3.5 w-3.5" />,
  emailed: <Mail className="h-3.5 w-3.5" />,
  note: <MessageSquare className="h-3.5 w-3.5" />,
  quoted: <DollarSign className="h-3.5 w-3.5" />,
  won: <CheckCircle className="h-3.5 w-3.5" />,
  lost: <XCircle className="h-3.5 w-3.5" />,
};

const ACTION_COLORS: Record<string, string> = {
  called: "bg-blue-100 text-blue-800",
  emailed: "bg-purple-100 text-purple-800",
  quoted: "bg-amber-100 text-amber-800",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-800",
  note: "bg-muted text-muted-foreground",
};

const PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "This Month", value: "mtd" },
  { label: "This Year", value: "ytd" },
  { label: "All Time", value: "all" },
  { label: "Custom", value: "custom" },
];

function getPresetRange(preset: string): { from: Date; to: Date } {
  const now = new Date();
  const to = endOfDay(now);
  switch (preset) {
    case "today": return { from: startOfDay(now), to };
    case "yesterday": return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
    case "7d": return { from: startOfDay(subDays(now, 7)), to };
    case "30d": return { from: startOfDay(subDays(now, 30)), to };
    case "mtd": return { from: startOfMonth(now), to };
    case "ytd": return { from: startOfYear(now), to };
    case "all": return { from: new Date("2020-01-01"), to };
    default: return { from: startOfDay(subDays(now, 7)), to };
  }
}

export default function CrmSummary() {
  const [preset, setPreset] = useState("7d");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [actions, setActions] = useState<RepAction[]>([]);
  const [reps, setReps] = useState<{ id: string; email: string }[]>([]);
  const [leadNames, setLeadNames] = useState<Record<string, string>>({});
  const [repFilter, setRepFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const dateRange = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) {
      return { from: startOfDay(customFrom), to: endOfDay(customTo) };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  // Fetch reps
  useEffect(() => {
    const fetchReps = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-rep`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ action: "list_reps" }),
          }
        );
        const json = await res.json();
        setReps((json.reps || []).map((r: any) => ({ id: r.id, email: r.email })));
      } catch (err) {
        console.error(err);
      }
    };
    fetchReps();
  }, []);

  // Fetch actions in date range
  useEffect(() => {
    const fetchActions = async () => {
      setLoading(true);
      const PAGE_SIZE = 1000;
      let allActions: RepAction[] = [];
      let from = 0;
      let done = false;
      while (!done) {
        const { data } = await supabase
          .from("rep_lead_actions")
          .select("id, user_id, lead_id, action_type, body, created_at")
          .gte("created_at", dateRange.from.toISOString())
          .lte("created_at", dateRange.to.toISOString())
          .order("created_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (data && data.length > 0) {
          allActions = allActions.concat(data);
          from += PAGE_SIZE;
          if (data.length < PAGE_SIZE) done = true;
        } else {
          done = true;
        }
      }
      setActions(allActions);

      // Fetch lead names for all unique lead_ids
      const leadIds = [...new Set(allActions.map((a) => a.lead_id))];
      if (leadIds.length > 0) {
        const names: Record<string, string> = {};
        // Batch in groups of 100
        for (let i = 0; i < leadIds.length; i += 100) {
          const batch = leadIds.slice(i, i + 100);
          const { data: leads } = await supabase
            .from("leads")
            .select("id, name, email")
            .in("id", batch);
          leads?.forEach((l) => {
            names[l.id] = l.name || l.email || "Unknown";
          });
        }
        setLeadNames(names);
      }
      setLoading(false);
    };
    fetchActions();
  }, [dateRange]);

  // Compute scorecards
  const scorecards = useMemo<RepSummary[]>(() => {
    const repMap = new Map<string, RepSummary>();
    reps.forEach((r) => {
      repMap.set(r.id, {
        id: r.id,
        email: r.email,
        calls: 0, emails: 0, notes: 0, quoted: 0, won: 0, lost: 0, total: 0,
        lastActive: null,
      });
    });

    actions.forEach((a) => {
      let entry = repMap.get(a.user_id);
      if (!entry) {
        entry = { id: a.user_id, email: a.user_id, calls: 0, emails: 0, notes: 0, quoted: 0, won: 0, lost: 0, total: 0, lastActive: null };
        repMap.set(a.user_id, entry);
      }
      entry.total++;
      if (a.action_type === "called") entry.calls++;
      else if (a.action_type === "emailed") entry.emails++;
      else if (a.action_type === "note") entry.notes++;
      else if (a.action_type === "quoted") entry.quoted++;
      else if (a.action_type === "won") entry.won++;
      else if (a.action_type === "lost") entry.lost++;
      if (!entry.lastActive || a.created_at > entry.lastActive) entry.lastActive = a.created_at;
    });

    return Array.from(repMap.values()).sort((a, b) => b.total - a.total);
  }, [actions, reps]);

  const filteredActions = useMemo(() => {
    if (repFilter === "all") return actions;
    return actions.filter((a) => a.user_id === repFilter);
  }, [actions, repFilter]);

  const repEmailMap = useMemo(() => {
    const m: Record<string, string> = {};
    reps.forEach((r) => { m[r.id] = r.email; });
    return m;
  }, [reps]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM Summary</h1>
          <p className="text-sm text-muted-foreground">Rep performance & activity overview</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preset === "custom" && (
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                    {customFrom ? format(customFrom, "MMM d, yyyy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !customTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                    {customTo ? format(customTo, "MMM d, yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {reps.length > 1 && (
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Reps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reps</SelectItem>
                {reps.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Scorecards */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : scorecards.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reps found.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scorecards.map((rep) => (
            <Card key={rep.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium truncate">{rep.email}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-bold">{rep.calls}</p>
                    <p className="text-xs text-muted-foreground">Calls</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{rep.emails}</p>
                    <p className="text-xs text-muted-foreground">Emails</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{rep.quoted}</p>
                    <p className="text-xs text-muted-foreground">Quoted</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <div className="flex gap-3">
                    <span className="text-green-600 font-medium">{rep.won} Won</span>
                    <span className="text-red-500 font-medium">{rep.lost} Lost</span>
                  </div>
                  {rep.won + rep.lost > 0 && (
                    <span className="flex items-center gap-1 font-medium">
                      <TrendingUp className="h-3 w-3" />
                      {Math.round((rep.won / (rep.won + rep.lost)) * 100)}% close
                    </span>
                  )}
                </div>
                {rep.lastActive && (
                  <p className="text-xs text-muted-foreground">
                    Last active: {format(new Date(rep.lastActive), "MMM d, h:mm a")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Activity Feed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredActions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No activity in this period.</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredActions.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm py-1.5 border-b last:border-0">
                  <Badge className={cn("shrink-0 gap-1", ACTION_COLORS[a.action_type] || "bg-muted")} variant="secondary">
                    {ACTION_ICONS[a.action_type]}
                    {a.action_type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-xs">{repEmailMap[a.user_id] || "Unknown rep"}</span>
                    <span className="text-muted-foreground text-xs mx-1">→</span>
                    <span className="text-xs">{leadNames[a.lead_id] || "Unknown lead"}</span>
                    {a.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.body}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(a.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
