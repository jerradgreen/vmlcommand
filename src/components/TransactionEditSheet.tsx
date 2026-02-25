import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import RuleFormDialog from "./RuleFormDialog";
import { getParentCategories, getSubcategories, categoryLabel } from "@/lib/categoryTaxonomy";

type TransactionRow = {
  id: string;
  txn_date: string;
  description: string | null;
  amount: number;
  account_name: string | null;
  txn_type: string | null;
  txn_category: string | null;
  txn_subcategory?: string | null;
  vendor: string | null;
  is_locked: boolean;
  rule_id_applied: string | null;
  classified_at: string | null;
};

interface Props {
  transaction: TransactionRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function TransactionEditSheet({ transaction, open, onOpenChange, onSaved }: Props) {
  const [txnType, setTxnType] = useState(transaction.txn_type ?? "");
  const [txnCategory, setTxnCategory] = useState(transaction.txn_category ?? "");
  const [txnSubcategory, setTxnSubcategory] = useState(transaction.txn_subcategory ?? "");
  const [vendor, setVendor] = useState(transaction.vendor ?? "");
  const [isLocked, setIsLocked] = useState(transaction.is_locked);
  const [showRuleDialog, setShowRuleDialog] = useState(false);

  const handleTypeChange = (val: string) => {
    setTxnType(val);
    // Reset category/subcategory when type changes
    setTxnCategory("");
    setTxnSubcategory("");
    if (val === "personal") {
      setTxnCategory("owner_draw");
    }
  };

  const handleCategoryChange = (val: string) => {
    setTxnCategory(val);
    setTxnSubcategory(""); // Reset subcategory when parent changes
  };

  const parentCategories = getParentCategories(txnType || null);
  const subcategories = txnCategory ? getSubcategories(txnCategory) : [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("financial_transactions")
        .update({
          txn_type: txnType || null,
          txn_category: txnCategory || null,
          txn_subcategory: txnSubcategory || null,
          vendor: vendor || null,
          is_locked: isLocked,
          classified_at: new Date().toISOString(),
        })
        .eq("id", transaction.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction updated");
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Transaction</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <p className="text-sm font-medium mt-1">{transaction.description ?? "—"}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Date</Label>
                <p className="text-sm mt-1">{transaction.txn_date}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Amount</Label>
                <p className="text-sm font-mono mt-1">${Math.abs(transaction.amount).toFixed(2)}</p>
              </div>
            </div>

            <div>
              <Label>Type</Label>
              <Select value={txnType} onValueChange={handleTypeChange}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Category</Label>
              <Select value={txnCategory} onValueChange={handleCategoryChange}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {parentCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{categoryLabel(cat)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {subcategories.length > 0 && (
              <div>
                <Label>Subcategory <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Select value={txnSubcategory} onValueChange={setTxnSubcategory}>
                  <SelectTrigger><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                  <SelectContent>
                    {subcategories.map((sub) => (
                      <SelectItem key={sub} value={sub}>{categoryLabel(sub)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Vendor</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. FosterWeld" />
            </div>

            <div className="flex items-center gap-2">
              <Switch id="locked" checked={isLocked} onCheckedChange={setIsLocked} />
              <Label htmlFor="locked">Lock (prevent rule overwrite)</Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="flex-1">
                Save
              </Button>
              <Button variant="outline" onClick={() => setShowRuleDialog(true)}>
                Create Rule
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {showRuleDialog && (
        <RuleFormDialog
          open={showRuleDialog}
          onOpenChange={setShowRuleDialog}
          onSaved={() => setShowRuleDialog(false)}
          prefill={{
            match_value: transaction.description ?? "",
            match_field: "word",
            source_description: transaction.description ?? "",
            assign_txn_type: txnType || undefined,
            assign_category: txnCategory || undefined,
            assign_subcategory: txnSubcategory || undefined,
            assign_vendor: vendor || undefined,
          }}
        />
      )}
    </>
  );
}
