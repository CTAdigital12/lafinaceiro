import { useState } from "react";
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
import { useCreditCards, CreditCard as CreditCardType } from "@/hooks/useCreditCards";
import { NewCreditCardModal } from "@/components/modals/NewCreditCardModal";

const statusConfig = {
  open: { label: "Fatura Aberta", variant: "default" as const, className: "bg-balance text-balance-foreground" },
  closed: { label: "Fatura Fechada", variant: "secondary" as const, className: "bg-expense/10 text-expense" },
  paid: { label: "Paga", variant: "secondary" as const, className: "bg-income/10 text-income" },
};

function CreditCardComponent({ card, onDelete }: { card: CreditCardType; onDelete: () => void }) {
  const availableLimit = Number(card.credit_limit) - Number(card.current_invoice);
  const usagePercent = (Number(card.current_invoice) / Number(card.credit_limit)) * 100;
  const status = statusConfig[card.status as keyof typeof statusConfig] || statusConfig.open;

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
                <DropdownMenuItem className="text-expense" onClick={onDelete}>Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Card Number */}
          <div className="flex items-center gap-3 text-xl tracking-widest">
            <span className="opacity-50">••••</span>
            <span className="opacity-50">••••</span>
            <span className="opacity-50">••••</span>
            <span>{card.last_digits}</span>
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
              R$ {Number(card.current_invoice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Limite Disponível</p>
            <p className="text-lg font-semibold text-income">
              R$ {availableLimit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
              <p className="text-sm font-medium">Dia {card.due_date}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Fechamento</p>
              <p className="text-sm font-medium">Dia {card.closing_date}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreditCards() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { creditCards, isLoading, totalInvoice, totalLimit, totalAvailable, deleteCreditCard } = useCreditCards();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cartões de Crédito</h1>
          <p className="text-muted-foreground">Gerencie seus cartões e faturas</p>
        </div>
        <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setIsModalOpen(true)}>
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
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando cartões...</div>
      ) : creditCards.length === 0 ? (
        <div className="text-center py-12">
          <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Nenhum cartão cadastrado</h3>
          <p className="text-muted-foreground mb-4">Adicione seu primeiro cartão de crédito</p>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cartão
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {creditCards.map((card) => (
            <CreditCardComponent 
              key={card.id} 
              card={card} 
              onDelete={() => deleteCreditCard.mutate(card.id)}
            />
          ))}
        </div>
      )}

      <NewCreditCardModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </div>
  );
}
