import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Phone, Mail, MessageSquare, XCircle, ArrowLeft,
  DollarSign, FileText, SendHorizonal, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import KlaviyoJourney from "@/components/KlaviyoJourney";

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

interface Action {
  id: string;
  action_type: string;
  body: string | null;
  created_at: string;
}

/**
 * Pipeline stage definitions — matches the real VML sales process.
 * "won" is intentionally removed; the rep moves a lead to
 * "invoice_requested" → "invoice_sent" → "paid_closed" instead.
 */
const PIPELINE_ACTIONS: {
  type: string;
  label: string;
  icon: React.ReactNode;
  variant: "default" | "secondary" | "outline" | "destructive";
  className?: string;
}[] = [
  {
    type: "called",
    label: "Log Call",
    icon: <Phone className="h-4 w-4" />,
    variant: "default",
  },
  {
    type: "emailed",
    label: "Log Email",
    icon: <Mail className="h-4 w-4" />,
    variant: "secondary",
  },
  {
    type: "quoted",
    label: "Mark Quoted",
    icon: <DollarSign className="h-4 w-4" />,
    variant: "outline",
  },
  {
    type: "invoice_requested",
    label: "Invoice Requested",
    icon: <FileText className="h-4 w-4" />,
    variant: "outline",
    className: "border-amber-400 text-amber-700 hover:bg-amber-50",
  },
  {
    type: "invoice_sent",
    label: "Invoice Sent",
    icon: <SendHorizonal className="h-4 w-4" />,
    variant: "outline",
    className: "border-blue-400 text-blue-700 hover:bg-blue-50",
  },
  {
    type: "paid_closed",
    label: "Paid / Closed ✓",
    icon: <CheckCircle2 className="h-4 w-4" />,
    variant: "default",
    className: "bg-green-600 hover:bg-green-700 text-white",
  },
  {
    type: "lost",
    label: "Lost",
    icon: <XCircle className="h-4 w-4" />,
    variant: "destructive",
  },
];

const ACTION_COLORS: Record<string, string> = {
  called:            "bg-blue-100 text-blue-800",
  emailed:           "bg-purple-100 text-purple-800",
  quoted:            "bg-amber-100 text-amber-800",
  invoice_requested: "bg-orange-100 text-orange-800",
  invoice_sent:      "bg-sky-100 text-sky-800",
  paid_closed:       "bg-green-100 text-green-800",
  lost:              "bg-red-100 text-red-800",
  note:              "bg-muted text-muted-foreground",
};

export default function RepLeadCard({
  lead,
  userId,
  onBack,
}: {
  lead: Lead;
  userId: string;
  onBack: () => void;
}) {
  const [actions, setActions]   = useState<Action[]>([]);
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading]   = useState(false);
  const { toast } = useToast();

  const fetchActions = async () => {
    const { data } = await supabase
      .from("rep_lead_actions")
      .select("*")
      .eq("lead_id", lead.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) setActions(data);
  };

  useEffect(() => {
    fetchActions();
  }, [lead.id]);

  const logAction = async (type: string, body?: string) => {
    setLoading(true);
    const { error } = await supabase.from("rep_lead_actions").insert({
      user_id:     userId,
      lead_id:     lead.id,
      action_type: type,
      body:        body || null,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const label = PIPELINE_ACTIONS.find(a => a.type === type)?.label ?? type;
      toast({ title: `${label} logged` });
      setNoteText("");
      fetchActions();
    }
  };

  // Extract extra fields from raw_payload
  const extra: Record<string, string> = {};
  if (lead.raw_payload && typeof lead.raw_payload === "object") {
    const skip = new Set([
      "Name", "Email", "Phone", "sign_style", "phrase",
      "size_text", "budget_text", "notes",
    ]);
    for (const [k, v] of Object.entries(lead.raw_payload)) {
      if (!skip.has(k) && v && typeof v === "string" && v.trim()) {
        extra[k] = v;
      }
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to leads
      </Button>

      {/* ── Lead Info Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            {lead.name || "No name"}
            {lead.status && (
              <Badge variant="outline" className="text-xs">
                {lead.status}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {lead.email && (
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                <a href={`mailto:${lead.email}`} className="text-primary underline">
                  {lead.email}
                </a>
              </div>
            )}
            {lead.phone && (
              <div>
                <span className="text-muted-foreground">Phone:</span>{" "}
                <a href={`tel:${lead.phone}`} className="text-primary underline">
                  {lead.phone}
                </a>
              </div>
            )}
            {lead.phrase && (
              <div><span className="text-muted-foreground">Phrase:</span> {lead.phrase}</div>
            )}
            {lead.sign_style && (
              <div><span className="text-muted-foreground">Style:</span> {lead.sign_style}</div>
            )}
            {lead.size_text && (
              <div><span className="text-muted-foreground">Size:</span> {lead.size_text}</div>
            )}
            {lead.budget_text && (
              <div><span className="text-muted-foreground">Budget:</span> {lead.budget_text}</div>
            )}
            {lead.submitted_at && (
              <div>
                <span className="text-muted-foreground">Submitted:</span>{" "}
                {format(new Date(lead.submitted_at), "MMM d, yyyy h:mm a")}
              </div>
            )}
            {lead.notes && (
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Notes:</span> {lead.notes}
              </div>
            )}
            {Object.entries(extra).map(([k, v]) => (
              <div key={k}><span className="text-muted-foreground">{k}:</span> {v}</div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Klaviyo Journey Timeline ── */}
      <KlaviyoJourney email={lead.email} leadName={lead.name} />

      {/* ── Pipeline Action Buttons ── */}
      <div className="flex flex-wrap gap-2">
        {PIPELINE_ACTIONS.map((action) => (
          <Button
            key={action.type}
            size="sm"
            variant={action.variant}
            className={action.className}
            onClick={() => logAction(action.type)}
            disabled={loading}
          >
            {action.icon}
            <span className="ml-1">{action.label}</span>
          </Button>
        ))}
      </div>

      {/* ── Add Note ── */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Add a note…"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="flex-1"
          rows={2}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!noteText.trim() || loading}
          onClick={() => logAction("note", noteText.trim())}
        >
          <MessageSquare className="h-4 w-4" /> Save
        </Button>
      </div>

      {/* ── Activity Timeline ── */}
      {actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {actions.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <Badge
                    className={ACTION_COLORS[a.action_type] || "bg-muted"}
                    variant="secondary"
                  >
                    {a.action_type.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-muted-foreground text-xs mt-0.5">
                    {format(new Date(a.created_at), "MMM d, h:mm a")}
                  </span>
                  {a.body && <span className="flex-1">{a.body}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
