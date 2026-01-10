import { AlertTriangle, CheckCircle, Scale, Briefcase, User, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ReconciliationSummary, CardReconciliation } from "@/hooks/useCreditCardReconciliation";

interface ReconciliationCardProps {
  reconciliation: ReconciliationSummary;
  isLoading?: boolean;
}

function formatCurrency(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function CardReconciliationItem({ card }: { card: CardReconciliation }) {
  const matchPercent = card.bankInvoice > 0 
    ? Math.min(100, (card.transactionsTotal / card.bankInvoice) * 100) 
    : card.transactionsTotal === 0 ? 100 : 0;

  return (
    <div className="p-3 border rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{card.creditCardName}</span>
        </div>
        {card.hasDiscrepancy ? (
          <Badge variant="secondary" className="bg-chart-4/10 text-chart-4 text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Divergência
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-income/10 text-income text-xs">
            <CheckCircle className="h-3 w-3 mr-1" />
            Conciliado
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Banco</p>
          <p className="font-semibold">{formatCurrency(card.bankInvoice)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Lançamentos</p>
          <p className="font-semibold">{formatCurrency(card.transactionsTotal)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Diferença</p>
          <p className={cn(
            "font-semibold",
            card.difference > 0 ? "text-expense" : card.difference < 0 ? "text-income" : "text-muted-foreground"
          )}>
            {card.difference >= 0 ? "+" : ""}{formatCurrency(card.difference)}
          </p>
        </div>
      </div>

      <Progress 
        value={matchPercent} 
        className={cn(
          "h-1.5",
          card.hasDiscrepancy ? "[&>div]:bg-chart-4" : "[&>div]:bg-income"
        )} 
      />

      {(card.corporateTotal > 0 || card.pendingTotal > 0) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
          {card.corporateTotal > 0 && (
            <div className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              <span>Empresa: {formatCurrency(card.corporateTotal)}</span>
            </div>
          )}
          {card.pendingTotal > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-primary">Pendente: {formatCurrency(card.pendingTotal)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReconciliationCard({ reconciliation, isLoading }: ReconciliationCardProps) {
  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 shadow-card animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-4" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  const hasData = reconciliation.cards.some(c => c.bankInvoice > 0 || c.transactionsTotal > 0);
  
  if (!hasData) {
    return null;
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center",
            reconciliation.hasAnyDiscrepancy ? "bg-chart-4/10" : "bg-income/10"
          )}>
            <Scale className={cn(
              "h-5 w-5",
              reconciliation.hasAnyDiscrepancy ? "text-chart-4" : "text-income"
            )} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Conciliação de Faturas</h3>
            <p className="text-sm text-muted-foreground">
              Comparativo entre banco e lançamentos registrados
            </p>
          </div>
        </div>
        {reconciliation.hasAnyDiscrepancy ? (
          <Badge className="bg-chart-4/10 text-chart-4 border-chart-4/20">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Há divergências
          </Badge>
        ) : (
          <Badge className="bg-income/10 text-income border-income/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            Tudo conciliado
          </Badge>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Total Banco</p>
          <p className="text-lg font-bold">{formatCurrency(reconciliation.totalBankInvoice)}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">Total Lançamentos</p>
          <p className="text-lg font-bold">{formatCurrency(reconciliation.totalTransactions)}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-1">
            <User className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Pessoal</p>
          </div>
          <p className="text-lg font-bold text-expense">{formatCurrency(reconciliation.totalPersonal)}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-1">
            <Briefcase className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Empresa</p>
          </div>
          <p className="text-lg font-bold text-muted-foreground">{formatCurrency(reconciliation.totalCorporate)}</p>
        </div>
      </div>

      {/* Card Details */}
      {reconciliation.cards.filter(c => c.bankInvoice > 0 || c.transactionsTotal > 0).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Por Cartão</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {reconciliation.cards
              .filter(c => c.bankInvoice > 0 || c.transactionsTotal > 0)
              .map((card) => (
                <CardReconciliationItem key={card.creditCardId} card={card} />
              ))}
          </div>
        </div>
      )}

      {reconciliation.hasAnyDiscrepancy && Math.abs(reconciliation.totalDifference) > 0.01 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-chart-4/10 text-sm">
          <AlertTriangle className="h-4 w-4 text-chart-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-chart-4">
              Diferença total: {formatCurrency(Math.abs(reconciliation.totalDifference))}
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              {reconciliation.totalDifference > 0 
                ? "O valor no banco é maior que os lançamentos registrados. Pode haver transações faltando."
                : "Os lançamentos são maiores que o valor no banco. Verifique se há transações duplicadas ou já pagas."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
