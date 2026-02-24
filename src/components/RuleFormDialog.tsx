import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type RuleRow = {
  id: string;
  is_active: boolean;
  priority: number;
  match_type: string;
  match_value: string;
  match_field: string;
  assign_txn_type: string | null;
  assign_category: string | null;
  assign_vendor: string | null;
  notes: string | null;
  created_at: string;
};

interface Props {
  rule?: RuleRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  prefill?: {
    match_value?: string;
    assign_txn_type?: string;
    assign_category?: string;
    assign_vendor?: string;
  };
}

export default function RuleFormDialog({ rule, open, onOpenChange, onSaved, prefill }: Props) {
  const isEdit = !!rule;
  const [matchType, setMatchType] = useState(rule?.match_type ?? "contains");
  const [matchValue, setMatchValue] = useState(rule?.match_value ?? prefill?.match_value ?? "");
  const [matchField, setMatchField] = useState(rule?.match_field ?? "description");
  const [priority, setPriority] = useState(String(rule?.priority ?? 50));
  const [assignTxnType, setAssignTxnType] = useState(rule?.assign_txn_type ?? prefill?.assign_txn_type ?? "");
  const [assignCategory, setAssignCategory] = useState(rule?.assign_category ?? prefill?.assign_category ?? "");
  const [assignVendor, setAssignVendor] = useState(rule?.assign_vendor ?? prefill?.assign_vendor ?? "");
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [notes, setNotes] = useState(rule?.notes ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        match_type: matchType,
        match_value: matchValue,
        match_field: matchField,
        priority: parseInt(priority) || 50,
        assign_txn_type: assignTxnType || null,
        assign_category: assignCategory || null,
        assign_vendor: assignVendor || null,
        is_active: isActive,
        notes: notes || null,
        // match_value_norm is auto-set by DB trigger
      };

      if (isEdit) {
        const { error } = await supabase.from("transaction_rules").update(payload).eq("id", rule!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transaction_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Rule updated" : "Rule created");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Rule" : "Create Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Match Type</Label>
              <Select value={matchType} onValueChange={setMatchType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="starts_with">Starts With</SelectItem>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Match Field</Label>
              <Select value={matchField} onValueChange={setMatchField}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="account_name">Account Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Match Value</Label>
            <Input value={matchValue} onChange={(e) => setMatchValue(e.target.value)} placeholder="e.g. fosterweld" />
          </div>

          <div>
            <Label>Priority (lower = higher priority)</Label>
            <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Assign Type</Label>
              <Select value={assignTxnType} onValueChange={setAssignTxnType}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assign Category</Label>
              <Select value={assignCategory} onValueChange={setAssignCategory}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cogs">COGS</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="owner_draw">Owner Draw</SelectItem>
                  <SelectItem value="overhead">Overhead</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Assign Vendor</Label>
            <Input value={assignVendor} onChange={(e) => setAssignVendor(e.target.value)} placeholder="e.g. FosterWeld" />
          </div>

          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="rule-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="rule-active">Active</Label>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !matchValue} className="w-full">
            {isEdit ? "Update Rule" : "Create Rule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
