import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { StyleBucket } from "@/hooks/useSignStyleMetrics";

// Must match the keyword logic in useSignStyleMetrics.ts normalizeStyle
const STYLE_KEYWORDS: [StyleBucket, string[]][] = [
  ["Zaxby's", ["zaxby"]],
  ["Misc", ["misc"]],
  ["Rental Inventory Package", ["rental", "package"]],
  ["Event Style Letters", ["event"]],
  ["3D Layered Logo Sign", ["layered", "logo", "3d"]],
  ["Wall Hanging Letters", ["wall", "hanging"]],
  ["Mobile Vendors", ["mobile", "vendor"]],
];

function classifyLead(row: { sign_style: string | null; cognito_form: string | null; raw_payload: any }): StyleBucket {
  const tryMatch = (text: string | null | undefined): StyleBucket | null => {
    if (!text?.trim()) return null;
    const lower = text.toLowerCase();
    for (const [bucket, keywords] of STYLE_KEYWORDS) {
      if (keywords.some((kw) => lower.includes(kw))) return bucket;
    }
    return null;
  };

  const fromStyle = tryMatch(row.sign_style);
  if (fromStyle) return fromStyle;

  const fromForm = tryMatch(row.cognito_form);
  if (fromForm) return fromForm;

  const phraseText = [
    row.raw_payload?.["What word(s) will you spell? Or numbers?"],
    row.raw_payload?.["Message-Anything else?"],
  ].filter(Boolean).join(" ");

  if (phraseText) {
    const lower = phraseText.toLowerCase();
    if (lower.includes("marquee") && (lower.includes("rental") || lower.includes("package"))) {
      return "Rental Inventory Package";
    }
    const fromPhrase = tryMatch(phraseText);
    if (fromPhrase) return fromPhrase;
  }

  return "Unknown";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  style: StyleBucket | null;
  rangeFrom: Date | null;
  rangeTo: Date | null;
}

export default function SignStyleLeadsDialog({ open, onOpenChange, style, rangeFrom, rangeTo }: Props) {
  const { data: leads, isLoading } = useQuery({
    queryKey: ["sign-style-leads-detail", style, rangeFrom?.toISOString(), rangeTo?.toISOString()],
    queryFn: async () => {
      if (!style) return [];
      let q = supabase.from("leads").select("id, name, email, phrase, sign_style, cognito_form, submitted_at, raw_payload");
      if (rangeFrom) q = q.gte("submitted_at", rangeFrom.toISOString());
      if (rangeTo) q = q.lte("submitted_at", rangeTo.toISOString());

      const allRows: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await q.order("submitted_at", { ascending: false }).range(from, from + pageSize - 1);
        if (error) throw error;
        allRows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
        // Re-build query for next page
        q = supabase.from("leads").select("id, name, email, phrase, sign_style, cognito_form, submitted_at, raw_payload");
        if (rangeFrom) q = q.gte("submitted_at", rangeFrom.toISOString());
        if (rangeTo) q = q.lte("submitted_at", rangeTo.toISOString());
      }

      // Filter client-side to match the style bucket
      return allRows.filter((row) => classifyLead(row) === style);
    },
    enabled: open && !!style,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{style} — Leads</DialogTitle>
          <DialogDescription>{leads?.length ?? 0} leads in this category</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phrase</TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Sign Style</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(leads ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leads found</TableCell>
                </TableRow>
              ) : (
                (leads ?? []).map((lead: any) => (
                  <TableRow key={lead.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {lead.submitted_at ? format(new Date(lead.submitted_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[120px] truncate">{lead.name || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate">{lead.email || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{lead.phrase || "—"}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{lead.cognito_form}</Badge></TableCell>
                    <TableCell className="text-xs">{lead.sign_style || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
