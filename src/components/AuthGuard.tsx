import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useRepRole } from "@/hooks/useRepRole";

export default function AuthGuard({ children, requiredRole }: { children: React.ReactNode; requiredRole?: "admin" | "sales_rep" }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const { role, loading: roleLoading } = useRepRole();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined || roleLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Role-based redirects
  if (role === "sales_rep" && requiredRole === "admin") {
    return <Navigate to="/crm" replace />;
  }

  // Allow admin to access CRM route too (no redirect needed)

  return <>{children}</>;
}
