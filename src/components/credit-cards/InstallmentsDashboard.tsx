import { AlertTriangle, Calendar, Clock, CreditCard, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePendingInstallments, PendingInstallment } from "@/hooks/usePendingInstallments";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

function InstallmentAlert({ installment }: { installment: PendingInstallment }) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border transition-all",
      installment.is_near_closing 
        ? "bg-amber-500/10 border-amber-500/30" 
        : "bg-card border-border"
    )}>
      <div className={cn(
        "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
        installment.is_near_closing ? "bg-amber-500/20" : "bg-muted"
      )}>
        {installment.category_icon ? (
          <span className="text-lg">{installment.category_icon}</span>
        ) : (
          <CreditCard className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{installment.description}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{installment.credit_card_name}</span>
          <span>•</span>
          <span>{format(parse(installment.date, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")}</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-expense">
          R$ {installment.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </p>
        {installment.is_near_closing && (
          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {installment.days_until_closing}d
          </Badge>
        )}
      </div>
    </div>
  );
}

function MonthlyBreakdown({ byMonth }: { byMonth: { month: string; amount: number; count: number }[] }) {
  const maxAmount = Math.max(...byMonth.map((m) => m.amount), 1);
  
  return (
    <div className="space-y-3">
      {byMonth.slice(0, 6).map((monthData) => {
        const date = parse(monthData.month, "yyyy-MM", new Date());
        const monthLabel = format(date, "MMM/yy", { locale: ptBR });
        const percentage = (monthData.amount / maxAmount) * 100;
        
        return (
          <div key={monthData.month} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium capitalize">{monthLabel}</span>
              <span className="text-muted-foreground">
                {monthData.count} parcela{monthData.count !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={percentage} className="flex-1 h-2" />
              <span className="text-sm font-semibold w-24 text-right">
                R$ {monthData.amount.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardBreakdown({ byCreditCard }: { byCreditCard: { id: string; name: string; color: string; amount: number; count: number }[] }) {
  const maxAmount = Math.max(...byCreditCard.map((c) => c.amount), 1);
  
  return (
    <div className="space-y-3">
      {byCreditCard.map((card) => {
        const percentage = (card.amount / maxAmount) * 100;
        
        return (
          <div key={card.id} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={cn("h-3 w-3 rounded-full bg-gradient-to-br", card.color)} />
                <span className="font-medium">{card.name}</span>
              </div>
              <span className="text-muted-foreground">
                {card.count} parcela{card.count !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={percentage} className="flex-1 h-2" />
              <span className="text-sm font-semibold w-24 text-right">
                R$ {card.amount.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InstallmentsDashboard() {
  const { pendingInstallments, isLoading, summary, nearClosingInstallments } = usePendingInstallments();

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Carregando parcelas...
      </div>
    );
  }

  if (pendingInstallments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Parcelas Futuras
        </h2>
        <p className="text-sm text-muted-foreground">
          Acompanhe suas próximas parcelas e alertas de fechamento
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Pendente</p>
                <p className="text-xl font-bold text-foreground">
                  {summary.totalPending}
                </p>
                <p className="text-xs text-muted-foreground">parcelas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-expense/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-expense" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="text-xl font-bold text-expense">
                  R$ {summary.totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(summary.nearClosingCount > 0 && "border-amber-500/50")}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                summary.nearClosingCount > 0 ? "bg-amber-500/20" : "bg-muted"
              )}>
                <AlertTriangle className={cn(
                  "h-5 w-5",
                  summary.nearClosingCount > 0 ? "text-amber-600" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Próx. Fechamento</p>
                <p className={cn(
                  "text-xl font-bold",
                  summary.nearClosingCount > 0 ? "text-amber-600" : "text-foreground"
                )}>
                  {summary.nearClosingCount}
                </p>
                <p className="text-xs text-muted-foreground">em até 7 dias</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cartões</p>
                <p className="text-xl font-bold text-foreground">
                  {summary.byCreditCard.length}
                </p>
                <p className="text-xs text-muted-foreground">com parcelas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts for near closing */}
      {nearClosingInstallments.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              Atenção: Parcelas Próximas ao Fechamento
            </CardTitle>
            <CardDescription>
              Estas parcelas entrarão na próxima fatura em breve
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nearClosingInstallments.slice(0, 5).map((installment) => (
                <InstallmentAlert key={installment.id} installment={installment} />
              ))}
              {nearClosingInstallments.length > 5 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{nearClosingInstallments.length - 5} parcelas próximas ao fechamento
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Month */}
        {summary.byMonth.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Previsão por Mês</CardTitle>
              <CardDescription>
                Valores estimados das próximas faturas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyBreakdown byMonth={summary.byMonth} />
            </CardContent>
          </Card>
        )}

        {/* By Credit Card */}
        {summary.byCreditCard.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Por Cartão</CardTitle>
              <CardDescription>
                Distribuição das parcelas pendentes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CardBreakdown byCreditCard={summary.byCreditCard} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* All pending installments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Todas as Parcelas Pendentes</CardTitle>
          <CardDescription>
            Lista completa ordenada por data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {pendingInstallments.map((installment) => (
                <InstallmentAlert key={installment.id} installment={installment} />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
