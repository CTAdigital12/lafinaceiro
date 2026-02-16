import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CreditCard,
  Target,
  BarChart3,
  Settings,
  Menu,
  Tags,
  Briefcase,
  TrendingUp,
  BookMarked,
  ReceiptText,
  History,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/config/version";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: Wallet, label: "Contas", path: "/accounts" },
  { icon: ArrowLeftRight, label: "Transações", path: "/transactions" },
  { icon: CreditCard, label: "Cartões de Crédito", path: "/credit-cards" },
  { icon: Tags, label: "Categorias", path: "/categories" },
  { icon: BookMarked, label: "Regras", path: "/categorization-rules" },
  { icon: RefreshCw, label: "Recorrências", path: "/recurring" },
  { icon: Target, label: "Planejamento", path: "/planning" },
  { icon: TrendingUp, label: "Investimentos", path: "/investments" },
  { icon: BarChart3, label: "Relatórios", path: "/reports" },
  { icon: Briefcase, label: "Despesas Empresa", path: "/corporate-expenses" },
  { icon: ReceiptText, label: "Reembolsos", path: "/reimbursements" },
  { icon: History, label: "Atividades", path: "/activities" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg gradient-balance flex items-center justify-center">
                <Wallet className="h-4 w-4 text-balance-foreground" />
              </div>
              <span className="font-bold text-lg text-sidebar-primary">FinançasPro</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 text-sidebar-foreground hover:text-sidebar-primary hover:bg-sidebar-accent"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-balance")} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3">
          {!collapsed && (
            <div className="rounded-lg bg-sidebar-accent p-3">
              <p className="text-xs font-medium text-sidebar-primary">Versão {APP_VERSION.display}</p>
              <p className="text-xs text-sidebar-foreground">Build {APP_VERSION.buildTime}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
