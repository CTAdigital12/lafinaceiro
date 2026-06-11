import { useState, useEffect } from "react";
import { Plus, CreditCard, Calendar, Wallet, MoreVertical, Upload, Briefcase, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { ListSortButtons } from "@/components/ui/list-sort-buttons";
import { useCreditCards, CreditCard as CreditCardType } from "@/hooks/useCreditCards";
import { useCreditCardReconciliation } from "@/hooks/useCreditCardReconciliation";
import { CreditCardModal } from "@/components/modals/CreditCardModal";
import { InvoiceImportModal, ImportCompleteData } from "@/components/modals/InvoiceImportModal";
import { InvoiceReviewModal } from "@/components/modals/InvoiceReviewModal";
import { PayInvoiceModal } from "@/components/modals/PayInvoiceModal";
import { InstallmentsDashboard } from "@/components/credit-cards/InstallmentsDashboard";
import { ReconciliationCard } from "@/components/credit-cards/ReconciliationCard";
import { useDate } from "@/contexts/DateContext";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useInvoiceTransactions } from "@/hooks/useInvoiceTransactions";

const statusConfig = {
  open: { label: "Fatura Aberta", variant: "default" as const, className: "bg-balance text-balance-foreground" },
  closed: { label: "Fatura Fechada", variant: "secondary" as const, className: "bg-expense/10 text-expense" },
  paid: { label: "Paga", variant: "secondary" as const, className: "bg-income/10 text-income" },
};

interface CreditCardComponentProps {
  card: CreditCardType;
  pendingAmount: number;
  month: number;
  year: number;
  onEdit: (card: CreditCardType) => void;
  onDelete: () => void;
  onImportInvoice: (card: CreditCardType) => void;
  onPayInvoice: (card: CreditCardType) => void;
}

