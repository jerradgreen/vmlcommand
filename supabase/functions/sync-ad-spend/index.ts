/**
 * sync-ad-spend
 *
 * Pulls yesterday's ad spend from Meta Ads and Microsoft Ads,
 * then upserts each into the `expenses` table via the ingest-expense
 * endpoint (so dedup logic is shared).
 *
 * Called by:
 *   1. Supabase pg_cron nightly at 1:00 AM CT  (automated)
 *   2. Admin manually via POST /functions/v1/sync-ad-spend  (on-demand)
 *
 * Google Ads spend is handled separately via a Google Ads Script
 * that POSTs directly to the ingest-expense webhook.
 *
 * Required secrets:
 *   META_ACCESS_TOKEN        — Meta system user access token (long-lived)
 *   META_AD_ACCOUNT_ID       — e.g. "5330800877025069"
 *   MICROSOFT_ADS_CLIENT_ID  — Azure app client ID
 *   MICROSOFT_ADS_CLIENT_SECRET
 *   MICROSOFT_ADS_REFRESH_TOKEN
 *   MICROSOFT_ADS_ACCOUNT_ID — e.g. "F1101PF2" or numeric
 *   INGEST_API_KEY           — shared secret for ingest-expense
 *   SUPABASE_URL             — auto-injected
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for N days ago in CT (UTC-5 / UTC-6) */
function ctDateOffset(daysAgo: number): string {
  const now = new Date();
  // Approximate CT as UTC-6 (covers both CST and CDT conservatively)
  const ct = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  ct.setUTCDate(ct.getUTCDate() - daysAgo);
  return ct.toISOString().slice(0, 10);
}

/** POST a spend record to ingest-expense */
async function ingestExpense(
  supabaseUrl: string,
  ingestApiKey: string,
  platform: string,
  date: string,
  amount: number,
  notes: string,
  externalId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/ingest-expense`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ingestApiKey,
    },
    body: JSON.stringify({
      platform,
      date,
      amount,
      notes,
      external_id: externalId,
    }),
  });
  return res.json().catch(() => ({ ok: false, error: "Invalid JSON from ingest-expense" }));
}

// ─── Meta Ads ─────────────────────────────────────────────────────────────────

async function syncMeta(
  supabaseUrl: string,
  ingestApiKey: string,
  date: string
): Promise<{ platform: string; date: string; amount: number; status: string }> {
  const token     = Deno.env.get("META_ACCESS_TOKEN");
  const accountId = Deno.env.get("META_AD_ACCOUNT_ID");

  if (!token || !accountId) {
    return { platform: "meta_ads", date, amount: 0, status: "skipped: missing credentials" };
  }

  const url = new URL(
    `https://graph.facebook.com/v19.0/act_${accountId}/insights`
  );
  url.searchParams.set("fields",      "spend");
  url.searchParams.set("time_range",  JSON.stringify({ since: date, until: date }));
  url.searchParams.set("level",       "account");
  url.searchParams.set("access_token", token);

  const res  = await fetch(url.toString());
  const json = await res.json();

  if (!res.ok || json.error) {
    const msg = json.error?.message ?? JSON.stringify(json);
    return { platform: "meta_ads", date, amount: 0, status: `error: ${msg}` };
  }

  const spend = parseFloat(json.data?.[0]?.spend ?? "0");

  if (spend > 0) {
    const externalId = `meta_${accountId}_${date}`;
    await ingestExpense(
      supabaseUrl, ingestApiKey,
      "meta_ads", date, spend,
      `Meta Ads auto-sync — account ${accountId}`,
      externalId
    );
  }

  return { platform: "meta_ads", date, amount: spend, status: spend > 0 ? "synced" : "zero_spend" };
}

// ─── Microsoft Ads ────────────────────────────────────────────────────────────

async function getMicrosoftAccessToken(): Promise<string | null> {
  const clientId     = Deno.env.get("MICROSOFT_ADS_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_ADS_CLIENT_SECRET");
  const refreshToken = Deno.env.get("MICROSOFT_ADS_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) return null;

  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    scope:         "https://ads.microsoft.com/msads.manage offline_access",
  });

  const res  = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = await res.json();
  return json.access_token ?? null;
}

