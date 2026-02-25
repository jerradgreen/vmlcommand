import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Tag } from "lucide-react";
import { toast } from "sonner";
import { getParentCategories, getSubcategories, categoryLabel } from "@/lib/categoryTaxonomy";

interface Props {
  selectedIds: string[];
  onClear: () => void;
  onApplied: () => void;
}

export default function BulkLabelBar({ selectedIds, onClear, onApplied }: Props) {
  const [txnType, setTxnType] = useState("");
  const [txnCategory, setTxnCategory] = useState("");
  const [txnSubcategory, setTxnSubcategory] = useState("");
  const [vendor, setVendor] = useState("");

  const handleTypeChange = (val: string) => {
    setTxnType(val);
    setTxnCategory("");
    setTxnSubcategory("");
    if (val === "personal") {
      setTxnCategory("owner_draw");
      setTxnSubcategory("personal_spending");
    }
  };

  const handleCategoryChange = (val: string) => {
    setTxnCategory(val);
    setTxnSubcategory("");
  };

  const parentCategories = getParentCategories(txnType || null);
  const subcategories = txnCategory ? getSubcategories(txnCategory) : [];

  const applyMutation = useMutation({
    mutationFn: async () => {
      const updates: Record<string, string | null> = {};
      if (txnType) updates.txn_type = txnType;
      if (txnCategory) updates.txn_category = txnCategory;
      if (txnSubcategory) updates.txn_subcategory = txnSubcategory;
      if (vendor) updates.vendor = vendor;

      if (Object.keys(updates).length === 0) {
        throw new Error("Select at least one field to apply");
      }

      updates.classified_at = new Date().toISOString();

      const { error } = await supabase
        .from("financial_transactions")
        .update(updates)
        .in("id", selectedIds);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Updated ${selectedIds.length} transactions`);
      onClear();
      onApplied();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="border rounded-lg bg-muted/50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <Tag className="h-4 w-4" />
          {selectedIds.length} selected
        </span>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="h-4 w-4 mr-1" /> Clear
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={txnType} onValueChange={handleTypeChange}>
            <SelectTrigger className="w-[130px] h-8"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="business">Business</SelectItem>
              <SelectItem value="personal">Personal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={txnCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              {parentCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>{categoryLabel(cat)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {subcategories.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Subcategory</Label>
            <Select value={txnSubcategory} onValueChange={setTxnSubcategory}>
              <SelectTrigger className="w-[160px] h-8"><SelectValue placeholder="Subcategory" /></SelectTrigger>
              <SelectContent>
                {subcategories.map((sub) => (
                  <SelectItem key={sub} value={sub}>{categoryLabel(sub)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Vendor</Label>
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" className="w-[140px] h-8" />
        </div>
        <Button size="sm" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
          Apply to {selectedIds.length}
        </Button>
      </div>
    </div>
  );
}
