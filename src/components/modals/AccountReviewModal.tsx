import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, AlertCircle, Sparkles, Loader2, Plus, Ban, Briefcase, ChevronsUpDown, CreditCard, RefreshCw, ArrowRightLeft } from "lucide-react";
import { accountLookupRange, findAccountDuplicates, matchManualEntries } from "@/lib/deduplication";
import { collapseSplitGroups } from "@/lib/splitTransaction";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { fetchRealizedNetForAccount } from "@/lib/accountBalance";
import { anchorInitialBalance } from "@/lib/accountAnchor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  CommandSeparator,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreditCards } from "@/hooks/useCreditCards";
import { suggestCardForPayment } from "@/lib/cardPaymentMatch";
import { useCategories, groupCategoriesByParent } from "@/hooks/useCategories";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AccountImportedItem } from "./AccountImportModal";

// Patterns to detect credit card payment transactions
const CARD_PAYMENT_PATTERNS = [
  'FATURA PAGA',
  'PAG FATURA',
  'PAGAMENTO FATURA',
  'FATURA CARTAO',
  'FATURA CARTÃO',
  'PAG CARTAO',
  'PAG CARTÃO',
  'PGTO FATURA',
  'VISA FATURA',
  'MASTERCARD FATURA',
  'ELO FATURA',
  'AMEX FATURA',
  'HIPERCARD FATURA',
];

const isCardPaymentDescription = (description: string): boolean => {
  const upperDesc = description.toUpperCase();
  return CARD_PAYMENT_PATTERNS.some(pattern => upperDesc.includes(pattern));
};

// Helper component to show current system balance (computed dynamically) in sync dialog
function SyncSystemBalance({ accountId }: { accountId: string }) {
  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const balance = account ? account.computed_balance : null;
  
  if (balance === null) return <Loader2 className="h-4 w-4 animate-spin mx-auto" />;
  return (
    <p className={cn("text-lg font-bold", balance >= 0 ? "text-foreground" : "text-expense")}>
      R$ {balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
    </p>
  );
}

interface ReviewItem extends AccountImportedItem {
  category_id: string | null;
  original_category_id: string | null;
  remember_category: boolean;
  rule_keyword: string;
  isDuplicate: boolean;
  forceImport: boolean;
  is_corporate: boolean;
  remember_corporate: boolean;
  corporate_keyword: string;
  is_card_payment: boolean;
  /** Cartão que o pagamento de fatura pagou — sugerido pelo nome, confirmado na revisão. */
  paid_card_id: string | null;
  original_description: string;
  matchedPendingId: string | null;
  matchedPendingDescription: string | null;
  /** Previsto já DIVIDIDO que o extrato confirma: todas as partes. */
  matchedPendingSplitIds: string[];
  /** Lançamento feito à mão que esta linha do extrato confirma (ver matchManualEntries). */
  matchedManual: { ids: string[]; description: string; date: string } | null;
}

interface AccountReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AccountImportedItem[];
  accountId: string;
  accountName: string;
  bankBalance?: number | null;
}

