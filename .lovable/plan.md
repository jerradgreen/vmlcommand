

## Plan: Add TextMagic SMS Alert to Lead Ingestion

### What You'll Get
Every time a quote request form is submitted, you'll get an instant text message with the lead's name, phone number, what they want (phrase), sign style, size, budget, and which form they submitted through. This way you can call them back within minutes.

### What Needs to Happen

**1. Add 3 secrets to this project**

You'll need to copy these from your Bin Blaster TextMagic setup:
- `TEXTMAGIC_USERNAME` — your TextMagic account username
- `TEXTMAGIC_API_KEY` — your TextMagic API key
- `ALERT_PHONE` — your personal phone number to receive the alerts (E.164 format, e.g. `+18431234567`)

We do NOT need `TEXTMAGIC_FROM` separately — we'll use `ALERT_PHONE` as the destination and your TextMagic number will be hardcoded or pulled from Bin Blaster's config.

Actually, we DO need `TEXTMAGIC_FROM` (the TextMagic sender number). So 4 secrets total.

**2. Update `supabase/functions/ingest-lead/index.ts`**

After the lead is successfully upserted (line 70), add a fire-and-forget SMS block:
- Read `TEXTMAGIC_USERNAME`, `TEXTMAGIC_API_KEY`, `TEXTMAGIC_FROM`, and `ALERT_PHONE` from env
- If all are present, send a POST to `https://rest.textmagic.com/api/v2/messages` with:
  - `text`: formatted message with lead name, phone, phrase, sign style, size, budget, form
  - `phones`: `ALERT_PHONE` (stripped of leading `+`)
  - `from`: `TEXTMAGIC_FROM` (stripped of leading `+`)
- Wrapped in try/catch so SMS failure never blocks lead ingestion
- Log success/failure to console only (no DB logging needed for alerts)

**3. Redeploy the `ingest-lead` edge function**

### SMS Message Format
```
🔔 NEW LEAD
Name: John Smith
Phone: (843) 555-1234
Wants: "Happy Birthday Sarah"
Style: Wall Hanging
Size: 24"
Budget: $200-400
Form: general_quote
```

### Important Notes
- Same TextMagic account as Bin Blaster — messages will come from the same number, but the content is clearly about leads, not bin cleaning
- SMS costs are whatever your existing TextMagic per-message rate is (typically ~$0.04/text)
- If any TextMagic secret is missing, the lead still saves normally — just no text alert

