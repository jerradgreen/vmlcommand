import { Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function RepLayout() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">VML Sales</span>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-1" />
          Sign out
        </Button>
      </header>
      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
