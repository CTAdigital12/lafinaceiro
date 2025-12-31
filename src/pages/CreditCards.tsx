import { Plus, CreditCard, Calendar, Wallet, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface CreditCardData {
  id: string;
  name: string;
  lastDigits: string;
  brand: string;
  currentInvoice: number;
  limit: number;
  availableLimit: number;
  dueDate: string;
  closingDate: string;
  status: "open" | "closed" | "paid";
  color: string;
}

const creditCards: CreditCardData[] = [
  {
    id: "1",
    name: "Nubank",
    lastDigits: "4523",
    brand: "Mastercard",
    currentInvoice: 1850.0,
    limit: 8000.0,
    availableLimit: 6150.0,
    dueDate: "2024-02-10",
    closingDate: "2024-02-03",
    status: "open",
    color: "from-purple-500 via-purple-600 to-purple-700",
  },
  {
    id: "2",
    name: "Itaú Platinum",
    lastDigits: "8891",
    brand: "Visa",
    currentInvoice: 3200.0,
    limit: 12000.0,
    availableLimit: 8800.0,
    dueDate: "2024-02-15",
    closingDate: "2024-02-08",
    status: "closed",
    color: "from-orange-500 via-orange-600 to-amber-600",
  },
  {
    id: "3",
    name: "Inter Black",
    lastDigits: "2156",
    brand: "Mastercard",
    currentInvoice: 0,
    limit: 5000.0,
    availableLimit: 5000.0,
    dueDate: "2024-02-20",
    closingDate: "2024-02-13",
    status: "paid",
    color: "from-gray-800 via-gray-900 to-black",
  },
];

const statusConfig = {
  open: { label: "Fatura Aberta", variant: "default" as const, className: "bg-balance text-balance-foreground" },
  closed: { label: "Fatura Fechada", variant: "secondary" as const, className: "bg-expense/10 text-expense" },
  paid: { label: "Paga", variant: "secondary" as const, className: "bg-income/10 text-income" },
};

function CreditCardComponent({ card }: { card: CreditCardData }) {
  const usagePercent = ((card.limit - card.availableLimit) / card.limit) * 100;
  const status = statusConfig[card.status];

  return (
    <div className="space-y-4 animate-scale-in">
      {/* Card Visual */}
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl p-6 text-white shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1",
          "bg-gradient-to-br",
          card.color
        )}
        style={{ aspectRatio: "1.586/1", maxWidth: "380px" }}
      >
        {/* Card Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white" />
          <div className="absolute -left-6 -bottom-6 h-32 w-32 rounded-full bg-white" />
        </div>

        <div className="relative h-full flex flex-col justify-between">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80">{card.brand}</p>
              <p className="text-lg font-semibold">{card.name}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Ver fatura</DropdownMenuItem>
                <DropdownMenuItem>Editar</DropdownMenuItem>
                <DropdownMenuItem className="text-expense">Bloquear</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Card Number */}
          <div className="flex items-center gap-3 text-xl tracking-widest">
            <span className="opacity-50">••••</span>
            <span className="opacity-50">••••</span>
            <span className="opacity-50">••••</span>
            <span>{card.lastDigits}</span>
          </div>

          {/* Footer */}
          <div className="flex items-end justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-8 w-8" />
            </div>
            <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
          </div>
        </div>
      </div>

      {/* Card Details */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-card space-y-4">
        {/* Invoice */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Fatura Atual</p>
            <p className="text-xl font-bold text-foreground">
              R$ {card.currentInvoice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Limite Disponível</p>
            <p className="text-lg font-semibold text-income">
              R$ {card.availableLimit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Usage Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Limite utilizado</span>
            <span className="font-medium">{usagePercent.toFixed(0)}%</span>
          </div>
          <Progress
            value={usagePercent}
            className={cn(
              "h-2",
              usagePercent > 80 ? "[&>div]:bg-expense" : usagePercent > 50 ? "[&>div]:bg-chart-4" : "[&>div]:bg-income"
            )}
          />
        </div>

        {/* Dates */}
        <div className="flex items-center gap-4 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Vencimento</p>
              <p className="text-sm font-medium">
                {new Date(card.dueDate).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Fechamento</p>
              <p className="text-sm font-medium">
                {new Date(card.closingDate).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreditCards() {
  const totalInvoice = creditCards.reduce((sum, card) => sum + card.currentInvoice, 0);
  const totalLimit = creditCards.reduce((sum, card) => sum + card.limit, 0);
  const totalAvailable = creditCards.reduce((sum, card) => sum + card.availableLimit, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cartões de Crédito</h1>
          <p className="text-muted-foreground">Gerencie seus cartões e faturas</p>
        </div>
        <Button className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Novo Cartão
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-expense flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-expense-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total em Faturas</p>
              <p className="text-lg font-bold text-foreground">
                R$ {totalInvoice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-balance flex items-center justify-center">
              <Wallet className="h-5 w-5 text-balance-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Limite Total</p>
              <p className="text-lg font-bold text-foreground">
                R$ {totalLimit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-income flex items-center justify-center">
              <Wallet className="h-5 w-5 text-income-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Limite Disponível</p>
              <p className="text-lg font-bold text-income">
                R$ {totalAvailable.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Credit Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {creditCards.map((card) => (
          <CreditCardComponent key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
