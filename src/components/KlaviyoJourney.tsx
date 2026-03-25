/**
 * KlaviyoJourney
 *
 * Displays the Klaviyo email/SMS event timeline for a lead,
 * fetched via the klaviyo-profile-events Edge Function.
 *
 * Shows the rep exactly which emails and texts the lead has
 * received, opened, clicked, etc. — so they know what the
 * customer has already seen before making a call.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Mail, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";

interface KlaviyoEvent {
  id: string;
  metric_name: string;
  label: string;
  icon: string;
  category: string;
  occurred_at: string;
  campaign_name: string | null;
  flow_name: string | null;
  subject: string | null;
  message_name: string | null;
}

interface KlaviyoJourneyProps {
  email: string | null;
  leadName?: string | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  email:  "bg-blue-100 text-blue-800 border-blue-200",
  sms:    "bg-green-100 text-green-800 border-green-200",
  list:   "bg-purple-100 text-purple-800 border-purple-200",
  web:    "bg-orange-100 text-orange-800 border-orange-200",
  order:  "bg-emerald-100 text-emerald-800 border-emerald-200",
  other:  "bg-muted text-muted-foreground",
};

const POSITIVE_EVENTS = new Set([
  "Opened Email", "Clicked Email", "Clicked SMS", "Placed Order",
  "Active on Site", "Viewed Product", "Subscribed to List",
]);
const NEGATIVE_EVENTS = new Set([
  "Bounced Email", "Unsubscribed", "Marked Email as Spam",
  "Unsubscribed from List",
]);

function EventRow({ event }: { event: KlaviyoEvent }) {
  const colorClass = CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other;
  const isPositive = POSITIVE_EVENTS.has(event.metric_name);
  const isNegative = NEGATIVE_EVENTS.has(event.metric_name);

  const contextLabel =
    event.subject ??
    event.message_name ??
    event.flow_name ??
    event.campaign_name ??
    null;

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      {/* Timeline dot */}
      <div className="mt-1 flex-shrink-0">
        {isPositive ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : isNegative ? (
          <AlertCircle className="h-4 w-4 text-red-400" />
        ) : event.category === "sms" ? (
          <MessageSquare className="h-4 w-4 text-green-600" />
        ) : (
          <Mail className="h-4 w-4 text-blue-500" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={`text-xs font-medium ${colorClass}`}
          >
            {event.icon} {event.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {event.occurred_at
              ? format(parseISO(event.occurred_at), "MMM d, yyyy h:mm a")
              : ""}
          </span>
        </div>
        {contextLabel && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate" title={contextLabel}>
            {contextLabel}
          </p>
        )}
      </div>
    </div>
  );
}

export default function KlaviyoJourney({ email, leadName }: KlaviyoJourneyProps) {
  const [events, setEvents]     = useState<KlaviyoEvent[]>([]);
  const [loading, setLoading]   = useState(false);
  const [found, setFound]       = useState<boolean | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klaviyo-profile-events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ email }),
        }
      );

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error ?? "Unknown error from Klaviyo function");
      }

      setFound(json.found);
      setEvents(json.events ?? []);
      setLastFetched(new Date());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [email]);

  // Auto-fetch when email changes
  useEffect(() => {
    if (email) fetchEvents();
  }, [email, fetchEvents]);

  if (!email) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4" /> Klaviyo Journey
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No email address on this lead — cannot look up Klaviyo history.</p>
        </CardContent>
      </Card>
    );
  }

  // Group events by category for the summary row
  const emailCount = events.filter(e => e.category === "email").length;
  const smsCount   = events.filter(e => e.category === "sms").length;
  const openCount  = events.filter(e => e.metric_name === "Opened Email").length;
  const clickCount = events.filter(e => e.metric_name === "Clicked Email" || e.metric_name === "Clicked SMS").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-500" />
            Klaviyo Journey
            {leadName && (
              <span className="font-normal text-muted-foreground">— {leadName}</span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchEvents}
            disabled={loading}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        {lastFetched && (
          <p className="text-xs text-muted-foreground">
            Last updated {format(lastFetched, "h:mm a")}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-6 w-3/5" />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded p-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Not found in Klaviyo */}
        {!loading && !error && found === false && (
          <p className="text-xs text-muted-foreground italic">
            This email address has not been found in Klaviyo yet. They may not have submitted a form, or the email may differ.
          </p>
        )}

        {/* Summary badges */}
        {!loading && !error && found === true && events.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 pb-1">
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                📧 {emailCount} email{emailCount !== 1 ? "s" : ""}
              </Badge>
              {smsCount > 0 && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  💬 {smsCount} SMS
                </Badge>
              )}
              {openCount > 0 && (
                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                  👁️ Opened {openCount}×
                </Badge>
              )}
              {clickCount > 0 && (
                <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                  🔗 Clicked {clickCount}×
                </Badge>
              )}
            </div>

            {/* Event list */}
            <div className="max-h-72 overflow-y-auto pr-1">
              {events.map((ev) => (
                <EventRow key={ev.id} event={ev} />
              ))}
            </div>
          </>
        )}

        {/* Found but no events */}
        {!loading && !error && found === true && events.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Profile found in Klaviyo but no events recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
