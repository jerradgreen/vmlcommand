import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { AlertTriangle, Plus, Pencil, Landmark } from "lucide-react";
import { toast } from "sonner";

interface LoanRow {
  id: string;
  name: string | null;
  status: string;
  payback_cap: number;
  repayment_rate: number;
  start_order_number_int: number;
  start_date: string | null;
  created_at: string | null;
}

interface LoanFormData {
  name: string;
  status: string;
  payback_cap: string;
  repayment_rate: string;
  start_order_number_int: string;
  start_date: string;
}

const emptyForm: LoanFormData = {
  name: "Shopify Capital",
  status: "active",
  payback_cap: "",
  repayment_rate: "0.13",
  start_order_number_int: "",
  start_date: "",
};

export default function ShopifyCapitalManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LoanFormData>(emptyForm);
  const queryClient = useQueryClient();

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["shopify-capital-loans"],
    queryFn: async () => {
      const { data } = await supabase.from("shopify_capital_loans").select("*")
        .order("start_order_number_int", { ascending: true });
      return (data ?? []) as LoanRow[];
    },
  });

  const hasActiveLoan = loans.some(l => l.status === "active");

  const saveMutation = useMutation({
    mutationFn: async (formData: LoanFormData) => {
      const payload = {
        name: formData.name || "Shopify Capital",
        status: formData.status,
        payback_cap: Number(formData.payback_cap),
        repayment_rate: Number(formData.repayment_rate),
        start_order_number_int: Number(formData.start_order_number_int),
        start_date: formData.start_date || null,
      };

      if (editingId) {
        const { error } = await supabase.from("shopify_capital_loans").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shopify_capital_loans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Loan updated" : "Loan added");
      queryClient.invalidateQueries({ queryKey: ["shopify-capital-loans"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      if (err.message?.includes("one_active_shopify_capital_loan")) {
        toast.error("Only one active loan allowed. Mark the existing loan as paid_off first.");
      } else {
        toast.error(err.message || "Failed to save loan");
      }
    },
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (loan: LoanRow) => {
    setEditingId(loan.id);
    setForm({
      name: loan.name ?? "Shopify Capital",
      status: loan.status,
      payback_cap: String(loan.payback_cap),
      repayment_rate: String(loan.repayment_rate),
      start_order_number_int: String(loan.start_order_number_int),
      start_date: loan.start_date ?? "",
    });
    setDialogOpen(true);
  };

  const canSave = form.payback_cap && form.repayment_rate && form.start_order_number_int;
  const wouldConflict = !editingId && hasActiveLoan && form.status === "active";

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Shopify Capital Loans
          </CardTitle>
          <Button size="sm" variant="outline" className="gap-1" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Add Loan
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : loans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No loans configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Order #</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead className="text-right">Payback Cap</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.name ?? "Shopify Capital"}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{l.start_order_number_int}</TableCell>
                    <TableCell>{(l.repayment_rate * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-right">{formatCurrency(l.payback_cap)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(l)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Loan" : "Add Loan"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paid_off">Paid Off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Order Number (int)</Label>
              <Input type="number" value={form.start_order_number_int} onChange={(e) => setForm({ ...form, start_order_number_int: e.target.value })} placeholder="e.g. 18412" />
            </div>
            <div>
              <Label>Start Date (optional fallback)</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>Repayment Rate</Label>
              <Input type="number" step="0.01" value={form.repayment_rate} onChange={(e) => setForm({ ...form, repayment_rate: e.target.value })} placeholder="e.g. 0.13" />
            </div>
            <div>
              <Label>Payback Cap ($)</Label>
              <Input type="number" value={form.payback_cap} onChange={(e) => setForm({ ...form, payback_cap: e.target.value })} placeholder="e.g. 16650" />
            </div>

            {wouldConflict && (
              <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 rounded p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>You already have an active loan. Adding another active loan requires marking the current one as paid off first.</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={!canSave || wouldConflict || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
