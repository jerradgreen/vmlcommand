import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthGuard from "./components/AuthGuard";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Sales from "./pages/Sales";
import Attribution from "./pages/Attribution";
import Import from "./pages/Import";
import Settings from "./pages/Settings";
import Transactions from "./pages/Transactions";
import Reconciliation from "./pages/Reconciliation";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/attribution" element={<Attribution />} />
            <Route path="/import" element={<Import />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
