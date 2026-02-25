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
import { getParentCategories, getSubcategories, categoryLabel } from "@/lib/categoryTaxonomy";

type RuleRow = {
  id: string;
  is_active: boolean;
  priority: number;
  match_type: string;
  match_value: string;
  match_field: string;
  assign_txn_type: string | null;
  assign_category: string | null;
  assign_subcategory?: string | null;
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
    match_field?: string;
    assign_txn_type?: string;
    assign_category?: string;
    assign_subcategory?: string;
    assign_vendor?: string;
    source_description?: string;
  };
}

export default function RuleFormDialog({ rule, open, onOpenChange, onSaved, prefill }: Props) {
  const isEdit = !!rule;
  const [matchType, setMatchType] = useState(rule?.match_type ?? "contains");
  const [matchValue, setMatchValue] = useState(rule?.match_value ?? (prefill?.match_field === "word" ? "" : (prefill?.match_value ?? "")));
  const [matchField, setMatchField] = useState(rule?.match_field ?? prefill?.match_field ?? "description");

  const handleMatchFieldChange = (val: string) => {
    setMatchField(val);
    if (val === "word") {
      setMatchValue("");
    } else if (val === "description" && prefill?.source_description) {
      setMatchValue(prefill.source_description);
    }
  };
  const [priority, setPriority] = useState(String(rule?.priority ?? 50));
  const [assignTxnType, setAssignTxnType] = useState(rule?.assign_txn_type ?? prefill?.assign_txn_type ?? "");
  const [assignCategory, setAssignCategory] = useState(rule?.assign_category ?? prefill?.assign_category ?? "");
  const [assignSubcategory, setAssignSubcategory] = useState(rule?.assign_subcategory ?? prefill?.assign_subcategory ?? "");
  const [assignVendor, setAssignVendor] = useState(rule?.assign_vendor ?? prefill?.assign_vendor ?? "");
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [notes, setNotes] = useState(rule?.notes ?? "");

  const handleTypeChange = (val: string) => {
    setAssignTxnType(val);
    setAssignCategory("");
    setAssignSubcategory("");
  };

  const handleCategoryChange = (val: string) => {
    setAssignCategory(val);
    setAssignSubcategory("");
  };

  const parentCategories = getParentCategories(assignTxnType || null);
  const subcategories = assignCategory ? getSubcategories(assignCategory) : [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const saveField = matchField === "word" ? "description" : matchField;
      const saveMatchType = matchField === "word" ? "contains" : matchType;
      const payload = {
        match_type: saveMatchType,
        match_value: matchValue,
        match_field: saveField,
        priority: parseInt(priority) || 50,
        assign_txn_type: assignTxnType || null,
        assign_category: assignCategory || null,
        assign_subcategory: assignSubcategory || null,
        assign_vendor: assignVendor || null,
        is_active: isActive,
        notes: notes || null,
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
              <Select value={matchField} onValueChange={handleMatchFieldChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="account_name">Account Name</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="word">Word (keyword in description)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {prefill?.source_description && (
            <div className="rounded-md bg-muted p-3">
              <Label className="text-xs text-muted-foreground">Original Description</Label>
              <p className="text-sm mt-1 break-words">{prefill.source_description}</p>
            </div>
          )}

          <div>
            <Label>{matchField === "word" ? "Keyword" : "Match Value"}</Label>
            <Input value={matchValue} onChange={(e) => setMatchValue(e.target.value)} placeholder={matchField === "word" ? "e.g. Chase, Shell, Facebook" : "e.g. fosterweld"} />
          </div>

          <div>
            <Label>Priority (lower = higher priority)</Label>
            <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>

          <div>
            <Label>Assign Type</Label>
            <Select value={assignTxnType} onValueChange={handleTypeChange}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Assign Category</Label>
            <Select value={assignCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {parentCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{categoryLabel(cat)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {subcategories.length > 0 && (
            <div>
              <Label>Assign Subcategory <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={assignSubcategory} onValueChange={setAssignSubcategory}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {subcategories.map((sub) => (
                    <SelectItem key={sub} value={sub}>{categoryLabel(sub)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
