-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Schedule nightly ad spend sync via pg_cron
--
-- Runs the sync-ad-spend Edge Function every night at 1:00 AM Central Time
-- (07:00 UTC, which covers both CST UTC-6 and CDT UTC-5 conservatively).
--
-- The function pulls yesterday's spend from:
--   • Meta Ads (Facebook/Instagram)  — direct API
--   • Microsoft Ads (Bing)           — SOAP Reporting API
--   • Google Ads                     — via Google Ads Script webhook (separate)
--
-- All results are upserted into the `expenses` table via ingest-expense,
-- so there is zero risk of duplicate entries.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_cron extension if not already enabled
create extension if not exists pg_cron with schema extensions;

-- Grant usage to postgres role
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Remove any existing ad spend sync job (idempotent)
select cron.unschedule('sync-ad-spend-nightly')
where exists (
  select 1 from cron.job where jobname = 'sync-ad-spend-nightly'
);

-- Schedule: every day at 07:00 UTC (1:00 AM CST / 2:00 AM CDT)
select cron.schedule(
  'sync-ad-spend-nightly',
  '0 7 * * *',
  $$
  select
    net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/sync-ad-spend',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-api-key',    current_setting('app.ingest_api_key')
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Note: After applying this migration, set these Supabase app settings:
--   app.supabase_url  = https://nydkfniwazndbaeciopr.supabase.co
--   app.ingest_api_key = <your INGEST_API_KEY secret value>
--
-- Or alternatively, trigger the function via Supabase's built-in
-- Edge Function scheduler in the dashboard (Settings → Edge Functions → Schedule)
-- which does not require pg_cron app settings.
-- ─────────────────────────────────────────────────────────────────────────────
