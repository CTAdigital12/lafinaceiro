import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  Loader2,
  Wallet,
  CreditCard,
  Building2,
  User,
  Link as LinkIcon,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ListChecks,
  RefreshCw,
} from "lucide-react";
import { logError } from "@/lib/errorHandler";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreditCards, CreditCard as CreditCardType } from "@/hooks/useCreditCards";
import { useInvoiceTransactions } from "@/hooks/useInvoiceTransactions";
import { useBankPaymentCandidates } from "@/hooks/useBankPaymentCandidates";
import { cn } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { InvoiceItemsModal } from "./InvoiceItemsModal";

interface PayInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCard: CreditCardType | null;
  month?: number;
  year?: number;
}

export function PayInvoiceModal({
  open,
  onOpenChange,
  creditCard,
  month,
  year,
}: PayInvoiceModalProps) {
  const formatCurrency = useFormatCurrency();
  const { accounts } = useAccounts();
  const { paySplitInvoice } = useCreditCards();

  // Use provided month/year or current
  const now = new Date();
  const invoiceMonth = month ?? now.getMonth() + 1;
  const invoiceYear = year ?? now.getFullYear();

  // Fetch invoice transactions
  const {
    transactions,
    corporateTotal,
    reimbursableTotal,
    personalTotal,
    myTotalToPay,
    transactionsTotal: invoiceTransactionsTotal,
    closedAmount,
    isLoading: isLoadingTransactions,
  } = useInvoiceTransactions({
    creditCardId: creditCard?.id || "",
    month: invoiceMonth,
    year: invoiceYear,
    enabled: open && !!creditCard,
  });

  // State
  const [date, setDate] = useState<Date>(new Date());
  const [includeCorporate, setIncludeCorporate] = useState(true);
  const [corporateAmount, setCorporateAmount] = useState("0");
  const [includePersonal, setIncludePersonal] = useState(true);
  const [personalAmount, setPersonalAmount] = useState("0");
  const [personalPaymentType, setPersonalPaymentType] = useState<"bank" | "external">("bank");
  const [accountId, setAccountId] = useState("");
  const [linkToTransaction, setLinkToTransaction] = useState(false);
  const [linkedTransactionId, setLinkedTransactionId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [corporateOpen, setCorporateOpen] = useState(true);
  const [personalOpen, setPersonalOpen] = useState(true);
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  // Residual balance state
  const [includeResidual, setIncludeResidual] = useState(false);
  const [residualAmount, setResidualAmount] = useState("0");
  const [residualPaymentType, setResidualPaymentType] = useState<"bank" | "external">("bank");
  const [residualAccountId, setResidualAccountId] = useState("");
  const [residualLinkToTransaction, setResidualLinkToTransaction] = useState(false);
  const [residualLinkedTransactionId, setResidualLinkedTransactionId] = useState("");

  // Calculate due date for bank payment candidates
  const dueDate = useMemo(() => {
    if (!creditCard) return new Date();
    const dueDateNumber = creditCard.due_date || 10;
    return new Date(invoiceYear, invoiceMonth - 1, dueDateNumber);
  }, [creditCard, invoiceMonth, invoiceYear]);

  // Fetch bank payment candidates based on my payment amount
  // Use closed_amount if available, otherwise use sum of transactions for the month
  const totalInvoice = closedAmount ?? (corporateTotal + myTotalToPay);
  const transactionsTotal = corporateTotal + myTotalToPay;
  
  // Residual = closed_amount - transactions total (only when invoice is closed and there's a difference)
  // This catches real differences like fees, interest, etc.
  const calculatedResidual = closedAmount != null 
    ? Math.max(0, closedAmount - transactionsTotal) 
    : 0;
  
  // Show residual section only if there's a real difference between closed amount and transactions
  const hasResidualBalance = calculatedResidual > 0;
  
  // No more "partially paid" logic based on global current_invoice
  const shouldHideTransactionSections = false;
  
  const myPaymentAmount = parseFloat(personalAmount) || myTotalToPay;
  const { candidates: bankCandidates, isLoading: isLoadingCandidates } = useBankPaymentCandidates({
    targetAmount: myPaymentAmount,
    dueDate,
    enabled: open && !!creditCard && personalPaymentType === "bank",
  });

  // Fetch candidates for residual balance linking
  const residualSearchAmount = parseFloat(residualAmount) || calculatedResidual;
  const { candidates: residualCandidates, isLoading: isLoadingResidualCandidates } = useBankPaymentCandidates({
    targetAmount: residualSearchAmount,
    dueDate,
    enabled: open && !!creditCard && includeResidual && residualPaymentType === "bank" && residualLinkToTransaction,
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open && creditCard) {
      setCorporateAmount(corporateTotal.toFixed(2));
      setPersonalAmount(myTotalToPay.toFixed(2)); // Use myTotalToPay (reimbursable + personal)
      setIncludeCorporate(corporateTotal > 0);
      setIncludePersonal(myTotalToPay > 0);
      setAccountId("");
      setLinkedTransactionId("");
      setLinkToTransaction(false);
      setPersonalPaymentType("bank");
      setDate(new Date());
      setSelectedItems([]);
      setCorporateOpen(corporateTotal > 0);
      setPersonalOpen(true);
      // Reset residual state
      const residual = closedAmount != null 
        ? Math.max(0, closedAmount - (corporateTotal + myTotalToPay))
        : 0;
      
      setResidualAmount(residual.toFixed(2));
      setIncludeResidual(false);
      setResidualPaymentType("bank");
      setResidualAccountId("");
      setResidualLinkToTransaction(false);
      setResidualLinkedTransactionId("");
    }
  }, [open, creditCard, corporateTotal, myTotalToPay, closedAmount]);

  // Calculate payment summary
  const totalToPay = useMemo(() => {
    let total = 0;
    if (includeCorporate) total += parseFloat(corporateAmount) || 0;
    if (includePersonal) total += parseFloat(personalAmount) || 0;
    if (includeResidual) total += parseFloat(residualAmount) || 0;
    return total;
  }, [includeCorporate, corporateAmount, includePersonal, personalAmount, includeResidual, residualAmount]);

  const remainingAfterPayment = useMemo(() => {
    return Math.max(0, totalInvoice - totalToPay);
  }, [totalInvoice, totalToPay]);

  const paymentPercentage = useMemo(() => {
    if (totalInvoice === 0) return 0;
    return Math.min(100, (totalToPay / totalInvoice) * 100);
  }, [totalToPay, totalInvoice]);

  const handleSubmit = async () => {
    if (!creditCard) return;

    setIsSubmitting(true);
    try {
      await paySplitInvoice.mutateAsync({
        creditCardId: creditCard.id,
        creditCardName: creditCard.name,
        corporateAmount: parseFloat(corporateAmount) || 0,
        includeCorporate,
        personalAmount: parseFloat(personalAmount) || 0,
        includePersonal,
        personalPaymentType,
        accountId: personalPaymentType === "bank" && !linkToTransaction ? accountId : null,
        linkToTransactionId: linkToTransaction ? linkedTransactionId : null,
        residualAmount: parseFloat(residualAmount) || 0,
        includeResidual,
        residualPaymentType,
        residualAccountId: residualPaymentType === "bank" && !residualLinkToTransaction ? residualAccountId : null,
        residualLinkedTransactionId: residualLinkToTransaction ? residualLinkedTransactionId : null,
        date: format(date, "yyyy-MM-dd"),
      });
      onOpenChange(false);
    } catch (error) {
      logError(error, "PayInvoiceModal");
    } finally {
      setIsSubmitting(false);
    }
  };

  const bankAccounts = accounts.filter((acc) => acc.type === "bank" || acc.type === "wallet");

  const canSubmit = useMemo(() => {
    if (totalToPay <= 0) return false;
    if (includePersonal && personalPaymentType === "bank") {
      if (linkToTransaction && !linkedTransactionId) return false;
      if (!linkToTransaction && !accountId) return false;
    }
    if (includeResidual && residualPaymentType === "bank") {
      if (residualLinkToTransaction && !residualLinkedTransactionId) return false;
      if (!residualLinkToTransaction && !residualAccountId) return false;
    }
    return true;
  }, [totalToPay, includePersonal, personalPaymentType, linkToTransaction, linkedTransactionId, accountId, includeResidual, residualPaymentType, residualLinkToTransaction, residualLinkedTransactionId, residualAccountId]);

  // Handle item selection from review modal
  const handleItemsSelected = (itemIds: string[]) => {
    setSelectedItems(itemIds);
    
    // Recalculate amounts based on selected items (3 categories)
    const selectedTxs = transactions.filter((t) => itemIds.includes(t.id));
    const newCorporate = selectedTxs
      .filter((t) => t.is_corporate_expense && !t.is_refund)
      .reduce((sum, t) => sum + t.amount, 0);
    const newReimbursable = selectedTxs
      .filter((t) => t.is_reimbursable && !t.is_corporate_expense && !t.is_refund)
      .reduce((sum, t) => sum + t.amount, 0);
    const newPersonal = selectedTxs
      .filter((t) => !t.is_corporate_expense && !t.is_reimbursable && !t.is_refund)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // My part = reimbursable + personal
    const myPart = newReimbursable + newPersonal;

    setCorporateAmount(newCorporate.toFixed(2));
    setPersonalAmount(myPart.toFixed(2));
    setIncludeCorporate(newCorporate > 0);
    setIncludePersonal(myPart > 0);
  };

  if (isLoadingTransactions) {
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Pagar Fatura" className="sm:max-w-lg">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ResponsiveDialog>
    );
  }

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          <span className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pagar Fatura
          </span>
        }
        description={`${creditCard?.name} - ${creditCard?.brand}`}
        className="sm:max-w-lg"
      >

          <div className="space-y-4 py-2">
            {/* Invoice Composition Section */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                📊 Composição da Fatura
              </h3>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total da Fatura</span>
                  <span className="font-bold text-lg">{formatCurrency(totalInvoice)}</span>
                </div>
                
                <Separator />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Gastos Corporativos
                  </span>
                  <span className="text-sm font-medium text-slate-600">
                    {formatCurrency(corporateTotal)}
                    {corporateTotal > 0 && totalInvoice > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({Math.round((corporateTotal / totalInvoice) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    Compras Reembolsáveis
                  </span>
                  <span className="text-sm font-medium text-amber-600">
                    {formatCurrency(reimbursableTotal)}
                    {reimbursableTotal > 0 && totalInvoice > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({Math.round((reimbursableTotal / totalInvoice) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Meus Gastos Pessoais
                  </span>
                  <span className="text-sm font-medium text-primary">
                    {formatCurrency(personalTotal)}
                    {personalTotal > 0 && totalInvoice > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({Math.round((personalTotal / totalInvoice) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>

                <Separator />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium flex items-center gap-1">
                    💰 Meu Total a Pagar
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {formatCurrency(myTotalToPay)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">(Reembolsáveis + Pessoais)</p>
              </div>

              {/* Review Items Button */}
              {transactions.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowItemsModal(true)}
                  className="w-full mt-2"
                >
                  <ListChecks className="h-4 w-4 mr-2" />
                  Revisar {transactions.length} Itens
                </Button>
              )}
            </div>

            {/* Corporate Section */}
            {corporateTotal > 0 && !shouldHideTransactionSections && (
              <Collapsible open={corporateOpen} onOpenChange={setCorporateOpen}>
                <div className="rounded-lg border p-4 space-y-3">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between cursor-pointer">
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-500" />
                        Parte Corporativa
                        <span className="text-muted-foreground font-normal">
                          ({formatCurrency(corporateTotal)})
                        </span>
                      </h3>
                      {corporateOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="includeCorporate"
                        checked={includeCorporate}
                        onCheckedChange={(checked) => setIncludeCorporate(!!checked)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <label
                          htmlFor="includeCorporate"
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          Baixar gastos corporativos automaticamente
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Cria ajuste para zerar esta parte da dívida sem debitar de conta bancária.
                        </p>
                      </div>
                    </div>

                    {includeCorporate && (
                      <div className="space-y-2 pl-6">
                        <Label htmlFor="corporateAmount" className="text-xs">
                          Valor a baixar
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            R$
                          </span>
                          <Input
                            id="corporateAmount"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={corporateAmount}
                            onChange={(e) => setCorporateAmount(e.target.value)}
                            className="pl-10 h-9"
                          />
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {/* Personal Section */}
            {!shouldHideTransactionSections && (
            <Collapsible open={personalOpen} onOpenChange={setPersonalOpen}>
              <div className="rounded-lg border p-4 space-y-3">
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <h3 className="font-medium text-sm flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" />
                      Minha Parte
                      <span className="text-muted-foreground font-normal">
                        ({formatCurrency(myTotalToPay)})
                      </span>
                    </h3>
                    {personalOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="includePersonal"
                      checked={includePersonal}
                      onCheckedChange={(checked) => setIncludePersonal(!!checked)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="includePersonal"
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        Incluir minha parte no pagamento
                      </label>
                    </div>
                  </div>

                  {includePersonal && (
                    <div className="space-y-4 pl-6">
                      <div className="space-y-2">
                        <Label className="text-xs">Valor a pagar</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            R$
                          </span>
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={personalAmount}
                            onChange={(e) => setPersonalAmount(e.target.value)}
                            className="pl-10 h-9"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-xs">Como você vai pagar?</Label>
                        <RadioGroup
                          value={personalPaymentType}
                          onValueChange={(v) => {
                            setPersonalPaymentType(v as "bank" | "external");
                            setLinkToTransaction(false);
                            setLinkedTransactionId("");
                          }}
                          className="space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="bank" id="bank" />
                            <Label htmlFor="bank" className="text-sm cursor-pointer">
                              Débito em conta bancária
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="external" id="external" />
                            <Label htmlFor="external" className="text-sm cursor-pointer flex items-center gap-1">
                              <ExternalLink className="h-3 w-3" />
                              Já paguei externamente
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      {personalPaymentType === "bank" && (
                        <div className="space-y-3">
                          {/* Link to existing transaction */}
                          <div className="flex items-start space-x-3">
                            <Checkbox
                              id="linkToTransaction"
                              checked={linkToTransaction}
                              onCheckedChange={(checked) => {
                                setLinkToTransaction(!!checked);
                                if (!checked) setLinkedTransactionId("");
                              }}
                            />
                            <div className="grid gap-1.5 leading-none">
                              <label
                                htmlFor="linkToTransaction"
                                className="text-sm font-medium leading-none cursor-pointer flex items-center gap-1"
                              >
                                <LinkIcon className="h-3 w-3" />
                                Vincular a transação existente
                              </label>
                              <p className="text-xs text-muted-foreground">
                                Evita duplicidade se você já importou o extrato.
                              </p>
                            </div>
                          </div>

                          {linkToTransaction ? (
                            <Select value={linkedTransactionId} onValueChange={setLinkedTransactionId}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Selecione a transação" />
                              </SelectTrigger>
                              <SelectContent>
                                {isLoadingCandidates ? (
                                  <div className="p-2 text-center text-sm text-muted-foreground">
                                    Carregando...
                                  </div>
                                ) : bankCandidates.length === 0 ? (
                                  <div className="p-2 text-center text-sm text-muted-foreground">
                                    Nenhuma transação encontrada
                                  </div>
                                ) : (
                                  bankCandidates.map((tx) => (
                                    <SelectItem key={tx.id} value={tx.id}>
                                      <span className="flex items-center gap-2 text-xs">
                                        <span className="truncate max-w-[180px]">{tx.description}</span>
                                        <span className="text-muted-foreground">
                                          {formatCurrency(tx.amount)}
                                        </span>
                                      </span>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Select value={accountId} onValueChange={setAccountId}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Selecione a conta" />
                              </SelectTrigger>
                              <SelectContent>
                                {bankAccounts.map((acc) => (
                                  <SelectItem key={acc.id} value={acc.id}>
                                    <span className="flex items-center gap-2">
                                      <span>{acc.icon}</span>
                                      <span>{acc.name}</span>
                                      <span className="text-muted-foreground text-xs">
                                        ({formatCurrency(Number(acc.current_balance))})
                                      </span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}

                      {personalPaymentType === "external" && (
                        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          Não altera saldo de nenhuma conta, apenas baixa a fatura.
                        </p>
                      )}
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
            )}

            {/* Residual Balance Section */}
            {hasResidualBalance && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  ⚠️ Saldo Residual
                  <span className="text-muted-foreground font-normal">
                    ({formatCurrency(calculatedResidual)})
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Este valor não está vinculado a transações específicas (pode ser juros, IOF, taxas ou diferenças de importação).
                </p>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="includeResidual"
                    checked={includeResidual}
                    onCheckedChange={(checked) => setIncludeResidual(!!checked)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="includeResidual"
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      Incluir saldo residual no pagamento
                    </label>
                  </div>
                </div>

                {includeResidual && (
                  <div className="space-y-4 pl-6">
                    <div className="space-y-2">
                      <Label className="text-xs">Valor a pagar</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          R$
                        </span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={residualAmount}
                          onChange={(e) => setResidualAmount(e.target.value)}
                          className="pl-10 h-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs">Como você vai pagar?</Label>
                      <RadioGroup
                        value={residualPaymentType}
                        onValueChange={(v) => {
                          setResidualPaymentType(v as "bank" | "external");
                          setResidualLinkToTransaction(false);
                          setResidualLinkedTransactionId("");
                        }}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="bank" id="residual-bank" />
                          <Label htmlFor="residual-bank" className="text-sm cursor-pointer">
                            Débito em conta bancária
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="external" id="residual-external" />
                          <Label htmlFor="residual-external" className="text-sm cursor-pointer flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            Já paguei externamente
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {residualPaymentType === "bank" && (
                      <div className="space-y-3">
                        {/* Link to existing transaction */}
                        <div className="flex items-start space-x-3">
                          <Checkbox
                            id="residualLinkToTransaction"
                            checked={residualLinkToTransaction}
                            onCheckedChange={(checked) => {
                              setResidualLinkToTransaction(!!checked);
                              if (!checked) setResidualLinkedTransactionId("");
                            }}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor="residualLinkToTransaction"
                              className="text-sm font-medium leading-none cursor-pointer flex items-center gap-1"
                            >
                              <LinkIcon className="h-3 w-3" />
                              Vincular a transação existente
                            </label>
                            <p className="text-xs text-muted-foreground">
                              Evita duplicidade se você já importou o extrato.
                            </p>
                          </div>
                        </div>

                        {residualLinkToTransaction ? (
                          <Select value={residualLinkedTransactionId} onValueChange={setResidualLinkedTransactionId}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Selecione a transação" />
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingResidualCandidates ? (
                                <div className="p-2 text-center text-sm text-muted-foreground">
                                  Carregando...
                                </div>
                              ) : residualCandidates.length === 0 ? (
                                <div className="p-2 text-center text-sm text-muted-foreground">
                                  Nenhuma transação encontrada
                                </div>
                              ) : (
                                residualCandidates.map((tx) => (
                                  <SelectItem key={tx.id} value={tx.id}>
                                    <span className="flex items-center gap-2 text-xs">
                                      <span className="truncate max-w-[180px]">{tx.description}</span>
                                      <span className="text-muted-foreground">
                                        {formatCurrency(tx.amount)}
                                      </span>
                                    </span>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select value={residualAccountId} onValueChange={setResidualAccountId}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Selecione a conta" />
                            </SelectTrigger>
                            <SelectContent>
                              {bankAccounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  <span className="flex items-center gap-2">
                                    <span>{acc.icon}</span>
                                    <span>{acc.name}</span>
                                    <span className="text-muted-foreground text-xs">
                                      ({formatCurrency(Number(acc.current_balance))})
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}

                    {residualPaymentType === "external" && (
                      <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                        Não altera saldo de nenhuma conta, apenas baixa a fatura.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Payment Summary */}
            <div className="rounded-lg border bg-primary/5 p-4 space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                📝 Resumo da Operação
              </h3>

              <div className="space-y-2 text-sm">
                {includeCorporate && parseFloat(corporateAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Baixa corporativa</span>
                    <span className="font-medium">{formatCurrency(parseFloat(corporateAmount))}</span>
                  </div>
                )}
                
                {includePersonal && parseFloat(personalAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {personalPaymentType === "bank"
                        ? linkToTransaction
                          ? "Vincular transação"
                          : "Débito em conta"
                        : "Pagamento externo"}
                    </span>
                    <span className="font-medium">{formatCurrency(parseFloat(personalAmount))}</span>
                  </div>
                )}

                {includeResidual && parseFloat(residualAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Saldo residual {residualPaymentType === "bank"
                        ? residualLinkToTransaction
                          ? "(vincular)"
                          : "(débito)"
                        : "(externo)"}
                    </span>
                    <span className="font-medium">{formatCurrency(parseFloat(residualAmount))}</span>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nova fatura após pagamento</span>
                  <span className={cn("font-bold", remainingAfterPayment === 0 ? "text-green-600" : "text-amber-600")}>
                    {formatCurrency(remainingAfterPayment)}
                  </span>
                </div>
              </div>

              <Progress value={paymentPercentage} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {paymentPercentage.toFixed(0)}% da fatura será paga
              </p>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="text-xs">Data do Pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pagando...
                </>
              ) : (
                "Confirmar Pagamento"
              )}
            </Button>
          </div>
      </ResponsiveDialog>

      {/* Invoice Items Modal */}
      <InvoiceItemsModal
        open={showItemsModal}
        onOpenChange={setShowItemsModal}
        transactions={transactions}
        selectedItems={selectedItems.length > 0 ? selectedItems : transactions.map((t) => t.id)}
        onConfirm={handleItemsSelected}
      />
    </>
  );
}