function CreditCardComponent({ card, pendingAmount, month, year, onEdit, onDelete, onImportInvoice, onPayInvoice }: CreditCardComponentProps) {
  const fmt = useFormatCurrency();

  // "Fatura Atual" e o status do badge vêm do CICLO do mês selecionado (não do
  // saldo global do cartão). Quando o ciclo foi formalmente fechado usamos o
  // closed_amount; senão a soma ao vivo das transações daquele mês.
  const { transactionsTotal, closedAmount, invoiceStatus } = useInvoiceTransactions({
    creditCardId: card.id,
    month,
    year,
  });
  const currentInvoice = closedAmount ?? transactionsTotal;

  const limit = Number(card.credit_limit);
  // Limite usa o saldo global em aberto do cartão (todas as faturas não pagas).
  const totalUsed = Number(card.current_invoice) + pendingAmount;
  const availableLimit = limit - totalUsed;
  const usagePercent = limit > 0 ? (totalUsed / limit) * 100 : 0;
  const status = statusConfig[invoiceStatus as keyof typeof statusConfig] || statusConfig.open;

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
                <DropdownMenuItem onClick={() => onPayInvoice(card)}>
                  <Banknote className="h-4 w-4 mr-2" />
                  Pagar Fatura
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onImportInvoice(card)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar Fatura
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEdit(card)}>Editar</DropdownMenuItem>
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
              {fmt(currentInvoice)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Limite Disponível</p>
            <p className="text-lg font-semibold text-income">
              {fmt(availableLimit)}
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
  const fmt = useFormatCurrency();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCardType | null>(null);
  const [importingCard, setImportingCard] = useState<CreditCardType | null>(null);
  const [importData, setImportData] = useState<ImportCompleteData | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [payingCard, setPayingCard] = useState<CreditCardType | null>(null);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);
  // Store credit card info separately for review modal to avoid losing it when import modal closes
  const [reviewCardId, setReviewCardId] = useState<string>("");
  const [reviewCardName, setReviewCardName] = useState<string>("");
  
  // Period state for reconciliation - synced with global header selector
  const { month: globalMonth, year: globalYear } = useDate();
  const [reconciliationMonth, setReconciliationMonth] = useState(globalMonth);
  const [reconciliationYear, setReconciliationYear] = useState(globalYear);

  useEffect(() => {
    setReconciliationMonth(globalMonth);
    setReconciliationYear(globalYear);
  }, [globalMonth, globalYear]);
  
  const { creditCards, isLoading, totalInvoice, totalAvailable, totalPendingInstallments, pendingByCard, deleteCreditCard } = useCreditCards();
  const { query: cardQuery, setQuery: setCardQuery, sort: cardSort, toggleSort: toggleCardSort, items: displayCards } = useListSearchSort(creditCards, {
    searchAccessors: [(c) => c.name, (c) => c.brand, (c) => c.last_digits],
    sortAccessors: {
      name: (c) => c.name,
      invoice: (c) => Number(c.current_invoice),
      limit: (c) => Number(c.credit_limit),
      due: (c) => Number(c.due_date),
    },
  });
  const { reconciliation, isLoading: isReconciliationLoading, transactions } = useCreditCardReconciliation({
    month: reconciliationMonth,
    year: reconciliationYear,
  });

  const handlePeriodChange = (month: number, year: number) => {
    setReconciliationMonth(month);
    setReconciliationYear(year);
  };

  const handleEdit = (card: CreditCardType) => {
    setEditingCard(card);
    setIsModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) setEditingCard(null);
  };

  const handleImportInvoice = (card: CreditCardType) => {
    setImportingCard(card);
    // Store card info for review modal
    setReviewCardId(card.id);
    setReviewCardName(card.name);
  };

  const handleImportComplete = (data: ImportCompleteData) => {
    setImportData(data);
    setIsReviewOpen(true);
  };

  const handlePayInvoice = (card: CreditCardType) => {
    setPayingCard(card);
  };

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Fatura Banco */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-expense flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-expense-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fatura Banco</p>
              <p className="text-lg font-bold text-foreground">
                {fmt(reconciliation.totalBankInvoice)}
              </p>
              <p className="text-xs text-muted-foreground">Valor informado</p>
            </div>
          </div>
        </div>
        
        {/* Fatura Lançada */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-chart-2/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-chart-2" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fatura Lançada</p>
              <p className="text-lg font-bold text-chart-2">
                {fmt(reconciliation.totalTransactions)}
              </p>
              {Math.abs(reconciliation.totalDifference) > 0.01 ? (
                <p className="text-xs text-chart-4">
                  Diferença: {fmt(Math.abs(reconciliation.totalDifference))}
                </p>
              ) : (
                <p className="text-xs text-income">Reconciliado ✓</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Meu Custo */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Meu Custo</p>
              <p className="text-lg font-bold text-expense">
                {fmt(reconciliation.totalPersonal)}
              </p>
              <p className="text-xs text-muted-foreground">Valor a pagar</p>
            </div>
          </div>
        </div>
        
        {/* A Reembolsar */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">A Reembolsar</p>
              <p className="text-lg font-bold text-muted-foreground">
                {fmt(reconciliation.totalCorporate)}
              </p>
              <p className="text-xs text-muted-foreground">Empresa paga</p>
            </div>
          </div>
        </div>
        
        {/* Limite Disponível */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-income flex items-center justify-center">
              <Wallet className="h-5 w-5 text-income-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Limite Disponível</p>
              <p className="text-lg font-bold text-income">
                {fmt(totalAvailable)}
              </p>
              {totalPendingInstallments > 0 && (
                <p className="text-xs text-muted-foreground">
                  inclui {fmt(totalPendingInstallments)} em parcelas futuras
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reconciliation Card */}
      <ReconciliationCard 
        reconciliation={reconciliation} 
        isLoading={isReconciliationLoading}
        transactions={transactions}
        month={reconciliationMonth}
        year={reconciliationYear}
        onPeriodChange={handlePeriodChange}
      />

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
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <ListSearchInput
              value={cardQuery}
              onChange={setCardQuery}
              placeholder="Buscar por nome, bandeira ou dígitos..."
              className="sm:max-w-xs"
            />
            <ListSortButtons
              options={[
                { key: "name", label: "Nome" },
                { key: "invoice", label: "Fatura" },
                { key: "limit", label: "Limite" },
                { key: "due", label: "Vencimento" },
              ]}
              activeField={cardSort.field}
              direction={cardSort.direction}
              onSort={toggleCardSort}
              className="sm:ml-auto"
            />
          </div>
          {displayCards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhum cartão corresponde à busca.</div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {displayCards.map((card) => (
                <CreditCardComponent
                  key={card.id}
                  card={card}
                  pendingAmount={pendingByCard[card.id] || 0}
                  month={reconciliationMonth}
                  year={reconciliationYear}
                  onEdit={handleEdit}
                  onDelete={() => setDeleteCardId(card.id)}
                  onImportInvoice={handleImportInvoice}
                  onPayInvoice={handlePayInvoice}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Installments Dashboard */}
      <InstallmentsDashboard />

      <CreditCardModal 
        open={isModalOpen} 
        onOpenChange={handleModalClose} 
        creditCard={editingCard}
      />

      <InvoiceImportModal
        open={!!importingCard}
        onOpenChange={(open) => !open && setImportingCard(null)}
        creditCardId={importingCard?.id || ""}
        creditCardName={importingCard?.name || ""}
        closingDate={importingCard?.closing_date || 10}
        onImportComplete={handleImportComplete}
      />

      <InvoiceReviewModal
        open={isReviewOpen}
        onOpenChange={setIsReviewOpen}
        importData={importData}
        creditCardId={reviewCardId}
        creditCardName={reviewCardName}
      />

      <PayInvoiceModal
        open={!!payingCard}
        onOpenChange={(open) => !open && setPayingCard(null)}
        creditCard={payingCard}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteCardId} onOpenChange={(open) => !open && setDeleteCardId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartão de crédito?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este cartão? Todas as transações vinculadas permanecerão, mas ficarão sem cartão associado. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteCardId) deleteCreditCard.mutate(deleteCardId);
                setDeleteCardId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
