import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, ArrowLeft, Phone, Mail, MessageSquare, Users } from "lucide-react";
import { format } from "date-fns";
import RepLeadCard from "@/components/RepLeadCard";
import { useRepRole } from "@/hooks/useRepRole";

// Maps simplified rep style names to ilike patterns for matching raw lead sign_style values
const STYLE_TO_PATTERNS: Record<string, string[]> = {
  "Rental Inventory Package": ["%rental%", "%package%"],
  "Wall Hanging": ["%wall%hanging%"],
  "Layered/Logo": ["%layered%", "%logo%"],
  "Mobile Vendor": ["%mobile%vendor%"],
  "Event Style": ["%event%style%"],
  "Marquee Letters": ["%marquee%letter%"],
  "Custom": ["%custom%"],
};

function buildStyleOrFilter(styles: string[]): string {
  const clauses: string[] = [];
  for (const style of styles) {
    const patterns = STYLE_TO_PATTERNS[style];
    if (patterns) {
      for (const p of patterns) {
        clauses.push(`sign_style.ilike.${p}`);
      }
    } else {
      clauses.push(`sign_style.eq.${style}`);
    }
  }
  return clauses.join(",");
}

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  phrase: string | null;
  sign_style: string | null;
  size_text: string | null;
  budget_text: string | null;
  notes: string | null;
  submitted_at: string | null;
  status: string | null;
  raw_payload: any;
}

interface RepInfo {
  id: string;
  email: string;
  styles: string[];
  action_count: number;
  last_action_at: string | null;
  lead_count: number;
}

const STATUS_TABS = ["all", "new", "contacted", "quoted", "won", "lost"] as const;

