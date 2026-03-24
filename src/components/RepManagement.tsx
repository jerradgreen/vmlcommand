import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users } from "lucide-react";

const SIGN_STYLES = [
  "Rental Inventory Package",
  "Wall Hanging",
  "Layered/Logo",
  "Mobile Vendor",
  "Event Style",
  "Marquee Letters",
  "Custom",
];

interface Rep {
  id: string;
  email: string;
  created_at: string;
  styles: string[];
}

export default function RepManagement() {
  const [reps, setReps] = useState<Rep[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const callManageRep = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-rep`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      }
    );
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  };

  const fetchReps = async () => {
    try {
      const data = await callManageRep({ action: "list_reps" });
      setReps(data.reps || []);
    } catch (err: any) {
      console.error("Failed to fetch reps:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Bootstrap admin role on first load
    callManageRep({ action: "bootstrap_admin" }).catch(() => {});
    fetchReps();
  }, []);

  const handleCreateRep = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await callManageRep({ action: "create_rep", email: newEmail, password: newPassword });
      toast({ title: "Rep account created" });
      setNewEmail("");
      setNewPassword("");
      fetchReps();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const toggleStyle = async (repId: string, style: string, currentlyEnabled: boolean) => {
    try {
      await callManageRep({
        action: "toggle_style",
        rep_user_id: repId,
        sign_style: style,
        enabled: !currentlyEnabled,
      });
      fetchReps();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Create Sales Rep
          </CardTitle>
          <CardDescription>Create a new account for a sales rep. They'll only see the CRM page.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateRep} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="rep-email" className="text-xs">Email</Label>
              <Input
                id="rep-email"
                type="email"
                placeholder="rep@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="rep-pass" className="text-xs">Temporary Password</Label>
              <Input
                id="rep-pass"
                type="text"
                placeholder="temp-password-123"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" disabled={creating} className="self-end">
              {creating ? "Creating…" : "Create Rep"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Sales Reps & Style Access
          </CardTitle>
          <CardDescription>Toggle which sign styles each rep can see in their CRM.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : reps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales reps created yet.</p>
          ) : (
            <div className="space-y-4">
              {reps.map((rep) => (
                <div key={rep.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{rep.email}</span>
                    <Badge variant="outline" className="text-xs">sales_rep</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {SIGN_STYLES.map((style) => {
                      const enabled = rep.styles.includes(style);
                      return (
                        <div key={style} className="flex items-center gap-2">
                          <Switch
                            checked={enabled}
                            onCheckedChange={() => toggleStyle(rep.id, style, enabled)}
                          />
                          <span className="text-xs">{style}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
