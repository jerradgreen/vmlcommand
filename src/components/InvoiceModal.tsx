/**
 * InvoiceModal
 *
 * A two-step modal for creating and sending a Shopify invoice:
 *   Step 1 — Fill in details (description, price, optional note)
 *   Step 2 — Preview the invoice before sending
 *
 * On confirm, calls the shopify-create-invoice Edge Function.
 * On success, shows the Shopify invoice URL and logs the action.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  SendHorizonal,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface InvoiceModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lead: {
    id: string;
    name: string | null;
    email: string | null;
    phrase: string | null;
    sign_style: string | null;
    size_text: string | null;
  };
}

type Step = "form" | "preview" | "success";

export default function InvoiceModal({
  open,
  onClose,
  onSuccess,
  lead,
}: InvoiceModalProps) {
  const { toast } = useToast();

  // Build a sensible default description from lead data
  const defaultDescription = [
    lead.phrase       ? `"${lead.phrase}"` : null,
    lead.sign_style   ? lead.sign_style    : null,
    lead.size_text    ? lead.size_text     : null,
  ]
    .filter(Boolean)
    .join(" — ") || "";

  const [step, setStep]               = useState<Step>("form");
  const [description, setDescription] = useState(defaultDescription);
  const [price, setPrice]             = useState("");
  const [note, setNote]               = useState("");
  const [loading, setLoading]         = useState(false);
  const [invoiceUrl, setInvoiceUrl]   = useState<string | null>(null);
  const [draftName, setDraftName]     = useState<string | null>(null);

  const priceNum = parseFloat(price.replace(/[^0-9.]/g, ""));
  const priceValid = !isNaN(priceNum) && priceNum > 0;
  const formValid  = description.trim().length > 0 && priceValid;

  const handleClose = () => {
    // Reset state on close
    setStep("form");
    setDescription(defaultDescription);
    setPrice("");
    setNote("");
    setInvoiceUrl(null);
    setDraftName(null);
    onClose();
  };

  const handleSend = async () => {
    if (!formValid) return;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-create-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            customer_name:    lead.name ?? "",
            customer_email:   lead.email ?? "",
            item_description: description.trim(),
            price:            priceNum,
            note:             note.trim() || undefined,
            lead_id:          lead.id,
          }),
        }
      );

      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Unknown error");

      setInvoiceUrl(json.invoice_url);
      setDraftName(json.draft_order_name);
      setStep("success");
      onSuccess(); // Refresh the activity log in the parent
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Invoice failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">

        {/* ── STEP 1: Form ─────────────────────────────────────────────── */}
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-500" />
                Create Invoice
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Customer info (read-only) */}
              <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-1">
                <div><span className="text-muted-foreground">Customer:</span> <strong>{lead.name ?? "—"}</strong></div>
                <div><span className="text-muted-foreground">Email:</span> {lead.email ?? "—"}</div>
              </div>

              {/* Item description */}
              <div className="space-y-1">
                <Label htmlFor="inv-desc">Item Description <span className="text-red-500">*</span></Label>
                <Textarea
                  id="inv-desc"
                  placeholder={`e.g. Custom Neon Sign — "OPEN" — 24" Rental Package`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  This is exactly what will appear on the Shopify invoice.
                </p>
              </div>

              {/* Price */}
              <div className="space-y-1">
                <Label htmlFor="inv-price">Price (USD) <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="inv-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>

              {/* Optional note */}
              <div className="space-y-1">
                <Label htmlFor="inv-note">Note to Customer <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea
                  id="inv-note"
                  placeholder="e.g. Includes delivery and setup. Balance due before event date."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                disabled={!formValid}
                onClick={() => setStep("preview")}
              >
                Preview Invoice →
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 2: Preview ───────────────────────────────────────────── */}
        {step === "preview" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SendHorizonal className="h-5 w-5 text-blue-500" />
                Review Before Sending
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <p className="text-muted-foreground text-xs">
                Double-check everything below. Once you click "Send Invoice", Shopify will immediately email the customer a secure payment link.
              </p>

              <div className="rounded-md border divide-y text-sm">
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-medium">{lead.name} &lt;{lead.email}&gt;</span>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Item</span>
                  <span className="font-medium text-right max-w-[60%]">{description}</span>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-green-700 text-base">
                    ${priceNum.toFixed(2)}
                  </span>
                </div>
                {note.trim() && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Note</span>
                    <span className="text-right max-w-[60%]">{note}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                The customer will receive a Shopify invoice email with a secure link to pay online. You can view the invoice in your Shopify admin under <strong>Orders → Drafts</strong>.
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("form")}
                disabled={loading}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={handleSend}
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending…</>
                ) : (
                  <><SendHorizonal className="h-4 w-4 mr-1" /> Send Invoice</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── STEP 3: Success ───────────────────────────────────────────── */}
        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Invoice Sent!
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 space-y-1">
                <p className="font-medium text-green-800">
                  Shopify invoice {draftName} has been emailed to {lead.email}.
                </p>
                <p className="text-green-700 text-xs">
                  The customer received a secure payment link. This action has been logged in the activity timeline.
                </p>
              </div>

              {invoiceUrl && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Invoice payment link (for your reference):</p>
                  <a
                    href={invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary underline text-xs break-all"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    {invoiceUrl}
                  </a>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Badge variant="outline" className="text-xs">
                  Status updated → Invoice Sent
                </Badge>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