/* ─── Admin: Rep roster overview ─── */
function AdminRepRoster({ onSelectRep }: { onSelectRep: (rep: RepInfo) => void }) {
  const [reps, setReps] = useState<RepInfo[]>([]);
  const [loading, setLoading] = useState(true);

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
        const repList = json.reps || [];

        // For each rep, get action count and lead count
        const enriched: RepInfo[] = [];
        for (const rep of repList) {
          // Action count
          const { count: actionCount } = await supabase
            .from("rep_lead_actions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", rep.id);

          // Last action
          const { data: lastAction } = await supabase
            .from("rep_lead_actions")
            .select("created_at")
            .eq("user_id", rep.id)
            .order("created_at", { ascending: false })
            .limit(1);

          // Lead count (based on their styles)
          let leadCount = 0;
          if (rep.styles && rep.styles.length > 0) {
            const orFilter = buildStyleOrFilter(rep.styles);
            const { count } = await supabase
              .from("leads")
              .select("id", { count: "exact", head: true })
              .or(orFilter);
            leadCount = count ?? 0;
          }

          enriched.push({
            ...rep,
            action_count: actionCount ?? 0,
            last_action_at: lastAction?.[0]?.created_at || null,
            lead_count: leadCount,
          });
        }
        setReps(enriched);
      } catch (err) {
        console.error("Failed to fetch reps:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReps();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Sales Rep CRM</h1>
      <p className="text-sm text-muted-foreground">Click a rep to view their leads and activity.</p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading reps…</p>
      ) : reps.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No sales reps created yet. Go to Settings to create one.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reps.map((rep) => (
            <Card
              key={rep.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => onSelectRep(rep)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{rep.email}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {rep.styles.length > 0 ? (
                    rep.styles.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No styles assigned</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                  <span>{rep.lead_count} leads available</span>
                  <span>{rep.action_count} actions logged</span>
                </div>
                {rep.last_action_at && (
                  <p className="text-xs text-muted-foreground">
                    Last active: {format(new Date(rep.last_action_at), "MMM d, h:mm a")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Admin: View a specific rep's leads & activity ─── */
function AdminRepDetail({ rep, onBack }: { rep: RepInfo; onBack: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch leads for rep's styles (paginated)
      if (rep.styles.length > 0) {
        const PAGE_SIZE = 1000;
        let allLeads: Lead[] = [];
        let from = 0;
        let done = false;
        while (!done) {
          const { data } = await supabase
            .from("leads")
            .select("id, name, email, phone, phrase, sign_style, size_text, budget_text, notes, submitted_at, status, raw_payload")
            .in("sign_style", rep.styles)
            .order("submitted_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);
          if (data && data.length > 0) {
            allLeads = allLeads.concat(data as Lead[]);
            from += PAGE_SIZE;
            if (data.length < PAGE_SIZE) done = true;
          } else {
            done = true;
          }
        }
        setLeads(allLeads);
      }

      // Fetch rep's recent actions with lead names
      const { data: actionsData } = await supabase
        .from("rep_lead_actions")
        .select("id, action_type, body, created_at, lead_id")
        .eq("user_id", rep.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (actionsData) setActions(actionsData);

      setLoading(false);
    };
    fetchData();
  }, [rep.id, rep.styles]);

  const filtered = useMemo(() => {
    let result = leads;
    if (statusFilter !== "all") {
      result = result.filter((l) => (l.status || "new") === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.phrase?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, statusFilter, search]);

  // Build a lead name lookup for the activity feed
  const leadNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    leads.forEach((l) => { map[l.id] = l.name || l.email || "Unknown"; });
    return map;
  }, [leads]);

  if (selectedLead) {
    return (
      <RepLeadCard
        lead={selectedLead}
        userId={rep.id}
        onBack={() => setSelectedLead(null)}
      />
    );
  }

  const ACTION_COLORS: Record<string, string> = {
    called: "bg-blue-100 text-blue-800",
    emailed: "bg-purple-100 text-purple-800",
    quoted: "bg-amber-100 text-amber-800",
    won: "bg-green-100 text-green-800",
    lost: "bg-red-100 text-red-800",
    note: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to reps
      </Button>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{rep.email}</h1>
        <div className="flex gap-1">
          {rep.styles.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
          ))}
        </div>
      </div>

      {/* Recent activity feed */}
      {actions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {actions.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <Badge className={ACTION_COLORS[a.action_type] || "bg-muted"} variant="secondary">
                    {a.action_type}
                  </Badge>
                  <span className="font-medium text-xs">
                    {leadNameMap[a.lead_id] || "Unknown lead"}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(a.created_at), "MMM d, h:mm a")}
                  </span>
                  {a.body && <span className="text-xs flex-1 truncate">{a.body}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phrase…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize text-xs">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Leads list */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{filtered.length} leads</p>
          <div className="space-y-2">
            {filtered.map((lead) => (
              <div
                key={lead.id}
                className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setSelectedLead(lead)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{lead.name || "No name"}</span>
                    <Badge variant="outline" className="text-xs">
                      {lead.status || "new"}
                    </Badge>
                  </div>
                  {lead.submitted_at && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(lead.submitted_at), "MMM d")}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                  {lead.phrase && <span>"{lead.phrase}"</span>}
                  {lead.sign_style && <span>{lead.sign_style}</span>}
                  {lead.email && <span>{lead.email}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Rep: Standard lead queue ─── */
function RepLeadQueue() {
  const { userId } = useRepRole();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allowedStyles, setAllowedStyles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetchStyles = async () => {
      const { data } = await supabase
        .from("rep_style_access")
        .select("sign_style")
        .eq("user_id", userId);
      if (data) setAllowedStyles(data.map((r) => r.sign_style));
    };
    fetchStyles();
  }, [userId]);

  useEffect(() => {
    if (!allowedStyles.length) {
      setLeads([]);
      setLoading(false);
      return;
    }
    const fetchLeads = async () => {
      setLoading(true);
      const PAGE_SIZE = 1000;
      let allLeads: Lead[] = [];
      let from = 0;
      let done = false;
      while (!done) {
        const { data } = await supabase
          .from("leads")
          .select("id, name, email, phone, phrase, sign_style, size_text, budget_text, notes, submitted_at, status, raw_payload")
          .in("sign_style", allowedStyles)
          .order("submitted_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (data && data.length > 0) {
          allLeads = allLeads.concat(data as Lead[]);
          from += PAGE_SIZE;
          if (data.length < PAGE_SIZE) done = true;
        } else {
          done = true;
        }
      }
      setLeads(allLeads);
      setLoading(false);
    };
    fetchLeads();
  }, [allowedStyles]);

  const filtered = useMemo(() => {
    let result = leads;
    if (statusFilter !== "all") {
      result = result.filter((l) => (l.status || "new") === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.phrase?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, statusFilter, search]);

  if (selectedLead && userId) {
    return (
      <RepLeadCard
        lead={selectedLead}
        userId={userId}
        onBack={() => setSelectedLead(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">My Leads</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phrase…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize text-xs">
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {allowedStyles.length === 0
            ? "No sign styles unlocked yet. Ask your admin to grant access."
            : "No leads found."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => (
            <div
              key={lead.id}
              className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => setSelectedLead(lead)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{lead.name || "No name"}</span>
                  <Badge variant="outline" className="text-xs">
                    {lead.status || "new"}
                  </Badge>
                </div>
                {lead.submitted_at && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(lead.submitted_at), "MMM d")}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                {lead.phrase && <span>"{lead.phrase}"</span>}
                {lead.sign_style && <span>{lead.sign_style}</span>}
                {lead.email && <span>{lead.email}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main: Route by role ─── */
export default function SalesRepCRM() {
  const { role } = useRepRole();
  const [selectedRep, setSelectedRep] = useState<RepInfo | null>(null);

  if (role === "admin") {
    if (selectedRep) {
      return <AdminRepDetail rep={selectedRep} onBack={() => setSelectedRep(null)} />;
    }
    return <AdminRepRoster onSelectRep={setSelectedRep} />;
  }

  return <RepLeadQueue />;
}
