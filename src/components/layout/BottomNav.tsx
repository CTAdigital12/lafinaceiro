import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, List, Plus, CreditCard, Menu, LogOut, TrendingUp, Wallet, Tag, Calculator, FileText, Building2, Receipt, Settings, Layers, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { TransactionModal } from "@/components/modals/TransactionModal";

interface NavItemWithPath {
  icon: LucideIcon;
  label: string;
  path: string;
}

interface NavItemWithAction {
  icon: LucideIcon;
  label: string;
  action: "openSheet";
}

interface NavItemAction {
  type: "action";
}

type NavItem = NavItemWithPath | NavItemWithAction | NavItemAction;

const mainNavItems: NavItem[] = [
  { icon: Home, label: "Home", path: "/" },
  { icon: List, label: "Extrato", path: "/transactions" },
  { type: "action" },
  { icon: CreditCard, label: "Cartões", path: "/credit-cards" },
  { icon: Menu, label: "Mais", action: "openSheet" },
];

const secondaryNavItems: NavItemWithPath[] = [
  { icon: TrendingUp, label: "Investimentos", path: "/investments" },
  { icon: Wallet, label: "Contas", path: "/accounts" },
  { icon: Tag, label: "Categorias", path: "/categories" },
  { icon: Layers, label: "Regras", path: "/categorization-rules" },
  { icon: Calculator, label: "Planejamento", path: "/planning" },
  { icon: FileText, label: "Relatórios", path: "/reports" },
  { icon: Building2, label: "Despesas Empresa", path: "/corporate-expenses" },
  { icon: Receipt, label: "Reembolsos", path: "/reimbursements" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

function isActionItem(item: NavItem): item is NavItemAction {
  return "type" in item && item.type === "action";
}

function hasPath(item: NavItem): item is NavItemWithPath {
  return "path" in item;
}

function hasAction(item: NavItem): item is NavItemWithAction {
  return "action" in item;
}

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const handleNavClick = (item: NavItem) => {
    if (hasAction(item)) {
      setSheetOpen(true);
    } else if (hasPath(item)) {
      navigate(item.path);
    }
  };

  const handleSecondaryNavClick = (path: string) => {
    navigate(path);
    setSheetOpen(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setSheetOpen(false);
  };

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border">
        <div className="flex items-center justify-around h-16 px-2 pb-safe">
          {mainNavItems.map((item, index) => {
            // Central FAB button
            if (isActionItem(item)) {
              return (
                <button
                  key="fab"
                  onClick={() => setTransactionModalOpen(true)}
                  className="relative -mt-6 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
                  aria-label="Nova transação"
                >
                  <Plus className="h-6 w-6" />
                </button>
              );
            }

            // Regular nav items (with icon and label)
            const Icon = item.icon;
            const active = hasPath(item) ? isActive(item.path) : false;

            return (
              <button
                key={index}
                onClick={() => handleNavClick(item)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors",
                  "active:bg-muted/50",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                aria-label={item.label}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* "Mais" Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
          <SheetHeader className="pb-4">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="grid gap-1 overflow-y-auto pb-8">
            {secondaryNavItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => handleSecondaryNavClick(item.path)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                    "active:bg-muted/50",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-muted/50"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            
            <Separator className="my-3" />
            
            <Button
              variant="ghost"
              className="flex items-center gap-3 px-4 py-3 h-auto justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleSignOut}
            >
              <LogOut className="h-5 w-5" />
              <span>Sair</span>
            </Button>
          </nav>
        </SheetContent>
      </Sheet>

      {/* Transaction Modal */}
      <TransactionModal
        open={transactionModalOpen}
        onOpenChange={setTransactionModalOpen}
      />
    </>
  );
}
