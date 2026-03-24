import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { format } from "date-fns";
import RepLeadCard from "@/components/RepLeadCard";
import { useRepRole } from "@/hooks/useRepRole";

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

const STATUS_TABS = ["all", "new", "contacted", "quoted", "won", "lost"] as const;

export default function SalesRepCRM() {
  const { userId, role } = useRepRole();
  const isAdmin = role === "admin";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allowedStyles, setAllowedStyles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch allowed styles (admin skips this — sees all)
  useEffect(() => {
    if (!userId || isAdmin) return;
    const fetchStyles = async () => {
      const { data } = await supabase
        .from("rep_style_access")
        .select("sign_style")
        .eq("user_id", userId);
      if (data) setAllowedStyles(data.map((r) => r.sign_style));
    };
    fetchStyles();
  }, [userId, isAdmin]);

  // Fetch ALL leads (admin = all leads, rep = filtered by allowed styles)
  useEffect(() => {
    if (!isAdmin && !allowedStyles.length) {
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
        let query = supabase
          .from("leads")
          .select("id, name, email, phone, phrase, sign_style, size_text, budget_text, notes, submitted_at, status, raw_payload")
          .order("submitted_at", { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (!isAdmin) {
          query = query.in("sign_style", allowedStyles);
        }

        const { data } = await query;
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
  }, [allowedStyles, isAdmin]);

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

      {/* Lead list */}
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
