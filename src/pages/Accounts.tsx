import { Plus, Building2, Wallet, CreditCard, PiggyBank, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  type: "bank" | "wallet" | "credit" | "savings";
  currentBalance: number;
  projectedBalance: number;
  color: string;
  icon: string;
}

const accounts: Account[] = [
  {
    id: "1",
    name: "Itaú",
    type: "bank",
    currentBalance: 5450.0,
    projectedBalance: 4200.0,
    color: "from-orange-500 to-orange-600",
    icon: "🏦",
  },
  {
    id: "2",
    name: "Nubank",
    type: "bank",
    currentBalance: 3200.0,
    projectedBalance: 2800.0,
    color: "from-purple-500 to-purple-600",
    icon: "💜",
  },
  {
    id: "3",
    name: "Carteira",
    type: "wallet",
    currentBalance: 350.0,
    projectedBalance: 350.0,
    color: "from-green-500 to-green-600",
    icon: "👛",
  },
  {
    id: "4",
    name: "Bradesco",
    type: "bank",
    currentBalance: 2100.0,
    projectedBalance: 1500.0,
    color: "from-red-500 to-red-600",
    icon: "🏧",
  },
  {
    id: "5",
    name: "Poupança",
    type: "savings",
    currentBalance: 8500.0,
    projectedBalance: 9000.0,
    color: "from-blue-500 to-blue-600",
    icon: "🐷",
  },
];

const iconComponents = {
  bank: Building2,
  wallet: Wallet,
  credit: CreditCard,
  savings: PiggyBank,
};

function AccountCard({ account }: { account: Account }) {
  const Icon = iconComponents[account.type];

  return (
    <div className="bg-card rounded-xl border border-border shadow-card hover:shadow-card-hover transition-all duration-300 overflow-hidden animate-scale-in">
      {/* Card Header with Gradient */}
      <div className={cn("bg-gradient-to-r p-4", account.color)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
              <span className="text-xl">{account.icon}</span>
            </div>
            <div>
              <h3 className="font-semibold text-white">{account.name}</h3>
              <p className="text-xs text-white/80 capitalize">{account.type === "bank" ? "Conta Corrente" : account.type === "wallet" ? "Carteira" : account.type === "savings" ? "Poupança" : "Crédito"}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Editar</DropdownMenuItem>
              <DropdownMenuItem>Ver extrato</DropdownMenuItem>
              <DropdownMenuItem className="text-expense">Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Saldo Atual</p>
          <p className={cn("text-xl font-bold", account.currentBalance >= 0 ? "text-foreground" : "text-expense")}>
            R$ {account.currentBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Saldo Previsto</p>
          <p className={cn("text-sm font-medium", account.projectedBalance >= 0 ? "text-income" : "text-expense")}>
            R$ {account.projectedBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Accounts() {
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contas</h1>
          <p className="text-muted-foreground">Gerencie suas contas bancárias e carteiras</p>
        </div>
        <Button className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      {/* Total Balance Card */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Saldo Total</p>
            <p className="text-3xl font-bold text-foreground">
              R$ {totalBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl gradient-balance flex items-center justify-center">
            <Wallet className="h-6 w-6 text-balance-foreground" />
          </div>
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </div>
  );
}