export function AccountReviewModal({
  open,
  onOpenChange,
  items,
  accountId,
  accountName,
  bankBalance,
}: AccountReviewModalProps) {
  const { user } = useAuth();
  const { categories, createCategory } = useCategories();
  const { findCategoryForDescription, findCorporateForDescription, createRule } = useCategorizationRules();
  const { createTransaction } = useTransactions();
  const { updateAccount } = useAccounts();
  const { creditCards } = useCreditCards();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [showBalanceSync, setShowBalanceSync] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [openCategoryIndex, setOpenCategoryIndex] = useState<number | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const colorOptions = [
    "#EF4444", "#F97316", "#F59E0B", "#22C55E", 
    "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280"
  ];

  // Track if initialization has already run for current items
  const hasInitializedRef = useRef(false);
  const itemsKeyRef = useRef<string>("");

  // Create a stable key for items to detect real changes
  const getItemsKey = useCallback((items: AccountImportedItem[]) => {
    return items.map(i => `${i.date}-${i.amount}-${i.description}`).join("|");
  }, []);

  // Initialize review items with suggested categories and check duplicates
  useEffect(() => {
    const currentItemsKey = getItemsKey(items);
    
    // Skip if already initialized with these exact items
    if (hasInitializedRef.current && itemsKeyRef.current === currentItemsKey) {
      return;
    }

    const initializeItems = async () => {
      if (items.length === 0 || !open || !user) return;
      
      hasInitializedRef.current = true;
      itemsKeyRef.current = currentItemsKey;
      setIsCheckingDuplicates(true);
      
      try {
        // Só o período do extrato (com a folga das regras de casamento) e
        // paginado: a conta inteira numa consulta só esbarrava no teto de 1000
        // linhas do PostgREST, e o que ficava de fora entrava de novo como novo.
        const range = accountLookupRange(items);
        const existing = range
          ? await fetchAllRows((from, to) =>
              supabase
                .from("transactions")
                // split_group_id/split_parent_id: uma despesa dividida ocupa
                // várias linhas aqui, mas o extrato traz o lançamento cheio — a
                // dedup soma as partes antes de comparar.
                .select("id, date, amount, type, description, original_description, status, is_provisional, split_group_id, split_parent_id")
                .eq("account_id", accountId)
                .gte("date", range.from)
                .lte("date", range.to)
                .order("id", { ascending: true })
                .range(from, to),
            )
          : [];

        // Separate pending/provisional transactions for matching
        const pendingTransactions = existing.filter(tx => tx.status === 'pending' || tx.is_provisional);
        const completedTransactions = existing
          .filter(tx => tx.status === 'completed' && !tx.is_provisional)
          .map(tx => ({ id: tx.id, date: tx.date, amount: Number(tx.amount), type: tx.type, description: tx.description, original_description: tx.original_description, split_group_id: tx.split_group_id, split_parent_id: tx.split_parent_id }));

        // Use robust deduplication against completed transactions only
        const duplicateRows = findAccountDuplicates(
          items.map(i => ({ date: i.date, description: i.description, amount: i.amount })),
          completedTransactions,
        );

        // Track which pending transactions have already been matched
        const usedPendingIds = new Set<string>();

        // Pendentes também são colapsadas: uma parcela futura já dividida
        // ocupa duas linhas, e o extrato traz o débito cheio.
        const pendingRows = collapseSplitGroups(
          pendingTransactions.map(tx => ({ ...tx, amount: Number(tx.amount) })),
        );

        const itemsWithCategories = items.map((item, index) => {
          const suggestedCategoryId = findCategoryForDescription(item.description);
          const isCorporate = findCorporateForDescription(item.description);
          let isDuplicate = duplicateRows.has(index);

          // Try to match against pending/provisional transactions
          let matchedPendingId: string | null = null;
          let matchedPendingDescription: string | null = null;
          let matchedPendingSplitIds: string[] = [];
          if (!isDuplicate) {
            const pendingMatch = pendingRows.find(tx => {
              if (usedPendingIds.has(tx.id)) return false;
              const sameDate = tx.date === item.date;
              const sameAmount = Math.abs(Number(tx.amount) - item.amount) < 0.05;
              return sameDate && sameAmount;
            });
            if (pendingMatch?.isSplitGroup) {
              // O gasto já está lançado e rateado. Converter pela primária
              // (descrição, categoria) quebraria a divisão, então nada novo é
              // criado — mas as partes são CONFIRMADAS juntas no import. Antes
              // ficavam pendentes para sempre: fora do saldo da conta, que só
              // conta o realizado.
              isDuplicate = true;
              matchedPendingSplitIds = pendingMatch.splitMemberIds;
              pendingMatch.splitMemberIds.forEach(id => usedPendingIds.add(id));
            } else if (pendingMatch) {
              matchedPendingId = pendingMatch.id;
              matchedPendingDescription = pendingMatch.description;
              usedPendingIds.add(pendingMatch.id);
            }
          }

          return {
            ...item,
            category_id: suggestedCategoryId,
            original_category_id: suggestedCategoryId,
            remember_category: false,
            rule_keyword: item.description.toUpperCase(),
            isDuplicate,
            forceImport: false,
            is_corporate: isCorporate,
            remember_corporate: false,
            corporate_keyword: item.description.toUpperCase(),
            is_card_payment: isCardPaymentDescription(item.description),
            paid_card_id: isCardPaymentDescription(item.description)
              ? suggestCardForPayment(item.description, creditCards)
              : null,
            original_description: item.description,
            matchedPendingId,
            matchedPendingDescription,
            matchedPendingSplitIds,
            matchedManual: null as ReviewItem["matchedManual"],
          };
        });

        // Lançado à mão antes do extrato: a regra exata não o reconhece (não
        // tem o texto do banco) e a linha entraria de novo. Só para o que
        // nenhuma regra anterior resolveu.
        const manualMatches = matchManualEntries(items, completedTransactions, {
          items: new Set(itemsWithCategories.flatMap((it, i) => (it.isDuplicate || it.matchedPendingId ? [i] : []))),
          existingIds: new Set([...duplicateRows.values()].flatMap(row => row.splitMemberIds)),
        });

        setReviewItems(itemsWithCategories.map((item, index) => {
          const manual = manualMatches.get(index);
          return manual
            ? { ...item, isDuplicate: true, matchedManual: { ids: manual.splitMemberIds, description: manual.description, date: manual.date } }
            : item;
        }));
      } catch (error) {
        console.error("Error checking duplicates:", error);
        // Sem a checagem, toda linha aparece como nova — inclusive as que já
        // estão no sistema. Antes o erro da consulta era ignorado e isso
        // acontecia em silêncio.
        toast({
          title: "Não foi possível verificar duplicatas",
          description: "Todas as linhas aparecem como novas. Feche e importe de novo antes de confirmar.",
          variant: "destructive",
        });
        const itemsWithCategories = items.map((item) => {
          const suggestedCategoryId = findCategoryForDescription(item.description);
          const isCorporate = findCorporateForDescription(item.description);
          return {
            ...item,
            category_id: suggestedCategoryId,
            original_category_id: suggestedCategoryId,
            remember_category: false,
            rule_keyword: item.description.toUpperCase(),
            isDuplicate: false,
            forceImport: false,
            is_corporate: isCorporate,
            remember_corporate: false,
            corporate_keyword: item.description.toUpperCase(),
            is_card_payment: isCardPaymentDescription(item.description),
            paid_card_id: isCardPaymentDescription(item.description)
              ? suggestCardForPayment(item.description, creditCards)
              : null,
            original_description: item.description,
            matchedPendingId: null,
            matchedPendingDescription: null,
            matchedPendingSplitIds: [],
            matchedManual: null,
          };
        });
        setReviewItems(itemsWithCategories);
      } finally {
        setIsCheckingDuplicates(false);
      }
    };

    initializeItems();
  }, [items, open, accountId, user, getItemsKey, findCategoryForDescription, findCorporateForDescription, creditCards, toast]);

  // Reset initialization flag when modal closes
  useEffect(() => {
    if (!open) {
      hasInitializedRef.current = false;
      itemsKeyRef.current = "";
    }
  }, [open]);

  const handleCategoryChange = (index: number, categoryId: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              category_id: categoryId,
              remember_category: item.original_category_id !== categoryId ? item.remember_category : false,
            }
          : item
      )
    );
    setOpenCategoryIndex(null);
    setCategorySearch("");
  };

  const handleRememberChange = (index: number, remember: boolean) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, remember_category: remember } : item
      )
    );
  };

  const handleRuleKeywordChange = (index: number, keyword: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, rule_keyword: keyword.toUpperCase() } : item
      )
    );
  };

  const handleCorporateKeywordChange = (index: number, keyword: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, corporate_keyword: keyword.toUpperCase() } : item
      )
    );
  };

  const handleForceImportChange = (index: number, force: boolean) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, forceImport: force } : item
      )
    );
  };

  const handleCorporateChange = (index: number, isCorporate: boolean) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, is_corporate: isCorporate, remember_corporate: false }
          : item
      )
    );
  };

  const handleRememberCorporateChange = (index: number, remember: boolean) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, remember_corporate: remember } : item
      )
    );
  };

  const handlePaidCardChange = (index: number, cardId: string | null) => {
    setReviewItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, paid_card_id: cardId } : item))
    );
  };

  const handleDescriptionChange = (index: number, description: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, description } : item
      )
    );
  };

  const handleCreateCategory = async (index: number, type: "income" | "expense", name: string) => {
    if (!name.trim()) return;
    
    setIsCreatingCategory(true);
    try {
      const newCategory = await createCategory.mutateAsync({
        name: name.trim(),
        icon: "📦",
        color: colorOptions[Math.floor(Math.random() * colorOptions.length)],
        type,
      });
      
      handleCategoryChange(index, newCategory.id);
      setCategorySearch("");
      toast({
        title: `Categoria "${name}" criada!`,
        description: "A categoria foi criada e aplicada à transação.",
      });
    } catch (error) {
      console.error("Error creating category:", error);
      toast({
        title: "Erro ao criar categoria",
        variant: "destructive",
      });
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);

    try {
      // Separate items: new imports vs pending matches
      const itemsToImport = reviewItems.filter(
        (item) => !item.isDuplicate || item.forceImport
      );
      const newItems = itemsToImport.filter(item => !item.matchedPendingId);
      const pendingMatches = itemsToImport.filter(item => item.matchedPendingId);

      // First, create categorization rules for items marked to remember
      const rulesToCreate = itemsToImport
        .filter((item) => item.remember_category && item.category_id && item.category_id !== item.original_category_id && item.rule_keyword.trim())
        .map((item) => ({
          keyword: item.rule_keyword.trim(),
          category_id: item.category_id!,
          is_corporate: item.is_corporate,
        }));

      const corporateRulesToCreate = itemsToImport
        .filter((item) => item.remember_corporate && item.is_corporate && item.corporate_keyword.trim())
        .map((item) => ({
          keyword: item.corporate_keyword.trim(),
          category_id: item.category_id || null,
          is_corporate: true,
        }));

      for (const rule of [...rulesToCreate, ...corporateRulesToCreate]) {
        await createRule.mutateAsync(rule);
      }

      let successCount = 0;
      let errorCount = 0;
      let convertedCount = 0;

      // Convert pending matches to completed
      for (const item of pendingMatches) {
        try {
          const { error } = await supabase
            .from("transactions")
            .update({
              status: "completed",
              is_provisional: false,
              description: item.description,
              original_description: item.original_description,
              category_id: item.category_id || undefined,
              is_corporate_expense: item.is_corporate,
              is_card_payment: item.is_card_payment,
              ...(item.is_card_payment && item.paid_card_id
                ? { credit_card_id: item.paid_card_id }
                : {}),
            })
            .eq("id", item.matchedPendingId!);
          
          if (error) throw error;
          convertedCount++;
          successCount++;
        } catch (error) {
          console.error("Error converting pending transaction:", error);
          errorCount++;
        }
      }

      // Previstos já divididos que o extrato confirmou: todas as partes juntas
      // (o débito do extrato é a cobrança inteira). Só o status muda —
      // descrição e categoria de cada parte são o motivo da divisão.
      // "Importar mesmo assim" (forceImport) cria um lançamento novo e deixa
      // o previsto como está, como já fazia.
      for (const item of reviewItems) {
        if (!item.isDuplicate || item.forceImport || item.matchedPendingSplitIds.length === 0) continue;
        const { error } = await supabase
          .from("transactions")
          .update({ status: "completed", is_provisional: false })
          .in("id", item.matchedPendingSplitIds);
        if (error) {
          console.error("Error confirming split pending transaction:", error);
          errorCount++;
        } else {
          convertedCount++;
          successCount++;
        }
      }

      // Lançamento manual reconhecido no extrato: nada novo é criado, e ele
      // passa a carregar o texto e a data do banco. Sem isso, a próxima
      // importação de um extrato que cubra o mesmo dia não o reconheceria — a
      // regra exata compara os dois, e como importado ele deixa de ser
      // candidato manual — e a linha voltaria como nova.
      let manualLinkedCount = 0;
      for (const item of reviewItems) {
        if (!item.matchedManual || item.forceImport) continue;
        const { error } = await supabase
          .from("transactions")
          .update({ original_description: item.original_description, date: item.date })
          .in("id", item.matchedManual.ids);
        if (error) {
          console.error("Error linking manual transaction:", error);
          errorCount++;
        } else {
          manualLinkedCount++;
        }
      }

      // Create new transactions
      for (const item of newItems) {
        try {
          await createTransaction.mutateAsync({
            description: item.description,
            original_description: item.original_description,
            amount: item.amount,
            date: item.date,
            type: item.type,
            category_id: item.category_id || null,
            account_id: accountId,
            // Pagamento de fatura leva o cartão pago, como o de "Pagar Fatura →
            // Vincular": a conta diz de onde saiu, o cartão diz o que foi pago.
            // Sem ele o pagamento não existia para a fatura (ver cardPaymentMatch).
            credit_card_id: item.is_card_payment ? item.paid_card_id : null,
            status: "completed",
            is_corporate_expense: item.is_corporate,
            is_reimbursable: false,
            is_refund: false,
            is_card_payment: item.is_card_payment,
            refunded_transaction_id: null,
            reimbursement_status: item.is_corporate ? "pending" : null,
            installment_group_id: null,
            installment_number: null,
            total_installments: null,
            silent: true,
          });
          successCount++;
        } catch (error) {
          console.error("Error creating transaction:", error);
          errorCount++;
        }
      }

      // Balance is now computed dynamically from transactions,
      // no need for incremental current_balance updates.
      // If bank balance available, show sync dialog to adjust initial_balance
      if (bankBalance != null) {
        setShowBalanceSync(true);
      } else {
        // Just invalidate to recalculate
        queryClient.invalidateQueries({ queryKey: ["accounts"] });
      }

      const skippedCount = reviewItems.length - itemsToImport.length - manualLinkedCount;
      const corporateCount = itemsToImport.filter((item) => item.is_corporate).length;
      const totalRules = rulesToCreate.length + corporateRulesToCreate.length;

      let description = `${successCount} transações importadas`;
      if (convertedCount > 0) {
        description += ` • ${convertedCount} previstos convertidos`;
      }
      if (manualLinkedCount > 0) {
        description += ` • ${manualLinkedCount} lançados à mão vinculados ao extrato`;
      }
      if (errorCount > 0) {
        description += ` • ${errorCount} erros`;
      }
      if (skippedCount > 0) {
        description += ` • ${skippedCount} duplicatas ignoradas`;
      }
      if (corporateCount > 0) {
        description += ` • ${corporateCount} reembolsos pendentes`;
      }
      if (totalRules > 0) {
        description += ` • ${totalRules} regras criadas`;
      }

      toast({
        title: errorCount > 0 ? "Extrato importado com erros" : "Extrato importado com sucesso!",
        description,
        variant: errorCount > 0 ? "destructive" : "default",
      });

      const shouldPromptSync = bankBalance != null;
      if (!shouldPromptSync) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error importing statement:", error);
      toast({
        title: "Erro ao importar extrato",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncBalance = async () => {
    if (bankBalance == null) return;
    try {
      // A soma vem de fetchRealizedNetForAccount, a mesma das outras telas que
      // gravam âncora. Esta era uma quarta cópia, e errava de três jeitos, todos
      // GRAVADOS em initial_balance: não paginava (soma truncada acima de 1000
      // lançamentos), ignorava o erro da consulta (soma 0, âncora = saldo do
      // banco inteiro) e cortava "hoje" em UTC (depois das 21h, o lançamento
      // de amanhã já entrava).
      const txNet = await fetchRealizedNetForAccount(accountId);

      await updateAccount.mutateAsync({
        id: accountId,
        initial_balance: anchorInitialBalance(bankBalance, txNet),
      });
      toast({
        title: "Saldo sincronizado!",
        description: `Saldo atualizado para R$ ${bankBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      });
    } catch (error) {
      toast({
        title: "Erro ao sincronizar saldo",
        variant: "destructive",
      });
    }
    onOpenChange(false);
  };

  const handleKeepBalance = () => {
    onOpenChange(false);
  };

  const incomeCategories = categories.filter(c => c.type === "income");
  const expenseCategories = categories.filter(c => c.type === "expense");

  const totalIncome = reviewItems
    .filter((item) => item.type === "income" && (!item.isDuplicate || item.forceImport))
    .reduce((sum, item) => sum + item.amount, 0);

  const totalExpense = reviewItems
    .filter((item) => item.type === "expense" && (!item.isDuplicate || item.forceImport))
    .reduce((sum, item) => sum + item.amount, 0);

  const uncategorizedCount = reviewItems.filter(
    (item) => !item.category_id && (!item.isDuplicate || item.forceImport)
  ).length;

  const duplicateCount = reviewItems.filter((item) => item.isDuplicate && !item.forceImport && !item.matchedManual).length;
  const manualMatchCount = reviewItems.filter((item) => item.matchedManual && !item.forceImport).length;
  
  const corporateCount = reviewItems.filter(
    (item) => item.is_corporate && item.type === "expense" && (!item.isDuplicate || item.forceImport)
  ).length;

  const pendingMatchCount = reviewItems.filter(item => item.matchedPendingId && (!item.isDuplicate || item.forceImport)).length;

  // Balance sync view after import
  if (showBalanceSync && bankBalance != null) {
    return (
      <Dialog open={open} onOpenChange={() => onOpenChange(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Sincronizar Saldo
            </DialogTitle>
            <DialogDescription>
              O saldo do banco no extrato é diferente do saldo registrado no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Saldo do Banco</p>
                <p className="text-lg font-bold text-foreground">
                  R$ {bankBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Saldo do Sistema</p>
                <SyncSystemBalance accountId={accountId} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleKeepBalance}>
                Manter Saldo Atual
              </Button>
              <Button className="flex-1" onClick={handleSyncBalance}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sincronizar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={isImporting ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Revisar Importação
          </DialogTitle>
          <DialogDescription>
            {accountName} - {reviewItems.length} transações encontradas
          </DialogDescription>
        </DialogHeader>

        {isCheckingDuplicates && (
          <div className="flex-shrink-0 flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-primary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Verificando duplicatas...</span>
          </div>
        )}

        {!isCheckingDuplicates && duplicateCount > 0 && (
          <div className="flex-shrink-0 flex items-start gap-2 p-3 rounded-lg bg-muted text-muted-foreground text-sm">
            <Ban className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {duplicateCount} {duplicateCount === 1 ? "transação já importada será ignorada" : "transações já importadas serão ignoradas"}
            </span>
          </div>
        )}

        {!isCheckingDuplicates && manualMatchCount > 0 && (
          <div className="flex-shrink-0 flex items-start gap-2 p-3 rounded-lg bg-accent/50 text-accent-foreground text-sm">
            <ArrowRightLeft className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {manualMatchCount} {manualMatchCount === 1 ? "lançamento feito à mão confere com o extrato e será vinculado a ele" : "lançamentos feitos à mão conferem com o extrato e serão vinculados a ele"}, sem duplicar. Confira o par; se for outro lançamento, marque “Importar mesmo assim”.
            </span>
          </div>
        )}

        {!isCheckingDuplicates && pendingMatchCount > 0 && (
          <div className="flex-shrink-0 flex items-start gap-2 p-3 rounded-lg bg-accent/50 text-accent-foreground text-sm">
            <ArrowRightLeft className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {pendingMatchCount} {pendingMatchCount === 1 ? "lançamento previsto será convertido em realizado" : "lançamentos previstos serão convertidos em realizados"}
            </span>
          </div>
        )}

        {uncategorizedCount > 0 && (
          <div className="flex-shrink-0 flex items-start gap-2 p-3 rounded-lg bg-chart-4/10 text-chart-4 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {uncategorizedCount} {uncategorizedCount === 1 ? "item precisa" : "itens precisam"} de categorização
            </span>
          </div>
        )}

        <ScrollArea className="h-[400px] -mx-6 px-6 pr-3">
          <div className="space-y-3 pr-3">
            {reviewItems.map((item, index) => {
              const categoryChanged = item.category_id !== item.original_category_id;
              const relevantCategories = item.type === "income" ? incomeCategories : expenseCategories;
              const category = categories.find((c) => c.id === item.category_id);
              
              // Filter categories based on search
              const filteredCategories = relevantCategories.filter((cat) =>
                (cat.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
                 (cat.fullName && cat.fullName.toLowerCase().includes(categorySearch.toLowerCase())))
              );
              
              // Check if search matches any existing category
              const searchMatchesExisting = relevantCategories.some(
                (cat) => cat.name.toLowerCase() === categorySearch.toLowerCase()
              );
              
              // Group filtered categories by parent
              const groupedCategories = groupCategoriesByParent(filteredCategories);

              return (
                <div
                  key={index}
                  className={cn(
                    "border rounded-lg p-3 space-y-3 transition-all",
                    item.isDuplicate && !item.forceImport && "opacity-50 bg-muted/50",
                    !item.category_id && !item.isDuplicate && "border-chart-4/30",
                    item.type === "income" && !item.isDuplicate && "border-l-4 border-l-income",
                    item.type === "expense" && !item.isDuplicate && "border-l-4 border-l-expense"
                  )}
                >
                  {/* Linha 1: Data, Descrição e Valor */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">{item.date}</span>
                        {item.isDuplicate && item.matchedPendingSplitIds.length === 0 && !item.matchedManual && (
                          <Badge variant="secondary" className="text-xs flex-shrink-0">
                            Já importada
                          </Badge>
                        )}
                        {item.matchedManual && !item.forceImport && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 bg-accent text-accent-foreground border-accent">
                            <ArrowRightLeft className="h-3 w-3 mr-1" />
                            Lançado à mão: {item.matchedManual.description}
                            {item.matchedManual.date !== item.date && ` (${item.matchedManual.date})`}
                          </Badge>
                        )}
                        {item.isDuplicate && item.matchedPendingSplitIds.length > 0 && !item.forceImport && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 bg-accent text-accent-foreground border-accent">
                            <ArrowRightLeft className="h-3 w-3 mr-1" />
                            Previsto dividido — as {item.matchedPendingSplitIds.length} partes serão confirmadas
                          </Badge>
                        )}
                        {item.is_corporate && !item.isDuplicate && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 text-primary border-primary">
                            <Briefcase className="h-3 w-3 mr-1" />
                            Reembolso
                          </Badge>
                        )}
                        {item.is_card_payment && !item.isDuplicate && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 bg-purple-500/10 text-purple-600 border-purple-500/30">
                            <CreditCard className="h-3 w-3 mr-1" />
                            Pag. Fatura
                          </Badge>
                        )}
                        {item.matchedPendingId && !item.isDuplicate && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 bg-accent text-accent-foreground border-accent">
                            <ArrowRightLeft className="h-3 w-3 mr-1" />
                            Previsto: {item.matchedPendingDescription}
                          </Badge>
                        )}
                      </div>
                      <Input
                        value={item.description}
                        onChange={(e) => handleDescriptionChange(index, e.target.value)}
                        className="h-7 text-sm font-medium mt-1"
                        placeholder="Descrição"
                      />
                      {item.is_card_payment && !item.isDuplicate && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">Cartão pago</span>
                          <Select
                            value={item.paid_card_id ?? "none"}
                            onValueChange={(v) => handlePaidCardChange(index, v === "none" ? null : v)}
                          >
                            <SelectTrigger className="h-7 text-xs" aria-label="Cartão pago">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Não vincular (cartão não cadastrado)</SelectItem>
                              {creditCards.map((card) => (
                                <SelectItem key={card.id} value={card.id}>
                                  💳 {card.name} (*{card.last_digits})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <p className={cn(
                      "text-sm font-semibold whitespace-nowrap",
                      item.type === "income" ? "text-income" : "text-expense"
                    )}>
                      {item.type === "income" ? "+" : "-"} R$ {item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {item.isDuplicate && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`force-${index}`}
                        checked={item.forceImport}
                        onCheckedChange={(checked) =>
                          handleForceImportChange(index, checked === true)
                        }
                      />
                      <label
                        htmlFor={`force-${index}`}
                        className="text-xs text-muted-foreground cursor-pointer"
                      >
                        Importar mesmo assim
                      </label>
                    </div>
                  )}

                  {(!item.isDuplicate || item.forceImport) && (
                    <>
                      {/* Linha 2: Categoria e Checkbox de Lembrar */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Combobox de Categoria com Busca e Criação */}
                        <Popover 
                          open={openCategoryIndex === index} 
                          onOpenChange={(open) => {
                            setOpenCategoryIndex(open ? index : null);
                            if (!open) setCategorySearch("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "h-8 justify-between flex-1 min-w-[180px] text-xs",
                                !item.category_id && "border-chart-4/50 text-muted-foreground"
                              )}
                            >
                              {category ? (
                                <span className="flex items-center gap-2 truncate">
                                  <span>{category.icon}</span>
                                  <span>{category.fullName || category.name}</span>
                                </span>
                              ) : (
                                "Selecione uma categoria..."
                              )}
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[250px] p-0" align="start">
                            <Command>
                              <CommandInput 
                                placeholder="Buscar ou criar categoria..." 
                                value={categorySearch}
                                onValueChange={setCategorySearch}
                              />
                              <CommandList>
                                <CommandEmpty className="py-2 px-3 text-sm">
                                  {categorySearch.trim() && !searchMatchesExisting && (
                                    <Button
                                      variant="ghost"
                                      className="w-full justify-start h-8 text-xs"
                                      onClick={() => handleCreateCategory(index, item.type, categorySearch)}
                                      disabled={isCreatingCategory}
                                    >
                                      {isCreatingCategory ? (
                                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                      ) : (
                                        <Plus className="h-3 w-3 mr-2" />
                                      )}
                                      Criar "{categorySearch}"
                                    </Button>
                                  )}
                                  {!categorySearch.trim() && "Nenhuma categoria encontrada."}
                                </CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="none"
                                    onSelect={() => handleCategoryChange(index, "")}
                                    className="text-muted-foreground"
                                  >
                                    <span className="mr-2">⊘</span>
                                    Sem categoria
                                    {!item.category_id && (
                                      <Check className="ml-auto h-4 w-4" />
                                    )}
                                  </CommandItem>
                                </CommandGroup>
                                {groupedCategories.map((group, groupIndex) => (
                                  <CommandGroup 
                                    key={groupIndex} 
                                    heading={group.parent ? `${group.parent.icon} ${group.parent.name}` : undefined}
                                  >
                                    {group.children.map((cat) => (
                                      <CommandItem
                                        key={cat.id}
                                        value={cat.fullName || cat.name}
                                        onSelect={() => handleCategoryChange(index, cat.id)}
                                        className={group.parent ? "pl-4" : ""}
                                      >
                                        <span className="mr-2">{cat.icon}</span>
                                        {group.parent ? cat.name : (cat.fullName || cat.name)}
                                        {item.category_id === cat.id && (
                                          <Check className="ml-auto h-4 w-4" />
                                        )}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                ))}
                                {categorySearch.trim() && !searchMatchesExisting && filteredCategories.length > 0 && (
                                  <>
                                    <CommandSeparator />
                                    <CommandGroup>
                                      <CommandItem
                                        onSelect={() => handleCreateCategory(index, item.type, categorySearch)}
                                        disabled={isCreatingCategory}
                                      >
                                        {isCreatingCategory ? (
                                          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                        ) : (
                                          <Plus className="h-3 w-3 mr-2" />
                                        )}
                                        Criar "{categorySearch}"
                                      </CommandItem>
                                    </CommandGroup>
                                  </>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>

                        {item.original_category_id && (
                          <Badge variant="secondary" className="text-xs flex-shrink-0">
                            <Sparkles className="h-3 w-3 mr-1" />
                            Auto
                          </Badge>
                        )}

                        {/* Checkbox Lembrar Categoria */}
                        {categoryChanged && item.category_id && (
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`remember-${index}`}
                              checked={item.remember_category}
                              onCheckedChange={(checked) =>
                                handleRememberChange(index, checked === true)
                              }
                            />
                            <label
                              htmlFor={`remember-${index}`}
                              className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
                            >
                              Lembrar regra
                            </label>
                          </div>
                        )}

                        {/* Checkbox Pedir Reembolso */}
                        {item.type === "expense" && (
                          <div className="flex items-center gap-1.5">
                            <Checkbox
                              id={`corporate-${index}`}
                              checked={item.is_corporate}
                              onCheckedChange={(checked) =>
                                handleCorporateChange(index, checked === true)
                              }
                            />
                            <label
                              htmlFor={`corporate-${index}`}
                              className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1 whitespace-nowrap"
                            >
                              <Briefcase className="h-3 w-3" />
                              Reembolso
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Linha 3: Input de Keyword da Regra (Condicional) */}
                      {item.remember_category && categoryChanged && item.category_id && (
                        <div className="space-y-1.5 pt-1 border-t border-dashed">
                          <label className="text-xs text-muted-foreground">
                            Se a descrição contiver o texto:
                          </label>
                          <Input
                            value={item.rule_keyword}
                            onChange={(e) => handleRuleKeywordChange(index, e.target.value)}
                            placeholder="Digite o texto chave para identificação"
                            className="h-8 text-xs font-mono"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            → Será categorizado como "{category?.name}"
                          </p>
                        </div>
                      )}

                      {/* Linha 4: Checkbox e Input de Regra Corporativa (Condicional) */}
                      {item.is_corporate && item.type === "expense" && (
                        <div className="space-y-2 pt-1 border-t border-dashed">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`remember-corporate-${index}`}
                              checked={item.remember_corporate}
                              onCheckedChange={(checked) =>
                                handleRememberCorporateChange(index, checked === true)
                              }
                            />
                            <label
                              htmlFor={`remember-corporate-${index}`}
                              className="text-xs text-muted-foreground cursor-pointer"
                            >
                              Lembrar como despesa corporativa
                            </label>
                          </div>
                          
                          {item.remember_corporate && (
                            <div className="space-y-1.5 ml-5">
                              <label className="text-xs text-muted-foreground">
                                Se a descrição contiver o texto:
                              </label>
                              <Input
                                value={item.corporate_keyword}
                                onChange={(e) => handleCorporateKeywordChange(index, e.target.value)}
                                placeholder="Digite o texto chave para identificação"
                                className="h-8 text-xs font-mono"
                              />
                              <p className="text-[10px] text-muted-foreground">
                                → Será marcado como despesa corporativa (reembolso)
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2 border-t pt-4">
          <div className="flex-1 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Entradas: </span>
              <span className="font-semibold text-income">
                +R$ {totalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Saídas: </span>
              <span className="font-semibold text-expense">
                -R$ {totalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {corporateCount > 0 && (
              <div className="flex items-center gap-1">
                <Briefcase className="h-3 w-3 text-primary" />
                <span className="text-muted-foreground">Reembolsos: </span>
                <span className="font-semibold text-primary">{corporateCount} {corporateCount === 1 ? "item" : "itens"}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
            >
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={isImporting || isCheckingDuplicates}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Importação
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