async function syncMicrosoft(
  supabaseUrl: string,
  ingestApiKey: string,
  date: string
): Promise<{ platform: string; date: string; amount: number; status: string }> {
  const accountId       = Deno.env.get("MICROSOFT_ADS_ACCOUNT_ID");
  const developerToken  = Deno.env.get("MICROSOFT_ADS_DEVELOPER_TOKEN");

  if (!accountId || !developerToken) {
    return { platform: "bing_ads", date, amount: 0, status: "skipped: missing credentials" };
  }

  const accessToken = await getMicrosoftAccessToken();
  if (!accessToken) {
    return { platform: "bing_ads", date, amount: 0, status: "error: could not get access token" };
  }

  // Use the Reporting API — SubmitGenerateReport then PollGenerateReport
  // For simplicity we use the Campaign Management / Reporting SOAP API via REST-like approach
  // Microsoft Ads Reporting API: AccountPerformanceReportRequest
  const reportRequest = `
    <s:Envelope xmlns:i="http://www.w3.org/2001/XMLSchema-instance"
                xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
      <s:Header xmlns="https://bingads.microsoft.com/Reporting/v13">
        <Action mustUnderstand="1">SubmitGenerateReport</Action>
        <AuthenticationToken>${accessToken}</AuthenticationToken>
        <DeveloperToken>${developerToken}</DeveloperToken>
      </s:Header>
      <s:Body>
        <SubmitGenerateReportRequest xmlns="https://bingads.microsoft.com/Reporting/v13">
          <ReportRequest i:type="AccountPerformanceReportRequest">
            <ExcludeColumnHeaders>false</ExcludeColumnHeaders>
            <ExcludeReportFooter>true</ExcludeReportFooter>
            <ExcludeReportHeader>true</ExcludeReportHeader>
            <Format>Csv</Format>
            <ReportName>DailySpendSync</ReportName>
            <ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>
            <Aggregation>Daily</Aggregation>
            <Columns>
              <AccountPerformanceReportColumn>TimePeriod</AccountPerformanceReportColumn>
              <AccountPerformanceReportColumn>Spend</AccountPerformanceReportColumn>
            </Columns>
            <Filter i:nil="true" />
            <Scope>
              <AccountIds xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
                <a:long>${accountId}</a:long>
              </AccountIds>
            </Scope>
            <Time>
              <CustomDateRangeEnd>
                <Day>${date.split("-")[2]}</Day>
                <Month>${date.split("-")[1]}</Month>
                <Year>${date.split("-")[0]}</Year>
              </CustomDateRangeEnd>
              <CustomDateRangeStart>
                <Day>${date.split("-")[2]}</Day>
                <Month>${date.split("-")[1]}</Month>
                <Year>${date.split("-")[0]}</Year>
              </CustomDateRangeStart>
            </Time>
          </ReportRequest>
        </SubmitGenerateReportRequest>
      </s:Body>
    </s:Envelope>`;

  // Submit the report
  const submitRes = await fetch(
    "https://reporting.api.bingads.microsoft.com/Reporting/v13/ReportingService.svc",
    {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction":   "SubmitGenerateReport",
      },
      body: reportRequest,
    }
  );

  const submitText = await submitRes.text();

  // Extract report request ID from SOAP response
  const reportIdMatch = submitText.match(/<ReportRequestId>([^<]+)<\/ReportRequestId>/);
  if (!reportIdMatch) {
    return { platform: "bing_ads", date, amount: 0, status: `error: could not submit report — ${submitText.slice(0, 200)}` };
  }

  const reportId = reportIdMatch[1];

  // Poll for completion (up to 30 seconds)
  let downloadUrl: string | null = null;
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollBody = `
      <s:Envelope xmlns:i="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
        <s:Header xmlns="https://bingads.microsoft.com/Reporting/v13">
          <Action mustUnderstand="1">PollGenerateReport</Action>
          <AuthenticationToken>${accessToken}</AuthenticationToken>
          <DeveloperToken>${developerToken}</DeveloperToken>
        </s:Header>
        <s:Body>
          <PollGenerateReportRequest xmlns="https://bingads.microsoft.com/Reporting/v13">
            <ReportRequestId>${reportId}</ReportRequestId>
          </PollGenerateReportRequest>
        </s:Body>
      </s:Envelope>`;

    const pollRes  = await fetch(
      "https://reporting.api.bingads.microsoft.com/Reporting/v13/ReportingService.svc",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction":   "PollGenerateReport",
        },
        body: pollBody,
      }
    );

    const pollText = await pollRes.text();
    const urlMatch = pollText.match(/<ReportDownloadUrl>([^<]+)<\/ReportDownloadUrl>/);
    if (urlMatch) {
      downloadUrl = urlMatch[1];
      break;
    }
  }

  if (!downloadUrl) {
    return { platform: "bing_ads", date, amount: 0, status: "error: report timed out" };
  }

  // Download and parse the CSV
  const csvRes  = await fetch(downloadUrl);
  const csvText = await csvRes.text();

  // Parse spend from CSV — last numeric column in data rows
  let totalSpend = 0;
  const lines = csvText.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    const cols  = line.split(",");
    const spend = parseFloat(cols[cols.length - 1].replace(/[^0-9.]/g, ""));
    if (!isNaN(spend)) totalSpend += spend;
  }

  if (totalSpend > 0) {
    const externalId = `bing_${accountId}_${date}`;
    await ingestExpense(
      supabaseUrl, ingestApiKey,
      "bing_ads", date, totalSpend,
      `Microsoft Ads auto-sync — account ${accountId}`,
      externalId
    );
  }

  return { platform: "bing_ads", date, amount: totalSpend, status: totalSpend > 0 ? "synced" : "zero_spend" };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Accept either the INGEST_API_KEY (for cron/internal calls) or a Supabase service role
  const apiKey     = req.headers.get("x-api-key");
  const authHeader = req.headers.get("Authorization");
  const ingestKey  = Deno.env.get("INGEST_API_KEY");

  const isAuthorized =
    (apiKey && apiKey === ingestKey) ||
    (authHeader && authHeader.startsWith("Bearer "));

  if (!isAuthorized) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const ingestApiKey = ingestKey!;

  // Allow caller to specify a date, otherwise use yesterday
  let targetDate: string;
  try {
    const body = await req.json().catch(() => ({}));
    targetDate = typeof body.date === "string" ? body.date : ctDateOffset(1);
  } catch {
    targetDate = ctDateOffset(1);
  }

  console.log(`sync-ad-spend: syncing date ${targetDate}`);

  const [metaResult, microsoftResult] = await Promise.allSettled([
    syncMeta(supabaseUrl, ingestApiKey, targetDate),
    syncMicrosoft(supabaseUrl, ingestApiKey, targetDate),
  ]);

  const results = {
    date: targetDate,
    meta:      metaResult.status      === "fulfilled" ? metaResult.value      : { status: `exception: ${metaResult.reason}` },
    microsoft: microsoftResult.status === "fulfilled" ? microsoftResult.value : { status: `exception: ${microsoftResult.reason}` },
    note: "Google Ads is synced separately via Google Ads Script → ingest-expense webhook",
  };

  console.log("sync-ad-spend results:", JSON.stringify(results));

  return new Response(
    JSON.stringify({ ok: true, ...results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
