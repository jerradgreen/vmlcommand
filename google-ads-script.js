/**
 * VML Command Center — Google Ads Daily Spend Sync
 * ─────────────────────────────────────────────────
 * Paste this script into Google Ads:
 *   Tools → Bulk actions → Scripts → + New script
 *
 * Set it to run on a DAILY schedule (recommended: 1:30 AM)
 *
 * What it does:
 *   1. Gets yesterday's total spend across ALL campaigns
 *   2. POSTs it to your VML Command Center ingest-expense webhook
 *   3. The dashboard automatically shows it — no manual entry needed!
 *
 * SETUP: Replace the two values below with your actual values.
 * You can find INGEST_API_KEY in your Supabase project secrets.
 */

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
var WEBHOOK_URL  = "https://nydkfniwazndbaeciopr.supabase.co/functions/v1/ingest-expense";
var INGEST_API_KEY = "PASTE_YOUR_INGEST_API_KEY_HERE"; // Get this from Supabase secrets
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  // Get yesterday's date in YYYY-MM-DD format
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var dateStr = Utilities.formatDate(yesterday, "America/Chicago", "yyyy-MM-dd");

  // Query yesterday's spend across all campaigns
  var report = AdsApp.report(
    "SELECT Cost " +
    "FROM   ACCOUNT_PERFORMANCE_REPORT " +
    "DURING " + dateStr.replace(/-/g, "") + "," + dateStr.replace(/-/g, "")
  );

  var rows = report.rows();
  var totalSpend = 0;

  while (rows.hasNext()) {
    var row = rows.next();
    var cost = parseFloat(row["Cost"].replace(/,/g, ""));
    if (!isNaN(cost)) {
      totalSpend += cost;
    }
  }

  Logger.log("Google Ads spend for " + dateStr + ": $" + totalSpend.toFixed(2));

  if (totalSpend <= 0) {
    Logger.log("Zero spend — skipping ingest.");
    return;
  }

  // Build the payload
  var payload = JSON.stringify({
    platform:    "google_ads",
    date:        dateStr,
    amount:      totalSpend,
    notes:       "Google Ads auto-sync via Ads Script — Customer ID 966-308-2347",
    external_id: "google_ads_9663082347_" + dateStr
  });

  // POST to the ingest-expense webhook
  var options = {
    method:             "post",
    contentType:        "application/json",
    headers:            { "x-api-key": INGEST_API_KEY },
    payload:            payload,
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();

  Logger.log("Ingest response (" + responseCode + "): " + responseText);

  if (responseCode === 200) {
    Logger.log("✅ Successfully synced $" + totalSpend.toFixed(2) + " for " + dateStr);
  } else {
    Logger.log("❌ Ingest failed — check the response above.");
  }
}
