import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileDown,
  PenLine,
  RotateCcw,
  Calculator,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  due_date: string | null;
  status: string;
  is_refund: boolean;
  is_corporate_expense: boolean;
  credit_card_id: string;
  imported_at?: string | null;
  is_card_payment?: boolean | null;
}

interface InvoiceBreakdownCardProps {
  transactions: Transaction[];
  bankInvoice: number;
  cardId: string;
}

function formatCurrency(value: number) {
  return `R$ ${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function InvoiceBreakdownCard({
  transactions,
  bankInvoice,
  cardId,
}: InvoiceBreakdownCardProps) {
  const breakdown = useMemo(() => {
    const cardTransactions = transactions.filter(
      (t) => t.credit_card_id === cardId && !t.is_card_payment
    );

    // Separate by source (imported vs manual)
    const importedTransactions = cardTransactions.filter(
      (t) => t.imported_at !== null && !t.is_refund
    );
    const manualTransactions = cardTransactions.filter(
      (t) => t.imported_at === null && !t.is_refund
    );
    const refundTransactions = cardTransactions.filter((t) => t.is_refund);

    // Calculate totals for completed transactions only
    const importedTotal = importedTransactions
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const manualTotal = manualTransactions
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const refundTotal = refundTransactions
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Pending transactions (not included in current_invoice)
    const pendingTotal = cardTransactions
      .filter((t) => t.status === "pending" && !t.is_refund)
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Net calculation
    const grossTotal = importedTotal + manualTotal;
    const netTotal = grossTotal - refundTotal;

    // Difference from bank
    const difference = bankInvoice - netTotal;

    return {
      importedCount: importedTransactions.length,
      importedTotal,
      manualCount: manualTransactions.length,
      manualTotal,
      refundCount: refundTransactions.length,
      refundTotal,
      pendingCount: cardTransactions.filter((t) => t.status === "pending").length,
      pendingTotal,
      grossTotal,
      netTotal,
      difference,
      hasDiscrepancy: Math.abs(difference) > 0.01,
    };
  }, [transactions, cardId]);

  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Como o Total Foi Calculado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Breakdown Items */}
        <div className="space-y-3">
          {/* Imported Transactions */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <FileDown className="h-4 w-4 text-primary" />
              <span>Transações Importadas</span>
              <Badge variant="secondary" className="text-xs">
                {breakdown.importedCount}
              </Badge>
            </div>
            <span className="font-mono font-medium">
              {formatCurrency(breakdown.importedTotal)}
            </span>
          </div>

          {/* Manual Transactions */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <PenLine className="h-4 w-4 text-muted-foreground" />
              <span>Transações Manuais</span>
              <Badge variant="secondary" className="text-xs">
                {breakdown.manualCount}
              </Badge>
            </div>
            <span className="font-mono font-medium">
              {formatCurrency(breakdown.manualTotal)}
            </span>
          </div>

          {/* Subtotal */}
          <div className="flex items-center justify-between text-sm pl-6 text-muted-foreground">
            <div className="flex items-center gap-2">
              <ArrowRight className="h-3 w-3" />
              <span>Subtotal (Importadas + Manuais)</span>
            </div>
            <span className="font-mono">{formatCurrency(breakdown.grossTotal)}</span>
          </div>

          {/* Refunds */}
          {breakdown.refundCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-income" />
                <span className="text-income">Estornos (deduzidos)</span>
                <Badge variant="secondary" className="text-xs bg-income/10 text-income">
                  {breakdown.refundCount}
                </Badge>
              </div>
              <span className="font-mono font-medium text-income">
                - {formatCurrency(breakdown.refundTotal)}
              </span>
            </div>
          )}
        </div>

        <Separator />

        {/* Net Total */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            <span className="font-medium">Total Calculado (Sistema)</span>
          </div>
          <span className="font-mono font-bold text-lg">
            {formatCurrency(breakdown.netTotal)}
          </span>
        </div>

        {/* Bank Invoice Comparison */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-muted-foreground" />
            <span>Fatura do Banco</span>
          </div>
          <span className="font-mono font-medium">
            {formatCurrency(bankInvoice)}
          </span>
        </div>

        {/* Difference */}
        <div
          className={cn(
            "flex items-center justify-between p-3 rounded-lg",
            breakdown.hasDiscrepancy
              ? "bg-chart-4/10 border border-chart-4/30"
              : "bg-income/10 border border-income/30"
          )}
        >
          <div className="flex items-center gap-2">
            {breakdown.hasDiscrepancy ? (
              <AlertTriangle className="h-4 w-4 text-chart-4" />
            ) : (
              <CheckCircle className="h-4 w-4 text-income" />
            )}
            <span className="font-medium">
              {breakdown.hasDiscrepancy ? "Diferença" : "Conciliado"}
            </span>
          </div>
          <span
            className={cn(
              "font-mono font-bold",
              breakdown.hasDiscrepancy ? "text-chart-4" : "text-income"
            )}
          >
            {breakdown.difference >= 0 ? "+" : "-"}
            {formatCurrency(breakdown.difference)}
          </span>
        </div>

        {/* Pending Transactions Note */}
        {breakdown.pendingCount > 0 && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              <strong>{breakdown.pendingCount}</strong> transações pendentes (
              {formatCurrency(breakdown.pendingTotal)}) não estão incluídas no
              cálculo do saldo atual.
            </span>
          </div>
        )}

        {/* Explanation if discrepancy */}
        {breakdown.hasDiscrepancy && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Possíveis causas da diferença:</p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              {breakdown.difference > 0 && (
                <>
                  <li>Transações não lançadas no sistema</li>
                  <li>Encargos, juros ou anuidade não registrados</li>
                  <li>IOF ou outras taxas não capturadas na importação</li>
                </>
              )}
              {breakdown.difference < 0 && (
                <>
                  <li>Transações duplicadas no sistema</li>
                  <li>Estornos não registrados no banco ainda</li>
                  <li>Pagamento parcial da fatura já realizado</li>
                </>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
