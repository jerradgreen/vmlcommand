import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Users, ShoppingCart, Inbox, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/sales", label: "Sales", icon: ShoppingCart },
  { to: "/attribution", label: "Attribution Inbox", icon: Inbox },
  { to: "/import", label: "Import Data", icon: Upload },
];

export default function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 flex-shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="p-5">
          <h1 className="text-lg font-bold tracking-tight text-sidebar-primary-foreground">
            VML Command Center
          </h1>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5">Vintage Marquee Lights</p>
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
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
