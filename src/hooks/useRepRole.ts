import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "sales_rep" | null;

export function useRepRole() {
  const [role, setRole] = useState<AppRole | undefined>(undefined);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) {
        if (!cancelled) setRole(null);
        return;
      }
      setUserId(session.user.id);

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      if (cancelled) return;

      if (data && data.length > 0) {
        // Prefer admin if they have both
        const roles = data.map((r) => r.role);
        setRole(roles.includes("admin") ? "admin" : "sales_rep");
      } else {
        // No role assigned — treat as admin (legacy users)
        setRole("admin");
      }
    };

    fetchRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRole();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { role, userId, loading: role === undefined };
}
