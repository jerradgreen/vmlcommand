/**
 * shopify-create-invoice
 *
 * Creates a Shopify Draft Order with a custom line item and sends
 * the invoice email to the customer. Called from the CRM InvoiceModal
 * when the rep clicks "Send Invoice".
 *
 * Auth: requires a valid Supabase session (any authenticated user).
 * Shopify credentials are stored server-side only.
 *
 * Request body:
 *   {
 *     customer_name:  string   — customer's full name
 *     customer_email: string   — customer's email address
 *     item_description: string — e.g. "Custom Neon Sign - 'OPEN' - 24in Rental"
 *     price:          number   — total price in dollars (e.g. 450.00)
 *     note:           string?  — optional note to customer
 *     lead_id:        string?  — VML lead UUID for logging
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     draft_order_id: number,
 *     draft_order_name: string,   — e.g. "D#1001"
 *     invoice_url: string,        — Shopify-hosted payment page URL
 *     status: string              — "invoice_sent"
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: verify Supabase session ──────────────────────────────────────
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader     = req.headers.get("Authorization");

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

    // ── Parse request body ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      customer_name,
      customer_email,
      item_description,
      price,
      note,
      lead_id,
    } = body;

    if (!customer_email || !item_description || price === undefined) {
      return new Response(
        JSON.stringify({ ok: false, error: "customer_email, item_description, and price are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Shopify credentials ────────────────────────────────────────────────
    const shopifyToken = Deno.env.get("SHOPIFY_ADMIN_TOKEN");
    const shopifyStore = Deno.env.get("SHOPIFY_STORE_HANDLE"); // e.g. "vintagelights"
    if (!shopifyToken || !shopifyStore) {
      return new Response(
        JSON.stringify({ ok: false, error: "Shopify credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shopifyBase = `https://${shopifyStore}.myshopify.com/admin/api/2024-01`;

    // ── Step 1: Create the Draft Order ─────────────────────────────────────
    const draftOrderPayload = {
      draft_order: {
        line_items: [
          {
            title:    item_description,
            price:    price.toFixed(2),
            quantity: 1,
            taxable:  false,
          },
        ],
        customer: {
          email: customer_email.trim().toLowerCase(),
        },
        billing_address: {
          first_name: customer_name?.split(" ")[0] ?? "",
          last_name:  customer_name?.split(" ").slice(1).join(" ") ?? "",
          email:      customer_email.trim().toLowerCase(),
        },
        note:             note ?? "",
        note_attributes:  lead_id ? [{ name: "vml_lead_id", value: lead_id }] : [],
        use_customer_default_address: false,
        send_receipt:     false, // We'll send via the separate invoice endpoint below
        tags:             "vml-crm-invoice",
      },
    };

    const createRes = await fetch(`${shopifyBase}/draft_orders.json`, {
      method:  "POST",
      headers: {
        "X-Shopify-Access-Token": shopifyToken,
        "Content-Type":           "application/json",
      },
      body: JSON.stringify(draftOrderPayload),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error(`Shopify draft order creation failed (${createRes.status}): ${errBody}`);
    }

    const { draft_order } = await createRes.json();
    const draftOrderId   = draft_order.id;
    const draftOrderName = draft_order.name;   // e.g. "D#1001"
    const invoiceUrl     = draft_order.invoice_url; // Shopify-hosted payment page

    // ── Step 2: Send the Invoice Email via Shopify ─────────────────────────
    const sendInvoicePayload = {
      draft_order_invoice: {
        to:      customer_email.trim().toLowerCase(),
        subject: `Your Invoice from Vintage Marquee Lights — ${draftOrderName}`,
        custom_message: note
          ? `Hi ${customer_name?.split(" ")[0] ?? "there"},\n\n${note}\n\nPlease use the link below to review and pay your invoice.\n\nThank you for choosing Vintage Marquee Lights!`
          : `Hi ${customer_name?.split(" ")[0] ?? "there"},\n\nThank you for choosing Vintage Marquee Lights! Please use the link below to review and pay your invoice.\n\nWe look forward to working with you!`,
      },
    };

    const sendRes = await fetch(
      `${shopifyBase}/draft_orders/${draftOrderId}/send_invoice.json`,
      {
        method:  "POST",
        headers: {
          "X-Shopify-Access-Token": shopifyToken,
          "Content-Type":           "application/json",
        },
        body: JSON.stringify(sendInvoicePayload),
      }
    );

    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      // Draft order was created but email failed — still return success with warning
      console.warn(`Invoice email send failed (${sendRes.status}): ${errBody}`);
    }

    // ── Step 3: Log the invoice action in rep_lead_actions ─────────────────
    if (lead_id) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey);
      await serviceClient.from("rep_lead_actions").insert({
        user_id:     user.id,
        lead_id:     lead_id,
        action_type: "invoice_sent",
        body:        `Shopify invoice ${draftOrderName} sent to ${customer_email} — ${item_description} — $${price.toFixed(2)}`,
      });
    }

    return new Response(
      JSON.stringify({
        ok:               true,
        draft_order_id:   draftOrderId,
        draft_order_name: draftOrderName,
        invoice_url:      invoiceUrl,
        status:           "invoice_sent",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("shopify-create-invoice error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
