import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DateProvider } from "@/contexts/DateContext";
import { MainLayout } from "@/components/layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Transactions from "./pages/Transactions";
import CreditCards from "./pages/CreditCards";
import Categories from "./pages/Categories";
import Planning from "./pages/Planning";
import Reports from "./pages/Reports";
import CorporateExpenses from "./pages/CorporateExpenses";
import Reimbursements from "./pages/Reimbursements";
import Investments from "./pages/Investments";
import CategorizationRules from "./pages/CategorizationRules";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <DateProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                path="/*"
                element={
                  <MainLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/accounts" element={<Accounts />} />
                      <Route path="/transactions" element={<Transactions />} />
                      <Route path="/credit-cards" element={<CreditCards />} />
                      <Route path="/categories" element={<Categories />} />
                      <Route path="/planning" element={<Planning />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/corporate-expenses" element={<CorporateExpenses />} />
                      <Route path="/reimbursements" element={<Reimbursements />} />
                      <Route path="/investments" element={<Investments />} />
                      <Route path="/categorization-rules" element={<CategorizationRules />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </MainLayout>
                }
              />
            </Routes>
          </DateProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
