import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Loader2, Briefcase, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  duplicateFrom?: Transaction | null;
}

export function TransactionModal({ open, onOpenChange, transaction, duplicateFrom }: TransactionModalProps) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [status, setStatus] = useState<"completed" | "pending">("completed");
  const [paymentMethod, setPaymentMethod] = useState<"account" | "credit_card">("account");
  const [isCorporateExpense, setIsCorporateExpense] = useState(false);
  const [saveRule, setSaveRule] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState("");
  
  const { incomeCategories, expenseCategories } = useCategories();
  const { accounts } = useAccounts();
  const { creditCards } = useCreditCards();
  const { createTransaction, updateTransaction } = useTransactions();
  const { createRule } = useCategorizationRules();

  const isEditing = !!transaction;
  const isDuplicating = !!duplicateFrom;
  const categories = type === "income" ? incomeCategories : expenseCategories;

  // Source data for editing or duplicating
  const sourceData = transaction || duplicateFrom;

  // Initialize form with transaction data when editing or duplicating
  useEffect(() => {
    if (sourceData) {
      setType(sourceData.type as "income" | "expense");
      setDescription(sourceData.description);
      setAmount(String(sourceData.amount));
      setCategoryId(sourceData.category_id || "");
      setAccountId(sourceData.account_id || "");
      setCreditCardId(sourceData.credit_card_id || "");
      // For duplicating, use today's date; for editing, use original date
      setDate(isDuplicating ? new Date() : parseISO(sourceData.date));
      setStatus(sourceData.status as "completed" | "pending");
      setPaymentMethod(sourceData.credit_card_id ? "credit_card" : "account");
      setIsCorporateExpense(sourceData.is_corporate_expense || false);
      setSaveRule(false);
      setRuleKeyword("");
    } else {
      setType("expense");
      setDescription("");
      setAmount("");
      setCategoryId("");
      setAccountId("");
      setCreditCardId("");
      setDate(new Date());
      setStatus("completed");
      setPaymentMethod("account");
      setIsCorporateExpense(false);
      setSaveRule(false);
      setRuleKeyword("");
    }
  }, [sourceData, open, isDuplicating]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const transactionData = {
      description,
      amount: parseFloat(amount),
      type,
      category_id: categoryId || null,
      account_id: paymentMethod === "account" ? (accountId || null) : null,
      credit_card_id: paymentMethod === "credit_card" ? (creditCardId || null) : null,
      date: format(date, "yyyy-MM-dd"),
      status,
      is_corporate_expense: isCorporateExpense,
    };

    // Save categorization rule if checkbox is checked and keyword is provided
    if (saveRule && ruleKeyword.trim()) {
      await createRule.mutateAsync({
        keyword: ruleKeyword.trim(),
        category_id: categoryId || null,
        is_corporate: isCorporateExpense,
      });
    }

    if (isEditing && transaction) {
      await updateTransaction.mutateAsync({ id: transaction.id, ...transactionData });
    } else {
      await createTransaction.mutateAsync(transactionData);
    }

    onOpenChange(false);
  };

  const isPending = createTransaction.isPending || updateTransaction.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Transação" : isDuplicating ? "Duplicar Transação" : "Nova Transação"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              required
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.icon} {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Cartão de Crédito</Label>
              <Select value={creditCardId} onValueChange={setCreditCardId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cartão" />
                </SelectTrigger>
                <SelectContent>
                  {creditCards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      💳 {card.name} (*{card.last_digits})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>

          {/* Corporate Expense - Only show for expenses */}
          {type === "expense" && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <Label htmlFor="corporate-expense" className="text-sm font-medium cursor-pointer">
                    Despesa da Empresa
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
      </DialogContent>
    </Dialog>
  );
}
