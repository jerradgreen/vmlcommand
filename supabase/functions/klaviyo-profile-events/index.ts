/**
 * klaviyo-profile-events
 *
 * Fetches the Klaviyo event timeline for a given email address.
 * Called from the SalesRepCRM lead detail view to show the
 * "Customer Journey" — which emails/texts the lead has received,
 * opened, clicked, etc.
 *
 * Auth: requires a valid Supabase session (any authenticated user).
 * The Klaviyo private API key is stored server-side only.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_API_VERSION = "2024-02-15";

// Human-readable labels for Klaviyo metric names
const METRIC_LABELS: Record<string, { label: string; icon: string; category: string }> = {
  "Received Email":        { label: "Email Received",        icon: "📧", category: "email" },
  "Opened Email":          { label: "Email Opened",           icon: "👁️",  category: "email" },
  "Clicked Email":         { label: "Email Link Clicked",     icon: "🔗", category: "email" },
  "Bounced Email":         { label: "Email Bounced",          icon: "⚠️", category: "email" },
  "Unsubscribed":          { label: "Unsubscribed",           icon: "🚫", category: "email" },
  "Marked Email as Spam":  { label: "Marked as Spam",         icon: "🚩", category: "email" },
  "Received SMS":          { label: "SMS Received",           icon: "💬", category: "sms"   },
  "Clicked SMS":           { label: "SMS Link Clicked",       icon: "📱", category: "sms"   },
  "Subscribed to List":    { label: "Added to List",          icon: "✅", category: "list"  },
  "Unsubscribed from List":{ label: "Removed from List",      icon: "❌", category: "list"  },
  "Active on Site":        { label: "Visited Website",        icon: "🌐", category: "web"   },
  "Viewed Product":        { label: "Viewed Product",         icon: "🛍️", category: "web"   },
  "Placed Order":          { label: "Placed Order",           icon: "💰", category: "order" },
};

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

async function klaviyoGet(path: string, klaviyoKey: string): Promise<any> {
  const url = `${KLAVIYO_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Klaviyo-API-Key ${klaviyoKey}`,
      "revision": KLAVIYO_API_VERSION,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Klaviyo API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function getProfileIdByEmail(email: string, klaviyoKey: string): Promise<string | null> {
  const encoded = encodeURIComponent(`equals(email,"${email}")`);
  const data = await klaviyoGet(
    `/profiles/?filter=${encoded}&fields[profile]=id,email`,
    klaviyoKey
  );
  if (!data?.data?.length) return null;
  return data.data[0].id;
}

async function getProfileEvents(profileId: string, klaviyoKey: string): Promise<KlaviyoEvent[]> {
  const events: KlaviyoEvent[] = [];
  let nextUrl: string | null =
    `/events/?filter=equals(profile_id,"${profileId}")` +
    `&include=metric,campaign` +
    `&fields[event]=occurred_at,properties` +
    `&fields[metric]=name` +
    `&fields[campaign]=name` +
    `&sort=-occurred_at` +
    `&page[size]=50`;

  // Fetch up to 3 pages (150 events max) to keep response fast
  let pages = 0;
  while (nextUrl && pages < 3) {
    const data = await klaviyoGet(nextUrl, klaviyoKey);
    pages++;

    // Build lookup maps for included resources
    const metricMap: Record<string, string> = {};
    const campaignMap: Record<string, string> = {};

    for (const inc of data?.included ?? []) {
      if (inc.type === "metric")   metricMap[inc.id]   = inc.attributes?.name ?? "";
      if (inc.type === "campaign") campaignMap[inc.id] = inc.attributes?.name ?? "";
    }

    for (const ev of data?.data ?? []) {
      const metricId   = ev.relationships?.metric?.data?.id ?? "";
      const campaignId = ev.relationships?.campaign?.data?.id ?? "";
      const metricName = metricMap[metricId] ?? "Unknown Event";
      const meta       = METRIC_LABELS[metricName] ?? {
        label: metricName,
        icon: "📌",
        category: "other",
      };
      const props = ev.attributes?.properties ?? {};

      events.push({
        id:            ev.id,
        metric_name:   metricName,
        label:         meta.label,
        icon:          meta.icon,
        category:      meta.category,
        occurred_at:   ev.attributes?.occurred_at ?? "",
        campaign_name: campaignMap[campaignId] ?? null,
        flow_name:     flowMap[flowId] ?? null,
        subject:       props["Subject"] ?? props["subject"] ?? null,
        message_name:  props["Message Name"] ?? props["message_name"] ?? null,
      });
    }

    // Follow pagination cursor
    const nextCursor = data?.links?.next;
    if (nextCursor) {
      // Extract just the path+query from the full URL
      try {
        const u = new URL(nextCursor);
        nextUrl = u.pathname + u.search;
      } catch {
        nextUrl = null;
      }
    } else {
      nextUrl = null;
    }
  }

  return events;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the caller is an authenticated Supabase user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader  = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const email: string = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return new Response(
        JSON.stringify({ ok: false, error: "email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Klaviyo private key from env
    const klaviyoKey = Deno.env.get("KLAVIYO_PRIVATE_KEY");
    if (!klaviyoKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Klaviyo API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up Klaviyo profile by email
    const profileId = await getProfileIdByEmail(email, klaviyoKey);
    if (!profileId) {
      return new Response(
        JSON.stringify({ ok: true, found: false, events: [], email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch events for that profile
    const events = await getProfileEvents(profileId, klaviyoKey);

    return new Response(
      JSON.stringify({ ok: true, found: true, profile_id: profileId, email, events }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("klaviyo-profile-events error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
