import { useState } from "react";
import { format, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle, Scale, Briefcase, User, CreditCard, RotateCcw, ChevronLeft, ChevronRight, FileText, Lock, Unlock, Clock, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ReconciliationSummary, CardReconciliation, ReconciliationTransaction } from "@/hooks/useCreditCardReconciliation";
import { ReconciliationDetailModal } from "./ReconciliationDetailModal";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { CloseInvoiceModal } from "./CloseInvoiceModal";
import { ReopenInvoiceModal } from "./ReopenInvoiceModal";
import { ClosedInvoiceBanner } from "./ClosedInvoiceBanner";
import { SpreadsheetReconciliationModal } from "./SpreadsheetReconciliationModal";
import { useInvoiceCycles, type InvoiceStatus } from "@/hooks/useInvoiceCycles";

interface ReconciliationCardProps {
  reconciliation: ReconciliationSummary;
  isLoading?: boolean;
  transactions?: (ReconciliationTransaction & { category?: { name: string; icon: string } | null })[];
  month: number;
  year: number;
  onPeriodChange: (month: number, year: number) => void;
}

import { useFormatCurrency } from "@/hooks/useFormatCurrency";

function CardReconciliationItem({
  card,
  onViewDetails
}: {
  card: CardReconciliation;
  onViewDetails: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  const matchPercent = card.isPaid
    ? 100 
    : card.bankInvoice > 0 
      ? Math.min(100, (card.transactionsTotal / card.bankInvoice) * 100) 
      : card.transactionsTotal === 0 ? 100 : 0;

  // Determine badge to show based on status
  const getBadge = () => {
    if (card.isPaid) {
      return (
        <Badge variant="secondary" className="bg-income/10 text-income text-xs">
          <CheckCircle className="h-3 w-3 mr-1" />
          Paga
        </Badge>
      );
    }
    if (card.hasDiscrepancy) {
      return (
        <Badge variant="secondary" className="bg-chart-4/10 text-chart-4 text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Divergência
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-income/10 text-income text-xs">
        <CheckCircle className="h-3 w-3 mr-1" />
        Conciliado
      </Badge>
    );
  };

  return (
    <div 
      className="p-3 border rounded-lg space-y-2 hover:border-primary/50 transition-colors cursor-pointer"
      onClick={onViewDetails}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{card.creditCardName}</span>
        </div>
        <div className="flex items-center gap-2">
          {getBadge()}
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
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

      {(card.corporateTotal > 0 || card.pendingTotal > 0 || card.refundTotal > 0) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 flex-wrap">
          {card.refundTotal > 0 && (
            <div className="flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              <span className="text-income">Estornos: -{formatCurrency(card.refundTotal)}</span>
            </div>
          )}
          {card.corporateTotal > 0 && (
            <div className="flex items-center gap-1">
              <Briefcase className="h-3 w-3" />
              <span>Empresa: {formatCurrency(card.corporateTotal)}</span>
            </div>
          )}
          {card.corporateReimbursed > 0 && (
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-income" />
              <span className="text-income">Reembolsado: {formatCurrency(card.corporateReimbursed)}</span>
            </div>
          )}
          {card.corporatePending > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-chart-4" />
              <span className="text-chart-4">Pendente: {formatCurrency(card.corporatePending)}</span>
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

export function ReconciliationCard({
  reconciliation,
  isLoading,
  transactions = [],
  month,
  year,
  onPeriodChange,
}: ReconciliationCardProps) {
  const formatCurrency = useFormatCurrency();
  const [selectedCard, setSelectedCard] = useState<CardReconciliation | null>(null);
  const [spreadsheetCard, setSpreadsheetCard] = useState<CardReconciliation | null>(null);
  const [closeModalData, setCloseModalData] = useState<{
    creditCardId: string;
    creditCardName: string;
    month: number;
    year: number;
    totalAmount: number;
  } | null>(null);
  const [reopenModalData, setReopenModalData] = useState<{
    creditCardId: string;
    creditCardName: string;
    month: number;
    year: number;
  } | null>(null);

  const { getInvoiceStatus } = useInvoiceCycles({ month, year });

  const currentDate = new Date(year, month - 1);

  const handlePrevMonth = () => {
    const prev = subMonths(currentDate, 1);
    onPeriodChange(prev.getMonth() + 1, prev.getFullYear());
  };

  const handleNextMonth = () => {
    const next = addMonths(currentDate, 1);
    onPeriodChange(next.getMonth() + 1, next.getFullYear());
  };

  const handleCloseInvoice = (card: CardReconciliation) => {
    setCloseModalData({
      creditCardId: card.creditCardId,
      creditCardName: card.creditCardName,
      month,
      year,
      totalAmount: card.transactionsTotal,
    });
  };

  const handleReopenInvoice = (card: CardReconciliation) => {
    setReopenModalData({
      creditCardId: card.creditCardId,
      creditCardName: card.creditCardName,
      month,
      year,
    });
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 shadow-card animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-4" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  const hasData = reconciliation.cards.some(c => c.bankInvoice > 0 || c.transactionsTotal > 0 || c.pendingTotal > 0);

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-6 shadow-card space-y-4">
        {/* Header - always visible with month selector */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              hasData && reconciliation.hasAnyDiscrepancy ? "bg-chart-4/10" : "bg-income/10"
            )}>
              <Scale className={cn(
                "h-5 w-5",
                hasData && reconciliation.hasAnyDiscrepancy ? "text-chart-4" : "text-income"
              )} />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Conciliação de Faturas</h3>
              <p className="text-sm text-muted-foreground">
                Comparativo entre banco e lançamentos registrados
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-3 font-medium text-sm min-w-[100px] text-center capitalize">
                {format(currentDate, "MMM yyyy", { locale: ptBR })}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {hasData && (
              reconciliation.hasAnyDiscrepancy ? (
                <Badge className="bg-chart-4/10 text-chart-4 border-chart-4/20">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Há divergências
                </Badge>
              ) : (
                <Badge className="bg-income/10 text-income border-income/20">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Tudo conciliado
                </Badge>
              )
            )}
          </div>
        </div>

        {hasData ? (
          <>
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
                {reconciliation.totalCorporateReimbursed > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <CheckCircle className="h-3 w-3 text-income" />
                    <span className="text-xs text-income">Reembolsado: {formatCurrency(reconciliation.totalCorporateReimbursed)}</span>
                  </div>
                )}
                {reconciliation.totalCorporatePending > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3 text-chart-4" />
                    <span className="text-xs text-chart-4">Pendente: {formatCurrency(reconciliation.totalCorporatePending)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card Details */}
            {reconciliation.cards.filter(c => c.bankInvoice > 0 || c.transactionsTotal > 0 || c.pendingTotal > 0).length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">Por Cartão</h4>
                {reconciliation.cards
                  .filter(c => c.bankInvoice > 0 || c.transactionsTotal > 0 || c.pendingTotal > 0)
                  .map((card) => {
                    const invoiceStatus = getInvoiceStatus(card.creditCardId, month, year);
                    const isClosed = invoiceStatus === "closed";

                    return (
                      <div key={card.creditCardId} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <InvoiceStatusBadge status={invoiceStatus} />
                            <span className="text-sm font-medium">{card.creditCardName}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isClosed ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-chart-4 text-chart-4 hover:bg-chart-4/10"
                                onClick={() => handleReopenInvoice(card)}
                              >
                                <Unlock className="h-3 w-3 mr-1" />
                                Reabrir
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleCloseInvoice(card)}
                              >
                                <Lock className="h-3 w-3 mr-1" />
                                Fechar Fatura
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setSpreadsheetCard(card)}
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Planilha
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setSelectedCard(card)}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Detalhes
                            </Button>
                          </div>
                        </div>

                        {isClosed && (
                          <ClosedInvoiceBanner onReopen={() => handleReopenInvoice(card)} />
                        )}

                        <CardReconciliationItem 
                          card={card} 
                          onViewDetails={() => setSelectedCard(card)}
                        />
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Discrepancy alert */}
            {reconciliation.cards.some(c => c.hasDiscrepancy && !c.isPaid) && Math.abs(reconciliation.totalDifference) > 0.01 && (
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
          </>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <p>Nenhum lançamento encontrado para este período.</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedCard && (
        <ReconciliationDetailModal
          open={!!selectedCard}
          onOpenChange={(open) => !open && setSelectedCard(null)}
          cardId={selectedCard.creditCardId}
          cardName={selectedCard.creditCardName}
          bankInvoice={selectedCard.bankInvoice}
          transactionsTotal={selectedCard.transactionsTotal}
          difference={selectedCard.difference}
          transactions={transactions}
        />
      )}

      {/* Close Invoice Modal */}
      {closeModalData && (
        <CloseInvoiceModal
          open={true}
          onOpenChange={(open) => !open && setCloseModalData(null)}
          creditCardId={closeModalData.creditCardId}
          creditCardName={closeModalData.creditCardName}
          month={closeModalData.month}
          year={closeModalData.year}
          totalAmount={closeModalData.totalAmount}
        />
      )}

      {/* Reopen Invoice Modal */}
      {reopenModalData && (
        <ReopenInvoiceModal
          open={true}
          onOpenChange={(open) => !open && setReopenModalData(null)}
          creditCardId={reopenModalData.creditCardId}
          creditCardName={reopenModalData.creditCardName}
          month={reopenModalData.month}
          year={reopenModalData.year}
        />
      )}

      {/* Spreadsheet Reconciliation Modal */}
      {spreadsheetCard && (
        <SpreadsheetReconciliationModal
          open={true}
          onOpenChange={(open) => !open && setSpreadsheetCard(null)}
          creditCardId={spreadsheetCard.creditCardId}
          creditCardName={spreadsheetCard.creditCardName}
          month={month}
          year={year}
        />
      )}
    </>
  );
}
