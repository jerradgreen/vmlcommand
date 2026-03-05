import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null; // ISO date string e.g. "2026-03-04"
}

export default function TrendLeadDetailDialog({ open, onOpenChange, date }: Props) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["trend-leads-detail", date],
    queryFn: async () => {
      if (!date) return [];
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, email, phrase, cognito_form, submitted_at")
        .gte("submitted_at", date)
        .lt("submitted_at", nextDay.toISOString().slice(0, 10))
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!date,
  });

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete lead");
    } else {
      toast.success("Lead deleted");
      queryClient.invalidateQueries({ queryKey: ["trend-leads-detail", date] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["trend-data"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["matched-lead-ids"] });
    }
    setDeleting(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Leads for {date ? format(new Date(date), "MMMM d, yyyy") : ""}</DialogTitle>
          <DialogDescription>{leads?.length ?? 0} leads on this date</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground text-center py-4">Loading…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phrase</TableHead>
                <TableHead>Form</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(leads ?? []).map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {lead.submitted_at ? format(new Date(lead.submitted_at), "h:mm a") : "—"}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{lead.name || "—"}</TableCell>
                  <TableCell className="text-sm">{lead.email || "—"}</TableCell>
                  <TableCell className="max-w-[150px] truncate text-sm">{lead.phrase || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{lead.cognito_form}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(lead.id)}
                      disabled={deleting === lead.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
