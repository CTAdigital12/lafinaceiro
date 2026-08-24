import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, addMonths } from "date-fns";
import { todayYmd } from "@/lib/dateUtils";
import { installmentStatus, isFutureYmd } from "@/lib/transactionStatus";
import { calculateCardDueDate } from "@/lib/creditCardCycle";
import { CalendarIcon, Loader2, Briefcase, BookMarked, Check, ChevronsUpDown, RotateCcw, Layers, ReceiptText, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useProjects } from "@/hooks/useProjects";
import { FolderKanban } from "lucide-react";

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  duplicateFrom?: Transaction | null;
  refundFrom?: Transaction | null;
}

export function TransactionModal({ open, onOpenChange, transaction, duplicateFrom, refundFrom }: TransactionModalProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date | null>(null);
  
  // Track original values for due_date preservation logic
  const [originalDate, setOriginalDate] = useState<Date | null>(null);
  const [originalCardId, setOriginalCardId] = useState<string | null>(null);
  const [originalDueDate, setOriginalDueDate] = useState<Date | null>(null);
  const [status, setStatus] = useState<"completed" | "pending">("completed");
  const [paymentMethod, setPaymentMethod] = useState<"account" | "credit_card">("account");
  const [isCorporateExpense, setIsCorporateExpense] = useState(false);
  const [isReimbursable, setIsReimbursable] = useState(false);
  const [isRefund, setIsRefund] = useState(false);
  const [isCardPayment, setIsCardPayment] = useState(false);
  const [refundedTransactionId, setRefundedTransactionId] = useState<string | null>(null);
  const [saveRule, setSaveRule] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [openCategoryPopover, setOpenCategoryPopover] = useState(false);
  const [openAccountPopover, setOpenAccountPopover] = useState(false);
  const [openCardPopover, setOpenCardPopover] = useState(false);
  const [openProjectPopover, setOpenProjectPopover] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  
  // Installment-related state
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentNumber, setInstallmentNumber] = useState(1);
  const [totalInstallments, setTotalInstallments] = useState(2);
  
  const { incomeCategories, expenseCategories, categories: allCategories } = useCategories();
  const { accounts } = useAccounts();
  const { creditCards } = useCreditCards();
  const { activeProjects } = useProjects();
  const { createTransaction, updateTransaction } = useTransactions();
  const { createRule } = useCategorizationRules();

  const isEditing = !!transaction;
  const isDuplicating = !!duplicateFrom;
  const isCreatingRefund = !!refundFrom;
  const categories = type === "income" ? incomeCategories : expenseCategories;
  
  // Find selected category with full info
  const selectedCategory = allCategories.find(c => c.id === categoryId);
  
  // Group categories by parent for hierarchical display
  const groupedCategories = (() => {
    const parentCategories = categories.filter(c => !c.parent_id);
    const childCategories = categories.filter(c => c.parent_id);
    
    const groups: { parent: typeof categories[0] | null; children: typeof categories }[] = [];
    
    parentCategories.forEach(parent => {
      const children = childCategories.filter(c => c.parent_id === parent.id);
      if (children.length > 0) {
        groups.push({ parent, children });
      } else {
        groups.push({ parent: null, children: [parent] });
      }
    });
    
    const groupedChildIds = groups.flatMap(g => g.children.map(c => c.id));
    const orphans = childCategories.filter(c => !groupedChildIds.includes(c.id));
    if (orphans.length > 0) {
      groups.push({ parent: null, children: orphans });
    }
    
    return groups;
  })();

  // Source data for editing, duplicating, or creating refund
  const sourceData = transaction || duplicateFrom || refundFrom;

  // Initialize form with transaction data when editing, duplicating, or creating refund
  useEffect(() => {
    if (refundFrom) {
      // Creating a refund from an existing transaction
      setType(refundFrom.type as "income" | "expense");
      setDescription(`Extorno: ${refundFrom.description}`);
      setAmount(Number(refundFrom.amount));
      setCategoryId(refundFrom.category_id || "");
      setAccountId(refundFrom.account_id || "");
      setCreditCardId(refundFrom.credit_card_id || "");
      setDate(new Date());
      setStatus("completed");
      setPaymentMethod(refundFrom.credit_card_id ? "credit_card" : "account");
      setIsCorporateExpense(refundFrom.is_corporate_expense || false);
      setIsReimbursable(false);
      setIsRefund(true);
      setIsCardPayment(false);
      setRefundedTransactionId(refundFrom.id);
      setProjectId(null);
      setSaveRule(false);
      setRuleKeyword("");
    } else if (sourceData) {
      setType(sourceData.type as "income" | "expense");
      setDescription(sourceData.description);
      setAmount(Number(sourceData.amount));
      setCategoryId(sourceData.category_id || "");
      setAccountId(sourceData.account_id || "");
      setCreditCardId(sourceData.credit_card_id || "");
      // For duplicating, use today's date; for editing, use original date
      setDate(isDuplicating ? new Date() : parseISO(sourceData.date));
      setDueDate(sourceData.due_date ? parseISO(sourceData.due_date) : null);
      setStatus(sourceData.status as "completed" | "pending");
      
      // Store original values for due_date preservation (only when editing, not duplicating)
      if (!isDuplicating && transaction) {
        setOriginalDate(parseISO(sourceData.date));
        setOriginalCardId(sourceData.credit_card_id || null);
        setOriginalDueDate(sourceData.due_date ? parseISO(sourceData.due_date) : null);
      } else {
        setOriginalDate(null);
        setOriginalCardId(null);
        setOriginalDueDate(null);
      }
      setPaymentMethod(sourceData.credit_card_id ? "credit_card" : "account");
      setIsCorporateExpense(sourceData.is_corporate_expense || false);
      setIsReimbursable(sourceData.is_reimbursable || false);
      setIsRefund(sourceData.is_refund || false);
      setIsCardPayment(sourceData.is_card_payment || false);
      setRefundedTransactionId(sourceData.refunded_transaction_id || null);
      setProjectId(sourceData.project_id || null);
      setSaveRule(false);
      setRuleKeyword("");
    } else {
      setType("expense");
      setDescription("");
      setAmount(undefined);
      setCategoryId("");
      setAccountId("");
      setCreditCardId("");
      setDate(new Date());
      setStatus("completed");
      setPaymentMethod("account");
      setIsCorporateExpense(false);
      setIsReimbursable(false);
      setIsRefund(false);
      setIsCardPayment(false);
      setRefundedTransactionId(null);
      setProjectId(null);
      setSaveRule(false);
      setRuleKeyword("");
      setIsInstallment(false);
      setInstallmentNumber(1);
      setTotalInstallments(2);
      setDueDate(null);
      setOriginalDate(null);
      setOriginalCardId(null);
      setOriginalDueDate(null);
    }
  }, [sourceData, open, isDuplicating, refundFrom]);

  // Auto-suggest pending status when the transaction lands in the future.
  //
  // A versão anterior só olhava `dueDate` — o campo OPCIONAL de vencimento
  // manual. Quem deixava ele em branco e escolhia uma DATA futura (o caminho
  // normal) não era coberto, apesar de a própria tela prometer "Se a data for
  // futura, a transação será marcada como pendente". A promessa existia no
  // rótulo e não existia no código.
  //
  // O efeito prático era silencioso e tardio: a transação nascia "Concluída",
  // ficava fora do saldo enquanto a data era futura (`fetchRealizedNetByAccount`
  // corta em `date <= hoje`) e passava a pesar sozinha no dia em que a data
  // chegava — semanas depois, sem nada ter mudado na tela. Foi assim que uma
  // parcela de empréstimo não paga derrubou o saldo em R$ 1.500,00.
  //
  // Comparação em `yyyy-MM-dd` e não `Date > Date`: `date` é meia-noite local e
  // `new Date()` é agora, então escolher HOJE parecia passado por algumas horas
  // e futuro por nenhuma — a granularidade certa aqui é o dia.
  useEffect(() => {
    if (paymentMethod !== "account") return;
    const effective = dueDate ?? date;
    if (isFutureYmd(format(effective, "yyyy-MM-dd"), todayYmd())) {
      setStatus("pending");
    }
  }, [date, dueDate, paymentMethod]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Save categorization rule if checkbox is checked and keyword is provided
    if (saveRule && ruleKeyword.trim()) {
      await createRule.mutateAsync({
        keyword: ruleKeyword.trim(),
        category_id: categoryId || null,
        is_corporate: isCorporateExpense,
      });
    }

    // Handle installment creation (only for new transactions)
    if (isInstallment && !isEditing) {
      const groupId = crypto.randomUUID();
      const baseDate = (paymentMethod === "account" && dueDate) ? dueDate : date;

      const selectedCard = paymentMethod === "credit_card" && creditCardId
        ? creditCards.find(c => c.id === creditCardId)
        : undefined;

      /**
       * Vencimento da parcela `offset` (0 = primeira).
       *
       * Antes, toda parcela recebia como due_date a própria data da parcela —
       * o parcelamento ignorava fechamento e vencimento do cartão, e a mesma
       * compra caía em faturas diferentes conforme fosse parcelada ou avulsa.
       * Agora o cartão passa pela mesma regra da compra avulsa, uma fatura
       * por parcela.
       */
      const installmentDueDate = (offset: number): Date => {
        // Data manual informada pelo usuário manda, como na compra avulsa.
        if (dueDate) return addMonths(dueDate, offset);
        if (selectedCard) return calculateCardDueDate(date, selectedCard, offset);
        // Conta sem data manual: vence na própria data da parcela.
        return addMonths(baseDate, offset);
      };

      // Create all installments from current number to total
      for (let i = installmentNumber; i <= totalInstallments; i++) {
        const offset = i - installmentNumber;
        const installmentDate = addMonths(baseDate, offset);

        // Só a primeira parcela herda o status escolhido; as demais nascem
        // pendentes. E nem a primeira pode nascer "Concluída" com data futura:
        // dizer que já foi paga uma parcela que ainda não venceu é o defeito
        // que este PR fecha, e a guarda aqui vale mesmo para cartão, onde o
        // efeito acima (restrito a `account`) não roda.
        const parcelaStatus = installmentStatus({
          isFirst: i === installmentNumber,
          dateYmd: format(installmentDate, "yyyy-MM-dd"),
          chosen: status,
          todayYmd: todayYmd(),
        });

        const installmentData = {
          description: `${description} ${i}/${totalInstallments}`,
          amount: amount ?? 0,
          type,
          category_id: categoryId || null,
          account_id: paymentMethod === "account" ? (accountId || null) : null,
          credit_card_id: paymentMethod === "credit_card" ? (creditCardId || null) : null,
          date: format(installmentDate, "yyyy-MM-dd"),
          due_date: format(installmentDueDate(offset), "yyyy-MM-dd"),
          status: parcelaStatus,
          is_corporate_expense: isCorporateExpense,
          is_reimbursable: isReimbursable,
          is_refund: false,
          is_card_payment: false,
          refunded_transaction_id: null,
          installment_group_id: groupId,
          installment_number: i,
          total_installments: totalInstallments,
          project_id: projectId || null,
        };

        await createTransaction.mutateAsync(installmentData);
      }
    } else {
      // Normal single transaction creation/update
      // Calculate due_date for credit card transactions
      const calculateDueDate = (): string | null => {
        // Se o usuário definiu uma data manual, usar ela
        if (dueDate) {
          return format(dueDate, "yyyy-MM-dd");
        }
        
        // Se editando e NÃO mudou data nem cartão, preservar original
        if (isEditing && originalDueDate) {
          const dateChanged = !originalDate || format(date, "yyyy-MM-dd") !== format(originalDate, "yyyy-MM-dd");
          const cardChanged = creditCardId !== originalCardId;
          
          if (!dateChanged && !cardChanged) {
            return format(originalDueDate, "yyyy-MM-dd"); // Preserva original
          }
        }
        
        if (paymentMethod !== "credit_card" || !creditCardId) return null;
        
        const selectedCard = creditCards.find(c => c.id === creditCardId);
        if (!selectedCard) return null;

        return format(calculateCardDueDate(date, selectedCard), "yyyy-MM-dd");
      };

      const transactionData = {
        description,
        amount: amount ?? 0,
        type,
        category_id: categoryId || null,
        account_id: paymentMethod === "account" ? (accountId || null) : null,
        credit_card_id: paymentMethod === "credit_card" ? (creditCardId || null) : null,
        date: format(date, "yyyy-MM-dd"),
        due_date: calculateDueDate(),
        status,
        is_corporate_expense: isCorporateExpense,
        is_reimbursable: isReimbursable,
        is_refund: isRefund,
        is_card_payment: paymentMethod === "account" ? isCardPayment : false,
        refunded_transaction_id: refundedTransactionId,
        installment_group_id: isEditing && transaction ? transaction.installment_group_id : null,
        installment_number: isEditing && transaction ? transaction.installment_number : null,
        total_installments: isEditing && transaction ? transaction.total_installments : null,
        project_id: projectId || null,
      };

      if (isEditing && transaction) {
        // If editing a provisional transaction, confirm it as real
        const provisionalUpdate = transaction.is_provisional 
          ? { is_provisional: false, status: "completed" as const } 
          : {};
        await updateTransaction.mutateAsync({ id: transaction.id, ...transactionData, ...provisionalUpdate });
        
        // Sync category to all installments in the group
        if (transaction.installment_group_id && categoryId !== transaction.category_id) {
          await supabase
            .from("transactions")
            .update({ category_id: categoryId || null })
            .eq("installment_group_id", transaction.installment_group_id);
        }
      } else {
        await createTransaction.mutateAsync(transactionData);
      }
    }

    onOpenChange(false);
  };

  const isPending = createTransaction.isPending || updateTransaction.isPending;

  const modalTitle = isEditing ? "Editar Transação" : isDuplicating ? "Duplicar Transação" : isCreatingRefund ? "Criar Extorno" : "Nova Transação";

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={modalTitle}>
      <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provisional Warning */}
          {isEditing && transaction?.is_provisional && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
              ⏱️ Esta é uma <strong>previsão</strong>. Edite o valor real e salve para confirmar o pagamento.
            </div>
          )}
          {/* Type Toggle */}
          <div className="flex rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-medium transition-all",
                type === "expense"
                  ? "bg-expense text-expense-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Despesa
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-medium transition-all",
                type === "income"
                  ? "bg-income text-income-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Receita
            </button>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Supermercado"
              required
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Valor</Label>
            <CurrencyInput
              id="amount"
              value={amount}
              onValueChange={setAmount}
              required
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Popover open={openCategoryPopover} onOpenChange={setOpenCategoryPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCategoryPopover}
                  className="w-full justify-between"
                >
                {selectedCategory ? (
                    <span className="flex items-center gap-2">
                      {selectedCategory.parentName && (
                        <>
                          <span className="text-muted-foreground">{selectedCategory.parentIcon || selectedCategory.parentName}</span>
                          <span className="text-muted-foreground">&gt;</span>
                        </>
                      )}
                      {selectedCategory.icon}
                      {selectedCategory.name}
                    </span>
                  ) : (
                    "Selecione uma categoria"
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar categoria..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                    {groupedCategories.map((group, index) => (
                      <CommandGroup 
                        key={group.parent?.id || `group-${index}`}
                        heading={group.parent ? (
                          <span className="flex items-center gap-1">
                            {group.parent.icon} {group.parent.name}
                          </span>
                        ) : undefined}
                      >
                        {group.children.map((cat) => (
                          <CommandItem
                            key={cat.id}
                            value={cat.fullName || cat.name}
                            onSelect={() => {
                              setCategoryId(cat.id);
                              if (cat.is_reimbursable) {
                                setIsReimbursable(true);
                              }
                              setOpenCategoryPopover(false);
                            }}
                            className={cn(group.parent && "pl-4")}
                          >
                            <Check
                              className={cn("mr-2 h-4 w-4", categoryId === cat.id ? "opacity-100" : "opacity-0")}
                            />
                            <span className="mr-2">{cat.icon}</span>
                            {cat.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Payment Method Toggle */}
          <div className="space-y-2">
            <Label>Método de Pagamento</Label>
            <div className="flex rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setPaymentMethod("account")}
                className={cn(
                  "flex-1 rounded-md py-2 text-sm font-medium transition-all",
                  paymentMethod === "account"
                    ? "bg-background shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Conta
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("credit_card")}
                className={cn(
                  "flex-1 rounded-md py-2 text-sm font-medium transition-all",
                  paymentMethod === "credit_card"
                    ? "bg-background shadow"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Cartão de Crédito
              </button>
            </div>
          </div>

          {/* Account or Credit Card */}
          {paymentMethod === "account" ? (
            <div className="space-y-2">
              <Label>Conta</Label>
              <Popover open={openAccountPopover} onOpenChange={setOpenAccountPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openAccountPopover}
                    className="w-full justify-between"
                  >
                    {accountId ? (
                      <span className="flex items-center gap-2">
                        {accounts.find(a => a.id === accountId)?.icon}
                        {accounts.find(a => a.id === accountId)?.name}
                      </span>
                    ) : (
                      "Selecione uma conta"
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar conta..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
                      <CommandGroup>
                        {accounts.map((acc) => (
                          <CommandItem
                            key={acc.id}
                            value={acc.name}
                            onSelect={() => {
                              setAccountId(acc.id);
                              setOpenAccountPopover(false);
                            }}
                          >
                            <Check
                              className={cn("mr-2 h-4 w-4", accountId === acc.id ? "opacity-100" : "opacity-0")}
                            />
                            <span className="mr-2">{acc.icon}</span>
                            {acc.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Cartão de Crédito</Label>
              <Popover open={openCardPopover} onOpenChange={setOpenCardPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCardPopover}
                    className="w-full justify-between"
                  >
                    {creditCardId ? (
                      <span className="flex items-center gap-2">
                        💳 {creditCards.find(c => c.id === creditCardId)?.name} (*{creditCards.find(c => c.id === creditCardId)?.last_digits})
                      </span>
                    ) : (
                      "Selecione um cartão"
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cartão..." />
                    <CommandList>
                      <CommandEmpty>Nenhum cartão encontrado.</CommandEmpty>
                      <CommandGroup>
                        {creditCards.map((card) => (
                          <CommandItem
                            key={card.id}
                            value={`${card.name} ${card.last_digits}`}
                            onSelect={() => {
                              setCreditCardId(card.id);
                              setOpenCardPopover(false);
                            }}
                          >
                            <Check
                              className={cn("mr-2 h-4 w-4", creditCardId === card.id ? "opacity-100" : "opacity-0")}
                            />
                            💳 {card.name} (*{card.last_digits})
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Installment Toggle */}
          {!isEditing && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="installment" className="text-sm font-medium cursor-pointer">
                      É compra parcelada?
                    </Label>
                    <p className="text-xs text-muted-foreground">Cria todas as parcelas automaticamente</p>
                  </div>
                </div>
                <Switch
                  id="installment"
                  checked={isInstallment}
                  onCheckedChange={setIsInstallment}
                />
              </div>
              
              {isInstallment && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="installment-number" className="text-xs text-muted-foreground">
                      Parcela Atual
                    </Label>
                    <Input
                      id="installment-number"
                      type="number"
                      min={1}
                      max={totalInstallments}
                      value={installmentNumber}
                      onChange={(e) => setInstallmentNumber(Math.max(1, Math.min(parseInt(e.target.value) || 1, totalInstallments)))}
                      className="text-center"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="total-installments" className="text-xs text-muted-foreground">
                      Total de Parcelas
                    </Label>
                    <Input
                      id="total-installments"
                      type="number"
                      min={2}
                      max={48}
                      value={totalInstallments}
                      onChange={(e) => {
                        const newTotal = Math.max(2, Math.min(parseInt(e.target.value) || 2, 48));
                        setTotalInstallments(newTotal);
                        if (installmentNumber > newTotal) setInstallmentNumber(newTotal);
                      }}
                      className="text-center"
                    />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Serão criadas {totalInstallments - installmentNumber + 1} parcelas (da {installmentNumber}ª até a {totalInstallments}ª)
                  </p>
                </div>
              )}
            </div>
          )}


          {/* Project / Caixinha */}
          {activeProjects.length > 0 && (
            <div className="space-y-2">
              <Label>Projeto / Caixinha</Label>
              <Popover open={openProjectPopover} onOpenChange={setOpenProjectPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    {projectId ? (
                      <span className="flex items-center gap-2">
                        {activeProjects.find(p => p.id === projectId)?.icon}
                        {activeProjects.find(p => p.id === projectId)?.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Nenhum projeto</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar projeto..." />
                    <CommandList>
                      <CommandEmpty>Nenhum projeto encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => { setProjectId(null); setOpenProjectPopover(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", !projectId ? "opacity-100" : "opacity-0")} />
                          Nenhum projeto
                        </CommandItem>
                        {activeProjects.map((proj) => (
                          <CommandItem
                            key={proj.id}
                            value={proj.name}
                            onSelect={() => { setProjectId(proj.id); setOpenProjectPopover(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", projectId === proj.id ? "opacity-100" : "opacity-0")} />
                            <span className="mr-2">{proj.icon}</span>
                            {proj.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}


          {/* Date */}
          <div className="space-y-2">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "dd/MM/yyyy") : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
          </Popover>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label>{paymentMethod === "credit_card" ? "Data de Vencimento" : "Data de Vencimento (opcional)"}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, "dd/MM/yyyy") : paymentMethod === "credit_card" ? "Calculada automaticamente" : "Selecione a data de vencimento"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDate ?? undefined}
                  onSelect={(d) => setDueDate(d ?? null)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              {paymentMethod === "credit_card" 
                ? "Deixe em branco para calcular com base no fechamento do cartão"
                : "Se a data for futura, a transação será marcada como pendente"}
            </p>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "completed" | "pending")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Concluída</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
            {isInstallment && (
              <p className="text-xs text-muted-foreground">
                Vale para a {installmentNumber}ª parcela; as seguintes são criadas como
                pendentes. Parcela com data futura nasce pendente de qualquer forma.
              </p>
            )}
          </div>

          {/* Refund Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <RotateCcw className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <Label htmlFor="refund" className="text-sm font-medium cursor-pointer">
                  Extorno
                </Label>
                <p className="text-xs text-muted-foreground">
                  {type === "expense" ? "Devolução/estorno de compra" : "Devolução de receita"}
                </p>
              </div>
            </div>
            <Switch
              id="refund"
              checked={isRefund}
              onCheckedChange={setIsRefund}
              disabled={isCreatingRefund}
            />
          </div>

          {/* Corporate Transaction - Show for both expenses and income */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <Label htmlFor="corporate-expense" className="text-sm font-medium cursor-pointer">
                  Transação Corporativa
                </Label>
                <p className="text-xs text-muted-foreground">Não contabilizar no orçamento pessoal</p>
              </div>
            </div>
            <Switch
              id="corporate-expense"
              checked={isCorporateExpense}
              onCheckedChange={setIsCorporateExpense}
            />
          </div>

          {/* Card Payment - Only show for expenses paid via account */}
          {type === "expense" && paymentMethod === "account" && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <Label htmlFor="card-payment" className="text-sm font-medium cursor-pointer">
                    Pagamento de Fatura
                  </Label>
                  <p className="text-xs text-muted-foreground">Marcar como pagamento de fatura de cartão</p>
                </div>
              </div>
              <Switch
                id="card-payment"
                checked={isCardPayment}
                onCheckedChange={setIsCardPayment}
              />
            </div>
          )}

          {/* Reimbursable Expense - Only show for expenses */}
          {type === "expense" && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ReceiptText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Label htmlFor="reimbursable-expense" className="text-sm font-medium cursor-pointer">
                    Despesa Reembolsável
                  </Label>
                  <p className="text-xs text-muted-foreground">Será listada em Reembolsos Diversos</p>
                </div>
              </div>
              <Switch
                id="reimbursable-expense"
                checked={isReimbursable}
                onCheckedChange={setIsReimbursable}
              />
            </div>
          )}

          {/* Save Rule */}
          <div className="space-y-3 p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <Checkbox
                id="save-rule"
                checked={saveRule}
                onCheckedChange={(checked) => setSaveRule(checked === true)}
              />
              <div className="flex items-center gap-2">
                <BookMarked className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="save-rule" className="text-sm font-medium cursor-pointer">
                  Lembrar regra de categorização
                </Label>
              </div>
            </div>
            
            {saveRule && (
              <div className="space-y-2 pl-6">
                <Label htmlFor="rule-keyword" className="text-xs text-muted-foreground">
                  Texto chave para identificação
                </Label>
                <Input
                  id="rule-keyword"
                  value={ruleKeyword}
                  onChange={(e) => setRuleKeyword(e.target.value)}
                  placeholder={description.toUpperCase().slice(0, 20) || "Ex: UBER, SPOTIFY"}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Transações contendo este texto serão automaticamente categorizadas
                  {categoryId && categories.find(c => c.id === categoryId) && (
                    <> como <strong>{categories.find(c => c.id === categoryId)?.name}</strong></>
                  )}
                  {isCorporateExpense && <> e marcadas como despesa corporativa</>}
                </p>
              </div>
            )}
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? (
              "Salvar Alterações"
            ) : (
              "Salvar Transação"
            )}
          </Button>
        </form>
    </ResponsiveDialog>
  );
}
