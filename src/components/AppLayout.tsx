import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, ShoppingCart, Inbox, Upload, Banknote, Settings, Menu, X, LogOut, Factory, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/morning-brief", label: "Morning Brief", icon: Sun },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/sales", label: "Sales", icon: ShoppingCart },
  { to: "/attribution", label: "Attribution Inbox", icon: Inbox, badgeKey: "attribution" },
  { to: "/import", label: "Import Data", icon: Upload },
  { to: "/transactions", label: "Transactions", icon: Banknote, badgeKey: "transactions" },
  
  { to: "/cogs-reconciliation", label: "COGS Reconciliation", icon: Factory },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  const { data: unmatchedCount } = useQuery({
    queryKey: ["unmatched-sales-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("sale_type", "unknown")
        .is("lead_id", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const { data: unclassifiedCount } = useQuery({
    queryKey: ["unclassified-txn-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("financial_transactions")
        .select("id", { count: "exact", head: true })
        .is("txn_category", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const sidebarContent = (
    <>
      <div className="p-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-sidebar-primary-foreground">
            VML Command Center
          </h1>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5">Vintage Marquee Lights</p>
        </div>
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="text-sidebar-foreground">
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
      <nav className="mt-2 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.badgeKey === "attribution" && unmatchedCount != null && unmatchedCount > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground">
                {unmatchedCount}
              </span>
            )}
            {item.badgeKey === "transactions" && unclassifiedCount != null && unclassifiedCount > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground">
                {unclassifiedCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-shrink-0 z-50",
          isMobile
            ? "fixed inset-y-0 left-0 w-64 transform transition-transform duration-200 ease-in-out"
            : "w-60",
          isMobile && !sidebarOpen && "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {isMobile && (
          <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 border-b border-border bg-background px-4 py-2">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <span className="text-sm font-semibold">VML Command Center</span>
          </div>
        )}
        <div className={cn("p-4 sm:p-6 max-w-7xl mx-auto", isMobile && "pt-16")}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
