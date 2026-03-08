import { useState, useEffect, useMemo } from "react";
import { Check, AlertCircle, Sparkles, Loader2, Plus, Briefcase, Copy, MessageSquare, ChevronsUpDown, Info, AlertTriangle, CalendarClock, Trash2, RotateCcw, AlertOctagon } from "lucide-react";
import { logError } from "@/lib/errorHandler";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_COLOR_OPTIONS_COMPACT } from "@/lib/constants";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useCategories, groupCategoriesByParent } from "@/hooks/useCategories";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useTransactions } from "@/hooks/useTransactions";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useExistingInstallments, detectDuplicates } from "@/hooks/useExistingInstallments";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ImportedItem, ImportCompleteData } from "./InvoiceImportModal";
import { format, addMonths, parse } from "date-fns";

// Duplicate status for imported items
type DuplicateStatus = 'new' | 'duplicate' | 'rejected';

interface ReviewItem extends ImportedItem {
  category_id: string | null;
  original_category_id: string | null;
  remember_category: boolean;
  rule_keyword: string;
  is_corporate: boolean;
  remember_corporate: boolean;
  corporate_keyword: string;
  notes: string;
  add_future_installments: boolean;
  include_in_import: boolean;
  // Computed for display
  amount: number;
  date: string;
  due_date: string;
  // Deduplication fields
  duplicate_status: DuplicateStatus;
  matched_transaction_id: string | null;
  // Original description from parser (before user edits)
  original_description: string;
}

interface InvoiceReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importData: ImportCompleteData | null;
  creditCardId: string;
  creditCardName: string;
}

export function InvoiceReviewModal({
  open,
  onOpenChange,
  importData,
  creditCardId,
  creditCardName,
}: InvoiceReviewModalProps) {
  const { expenseCategories, createCategory } = useCategories();
  const { findCategoryForDescription, findCorporateForDescription, createRule } = useCategorizationRules();
  const { createTransaction } = useTransactions();
  const { updateCreditCard } = useCreditCards();
  const { toast } = useToast();

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [categorySearch, setCategorySearch] = useState("");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [openCategoryPopoverIndex, setOpenCategoryPopoverIndex] = useState<number | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [showPostClosingWarning, setShowPostClosingWarning] = useState(true);

  const items = importData?.items || [];
  const postClosingCount = importData?.post_closing_count || 0;
  const validationWarning = importData?.validation_warning;
  const invoiceMonth = importData?.invoice_month;
  const invoiceYear = importData?.invoice_year;
  const closingDay = importData?.closing_day;

  // Fetch existing installments for deduplication
  const { data: existingInstallments = [], isLoading: isLoadingExisting } = useExistingInstallments({
    creditCardId,
    month: invoiceMonth || 1,
    year: invoiceYear || new Date().getFullYear(),
    enabled: open && !!creditCardId && !!invoiceMonth && !!invoiceYear,
  });

  // Initialize review items with suggested categories, corporate status, and duplicate detection
  useEffect(() => {
    if (items.length > 0 && open && !isLoadingExisting) {
      // Get due_date from import data
      const invoiceDueDate = importData?.due_date || "";
      
      // Detect duplicates
      const duplicateMap = detectDuplicates(items, existingInstallments);
      
      const itemsWithCategories = items.map((item, index) => {
        const suggestedCategoryId = findCategoryForDescription(item.description);
        const suggestedCorporate = findCorporateForDescription(item.description);
        const isInstallment = !!(item.installment_current && item.installment_total && item.installment_current < item.installment_total);
        
        // Check if this item is a duplicate
        const matchedTransaction = duplicateMap.get(index);
        const isDuplicate = !!matchedTransaction;
        
        return {
          ...item,
          // Map new structure to legacy fields for display
          amount: item.transaction_value,
          date: item.purchase_date,
          due_date: item.due_date || invoiceDueDate,
          category_id: suggestedCategoryId,
          original_category_id: suggestedCategoryId,
          remember_category: false,
          rule_keyword: item.description.toUpperCase(),
          is_corporate: suggestedCorporate,
          remember_corporate: false,
          corporate_keyword: item.description.toUpperCase(),
          notes: "",
          add_future_installments: isInstallment && !isDuplicate, // Don't auto-check for duplicates
          include_in_import: isDuplicate ? false : !item.is_post_closing, // Exclude duplicates by default
          // Deduplication fields
          duplicate_status: isDuplicate ? 'duplicate' as DuplicateStatus : 'new' as DuplicateStatus,
          matched_transaction_id: matchedTransaction?.id || null,
          // Preserve original description from parser
          original_description: item.description,
        };
      });
      setReviewItems(itemsWithCategories);
      setExpandedNotes(new Set());
      setShowPostClosingWarning(postClosingCount > 0);
    }
  }, [items, open, findCategoryForDescription, findCorporateForDescription, postClosingCount, importData?.due_date, existingInstallments, isLoadingExisting]);

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
    setOpenCategoryPopoverIndex(null);
    setCategorySearch("");
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

  const handleRememberChange = (index: number, remember: boolean) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, remember_category: remember } : item
      )
    );
  };

  const handleCorporateChange = (index: number, isCorporate: boolean) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, is_corporate: isCorporate, remember_corporate: isCorporate ? item.remember_corporate : false } : item
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

  const handleNotesChange = (index: number, notes: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, notes } : item
      )
    );
  };

  const handleFutureInstallmentsChange = (index: number, add: boolean) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, add_future_installments: add } : item
      )
    );
  };

  const handleIncludeChange = (index: number, include: boolean) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, include_in_import: include } : item
      )
    );
  };

  // Reject item (mark as ignored)
  const handleRejectItem = (index: number) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, duplicate_status: 'rejected' as DuplicateStatus, include_in_import: false }
          : item
      )
    );
  };

  // Restore rejected item
  const handleRestoreItem = (index: number) => {
    setReviewItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        // Return to original status (new or duplicate)
        const wasOriginallyDuplicate = !!item.matched_transaction_id;
        return {
          ...item,
          duplicate_status: wasOriginallyDuplicate ? 'duplicate' as DuplicateStatus : 'new' as DuplicateStatus,
          include_in_import: !wasOriginallyDuplicate && !item.is_post_closing,
        };
      })
    );
  };

  // Force include a duplicate (user is sure it's not a duplicate)
  const handleForceInclude = (index: number) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, include_in_import: true } : item
      )
    );
  };

  // Select/Deselect all items
  const handleSelectAll = (selected: boolean) => {
    setReviewItems((prev) =>
      prev.map((item) => ({
        ...item,
        include_in_import:
          selected && item.duplicate_status !== 'rejected'
            ? item.duplicate_status === 'duplicate'
              ? item.include_in_import // Keep duplicate's current state
              : !item.is_post_closing // New items: check unless post-closing
            : false,
      }))
    );
  };

  const handleDescriptionChange = (index: number, description: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, description } : item
      )
    );
  };

  const toggleNotes = (index: number) => {
    setExpandedNotes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleCreateCategory = async (index: number, name: string, parentId?: string | null) => {
    if (!name.trim()) return;
    
    setIsCreatingCategory(true);
    try {
      const newCategory = await createCategory.mutateAsync({
        name: name.trim(),
        icon: "📦",
        color: CATEGORY_COLOR_OPTIONS_COMPACT[Math.floor(Math.random() * CATEGORY_COLOR_OPTIONS_COMPACT.length)],
        type: "expense",
        parent_id: parentId || null,
      });
      
      handleCategoryChange(index, newCategory.id);
      setCategorySearch("");
      toast({
        title: parentId ? `Subcategoria "${name}" criada!` : `Categoria "${name}" criada!`,
        description: "A categoria foi criada e aplicada à transação.",
      });
    } catch (error) {
      logError(error, "InvoiceReviewModal.createCategory");
      toast({
        title: "Erro ao criar categoria",
        variant: "destructive",
      });
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const generateFutureInstallments = (item: ReviewItem): Array<{
    description: string;
    amount: number;
    date: string;
    due_date: string;
    notes: string;
    category_id: string | null;
    is_corporate: boolean;
  }> => {
    if (!item.installment_current || !item.installment_total) return [];
    
    const futureInstallments: Array<{
      description: string;
      amount: number;
      date: string;
      due_date: string;
      notes: string;
      category_id: string | null;
      is_corporate: boolean;
    }> = [];
    
    // Use due_date as base for calculating future due dates (progressive)
    const baseDueDate = item.due_date ? parse(item.due_date, "yyyy-MM-dd", new Date()) : new Date();
    const remaining = item.installment_total - item.installment_current;
    
    const baseDescription = item.description
      .replace(/\s*\d+\/\d+\s*/g, " ")
      .replace(/\s*PARC\s*\d+\s*\/\s*\d+\s*/gi, " ")
      .replace(/\s*\(\d+\/\d+\)\s*/g, " ")
      .trim();
    
    for (let i = 1; i <= remaining; i++) {
      const installmentNumber = item.installment_current + i;
      // Progressive due date: base due date + i months
      const futureDueDate = addMonths(baseDueDate, i);
      
      futureInstallments.push({
        description: `${baseDescription} ${installmentNumber}/${item.installment_total}`,
        amount: item.amount,
        date: item.date, // purchase_date stays the same (original purchase date)
        due_date: format(futureDueDate, "yyyy-MM-dd"), // progressive due date
        notes: item.notes ? `${item.notes} (Parcela ${installmentNumber}/${item.installment_total})` : `Parcela ${installmentNumber}/${item.installment_total}`,
        category_id: item.category_id,
        is_corporate: item.is_corporate,
      });
    }
    
    return futureInstallments;
  };

  const handleImport = async () => {
    setIsImporting(true);

    try {
      // Only import items that are included
      const itemsToImport = reviewItems.filter(item => item.include_in_import);

      // First, create categorization rules for items marked to remember (using edited keywords)
      const rulesToCreate = itemsToImport
        .filter((item) => (item.remember_category && item.category_id && item.category_id.trim() !== "" && item.category_id !== item.original_category_id && item.rule_keyword.trim()) || (item.remember_corporate && item.corporate_keyword.trim()))
        .map((item) => ({
          keyword: item.remember_category ? item.rule_keyword.trim() : item.corporate_keyword.trim(),
          category_id: item.category_id && item.category_id.trim() !== "" ? item.category_id : null,
          is_corporate: item.is_corporate,
        }));

      const seenKeywords = new Set<string>();
      let rulesCreated = 0;
      for (const rule of rulesToCreate) {
        if (!seenKeywords.has(rule.keyword)) {
          seenKeywords.add(rule.keyword);
          try {
            await createRule.mutateAsync(rule);
            rulesCreated++;
          } catch (ruleError) {
            console.warn("Falha ao criar regra para:", rule.keyword, ruleError);
          }
        }
      }

      // Get current timestamp for imported_at
      const importedAt = new Date().toISOString();

      // Collect all transactions to create (including future installments)
      const allTransactions: Array<{
        description: string;
        original_description: string | null;
        amount: number;
        date: string;
        due_date: string | null;
        imported_at: string;
        type: "expense" | "income";
        category_id: string | null;
        credit_card_id: string;
        account_id: string | null;
        status: "completed" | "pending";
        is_corporate_expense: boolean;
        is_reimbursable: boolean;
        is_refund: boolean;
        is_card_payment: boolean;
        refunded_transaction_id: string | null;
        installment_group_id: string | null;
        installment_number: number | null;
        total_installments: number | null;
      }> = [];

      let futureInstallmentsCount = 0;

      for (const item of itemsToImport) {
        const categoryId = item.category_id && item.category_id.trim() !== "" ? item.category_id : null;
        
        // Generate installment_group_id for installments
        const hasInstallments = item.installment_current && item.installment_total && item.installment_total > 1;
        const installmentGroupId = hasInstallments ? crypto.randomUUID() : null;
        
        allTransactions.push({
          description: item.notes ? `${item.description} - ${item.notes}` : item.description,
          amount: item.amount,
          date: item.date,
          due_date: item.due_date || null,
          imported_at: importedAt,
          type: "expense",
          category_id: categoryId,
          credit_card_id: creditCardId,
          account_id: null,
          status: "completed",
          is_corporate_expense: item.is_corporate,
          is_reimbursable: false,
          is_refund: false,
          is_card_payment: false,
          refunded_transaction_id: null,
          installment_group_id: installmentGroupId,
          installment_number: item.installment_current || null,
          total_installments: item.installment_total || null,
        });

        // Add future installments if requested
        if (item.add_future_installments && item.installment_current && item.installment_total) {
          const futureItems = generateFutureInstallments(item);
          futureInstallmentsCount += futureItems.length;
          
          for (let i = 0; i < futureItems.length; i++) {
            const future = futureItems[i];
            const futureCategoryId = future.category_id && future.category_id.trim() !== "" ? future.category_id : null;
            const futureInstallmentNumber = item.installment_current + i + 1;
            
            allTransactions.push({
              description: future.notes ? `${future.description} - ${future.notes}` : future.description,
              amount: future.amount,
              date: future.date, // purchase_date (original)
              due_date: future.due_date, // progressive due_date
              imported_at: importedAt,
              type: "expense",
              category_id: futureCategoryId,
              credit_card_id: creditCardId,
              account_id: null,
              status: "pending",
              is_corporate_expense: future.is_corporate,
              is_reimbursable: false,
              is_refund: false,
              is_card_payment: false,
              refunded_transaction_id: null,
              installment_group_id: installmentGroupId,
              installment_number: futureInstallmentNumber,
              total_installments: item.installment_total,
            });
          }
        }
      }

      // Create all transactions
      let successCount = 0;
      let errorCount = 0;
      const totalTransactions = allTransactions.length;
      setImportProgress({ current: 0, total: totalTransactions });
      
      for (let i = 0; i < allTransactions.length; i++) {
        const transaction = allTransactions[i];
        try {
          await createTransaction.mutateAsync({ ...transaction, silent: true });
          successCount++;
        } catch (error) {
          console.error("Error creating transaction:", error);
          errorCount++;
        }
        setImportProgress({ current: i + 1, total: totalTransactions });
      }

      // Activate pending installments that were detected as duplicates
      const pendingIdsToActivate = reviewItems
        .filter(item => item.duplicate_status === 'duplicate' && !item.include_in_import && item.matched_transaction_id)
        .map(item => item.matched_transaction_id as string);

      if (pendingIdsToActivate.length > 0) {
        const { error: activateError } = await supabase
          .from("transactions")
          .update({ status: "completed" })
          .in("id", pendingIdsToActivate)
          .eq("status", "pending");

        if (activateError) {
          console.error("Error activating pending installments:", activateError);
        } else {
          console.log(`Activated ${pendingIdsToActivate.length} pending installments`);
        }
      }

      // Calculate total of completed transactions (current invoice items)
      const completedTotal = allTransactions
        .filter(t => t.status === "completed")
        .reduce((sum, t) => sum + t.amount, 0);

      // Update credit card current_invoice
      if (creditCardId && completedTotal > 0) {
        await updateCreditCard.mutateAsync({
          id: creditCardId,
          current_invoice: completedTotal,
        });
      }

      const corporateCount = itemsToImport.filter((item) => item.is_corporate).length;
      const excludedCount = reviewItems.filter(item => !item.include_in_import).length;

      let description = `${successCount} transações criadas`;
      if (futureInstallmentsCount > 0 && successCount > itemsToImport.length) {
        const futureCreated = successCount - itemsToImport.length;
        description += ` (${futureCreated} parcelas futuras)`;
      }
      if (errorCount > 0) {
        description += ` • ${errorCount} erros`;
      }
      if (corporateCount > 0) {
        description += ` • ${corporateCount} da empresa`;
      }
      if (excludedCount > 0) {
        description += ` • ${excludedCount} ignoradas`;
      }
      if (rulesCreated > 0) {
        description += ` • ${rulesCreated} regras criadas`;
      }

      toast({
        title: errorCount > 0 ? "Fatura importada com erros" : "Fatura importada com sucesso!",
        description,
        variant: errorCount > 0 ? "destructive" : "default",
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Error importing invoice:", error);
      toast({
        title: "Erro ao importar fatura",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const includedItems = reviewItems.filter(item => item.include_in_import);
  const totalAmount = includedItems.reduce((sum, item) => sum + item.amount, 0);
  const personalTotal = includedItems.filter((item) => !item.is_corporate).reduce((sum, item) => sum + item.amount, 0);
  const corporateTotal = includedItems.filter((item) => item.is_corporate).reduce((sum, item) => sum + item.amount, 0);
  const uncategorizedCount = includedItems.filter((item) => !item.category_id).length;
  const installmentsCount = includedItems.filter((item) => item.installment_current && item.installment_total).length;
  const futureInstallmentsToAdd = includedItems
    .filter((item) => item.add_future_installments && item.installment_current && item.installment_total)
    .reduce((sum, item) => sum + (item.installment_total! - item.installment_current!), 0);
  const postClosingItems = reviewItems.filter(item => item.is_post_closing);
  const excludedCount = reviewItems.filter(item => !item.include_in_import).length;

  // Status counts for UI
  const statusCounts = useMemo(() => ({
    new: reviewItems.filter((i) => i.duplicate_status === 'new').length,
    duplicate: reviewItems.filter((i) => i.duplicate_status === 'duplicate').length,
    rejected: reviewItems.filter((i) => i.duplicate_status === 'rejected').length,
  }), [reviewItems]);

  // Check if all non-rejected items are selected
  const allSelectableSelected = reviewItems
    .filter((item) => item.duplicate_status !== 'rejected')
    .every((item) => item.include_in_import || item.duplicate_status === 'duplicate');

  // Format invoice period for display
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const invoicePeriodStr = invoiceMonth && invoiceYear 
    ? `${monthNames[invoiceMonth - 1]}/${invoiceYear}`
    : "";

  return (
    <Dialog open={open} onOpenChange={isImporting ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Revisar Importação
          </DialogTitle>
          <DialogDescription>
            {creditCardName} - {invoicePeriodStr} - {reviewItems.length} transações encontradas
            {installmentsCount > 0 && (
              <span className="ml-2">
                <Badge variant="secondary" className="text-xs">
                  <Copy className="h-3 w-3 mr-1" />
                  {installmentsCount} parceladas
                </Badge>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Post-closing warning */}
        {postClosingCount > 0 && showPostClosingWarning && (
          <Alert variant="default" className="flex-shrink-0 border-chart-4 bg-chart-4/10">
            <AlertTriangle className="h-4 w-4 text-chart-4" />
            <AlertTitle className="text-chart-4">Atenção: Compras pós-fechamento</AlertTitle>
            <AlertDescription className="text-sm">
              {postClosingCount} {postClosingCount === 1 ? "transação foi realizada" : "transações foram realizadas"} após o dia {closingDay} (fechamento).{" "}
              {postClosingCount === 1 ? "Esta compra cairá" : "Estas compras cairão"} na <strong>próxima fatura</strong> e {postClosingCount === 1 ? "foi desmarcada" : "foram desmarcadas"} por padrão.
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 ml-2 text-chart-4"
                onClick={() => setShowPostClosingWarning(false)}
              >
                Entendi
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Validation warning - sum mismatch */}
        {validationWarning && (
          <Alert variant="destructive" className="flex-shrink-0">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validação</AlertTitle>
            <AlertDescription className="text-sm">
              {validationWarning}
            </AlertDescription>
          </Alert>
        )}

        {uncategorizedCount > 0 && (
          <div className="flex-shrink-0 flex items-start gap-2 p-3 rounded-lg bg-muted text-muted-foreground text-sm">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {uncategorizedCount} {uncategorizedCount === 1 ? "item" : "itens"} sem categoria — você pode categorizar depois se preferir
            </span>
          </div>
        )}

        {isImporting && (
          <div className="flex-shrink-0 space-y-2 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importando transações...
              </span>
              <span className="font-medium">
                {importProgress.current} / {importProgress.total}
              </span>
            </div>
            <Progress 
              value={importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0} 
              className="h-2"
            />
          </div>
        )}

        {/* Bulk selection header */}
        <div className="flex-shrink-0 flex items-center justify-between py-2 px-1 border-b">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allSelectableSelected && reviewItems.length > 0}
              onCheckedChange={(checked) => handleSelectAll(checked === true)}
              disabled={isImporting || reviewItems.length === 0}
            />
            <span className="text-sm text-muted-foreground">
              Importando <strong>{includedItems.length}</strong> de {reviewItems.length} itens
            </span>
          </div>
          <div className="flex items-center gap-2">
            {statusCounts.new > 0 && (
              <Badge className="bg-income/10 text-income border-income/20 text-xs">
                Novos: {statusCounts.new}
              </Badge>
            )}
            {statusCounts.duplicate > 0 && (
              <Badge className="bg-chart-4/10 text-chart-4 border-chart-4/20 text-xs">
                Duplicados: {statusCounts.duplicate}
              </Badge>
            )}
            {statusCounts.rejected > 0 && (
              <Badge className="bg-muted text-muted-foreground text-xs">
                Ignorados: {statusCounts.rejected}
              </Badge>
            )}
          </div>
        </div>

        <ScrollArea className={cn("h-[400px] -mx-6 px-6 pr-3", isImporting && "opacity-50 pointer-events-none")}>
          <div className="space-y-2 pr-3">
            {isLoadingExisting ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Verificando duplicatas...
              </div>
            ) : reviewItems.map((item, index) => {
              const categoryChanged = item.category_id !== item.original_category_id;
              const category = expenseCategories.find((c) => c.id === item.category_id);
              const hasInstallments = !!(item.installment_current && item.installment_total);
              const isNotesExpanded = expandedNotes.has(index);
              const remainingInstallments = hasInstallments ? item.installment_total! - item.installment_current! : 0;
              const isRejected = item.duplicate_status === 'rejected';
              const isDuplicate = item.duplicate_status === 'duplicate';

              return (
                <div
                  key={index}
                  className={cn(
                    "border rounded-lg p-3 space-y-2 transition-all",
                    item.is_corporate && "bg-muted/30",
                    item.is_post_closing && "border-chart-4/50",
                    isDuplicate && "bg-chart-4/5 border-chart-4/30",
                    isRejected && "opacity-50 bg-muted/20",
                    !item.include_in_import && !isRejected && "opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={item.include_in_import}
                        onCheckedChange={(checked) => handleIncludeChange(index, checked === true)}
                        className="mt-0.5"
                        disabled={isRejected}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Status Badge */}
                          {item.duplicate_status === 'new' && (
                            <Badge className="bg-income/10 text-income border-income/20 text-[10px] px-1.5 py-0">
                              Novo
                            </Badge>
                          )}
                          {isDuplicate && (
                            <Badge className="bg-chart-4/10 text-chart-4 border-chart-4/20 text-[10px] px-1.5 py-0">
                              <AlertOctagon className="h-3 w-3 mr-0.5" />
                              Já Lançado
                            </Badge>
                          )}
                          {isRejected && (
                            <Badge className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0">
                              Ignorado
                            </Badge>
                          )}
                          
                          {item.is_corporate && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex-shrink-0">
                                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Despesa da Empresa</TooltipContent>
                            </Tooltip>
                          )}
                          {item.is_post_closing && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex-shrink-0">
                                  <CalendarClock className="h-4 w-4 text-chart-4" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Compra pós-fechamento (próxima fatura)</TooltipContent>
                            </Tooltip>
                          )}
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleDescriptionChange(index, e.target.value)}
                            className={cn(
                              "flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium flex-1 min-w-[200px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                              isRejected && "line-through text-muted-foreground"
                            )}
                            placeholder="Descrição"
                            disabled={isRejected}
                          />
                          {hasInstallments && (
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              <Copy className="h-3 w-3 mr-1" />
                              {item.installment_current}/{item.installment_total}
                            </Badge>
                          )}
                        </div>
                        <p className={cn("text-xs text-muted-foreground", isRejected && "line-through")}>{item.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-sm font-semibold text-expense whitespace-nowrap",
                        isRejected && "line-through text-muted-foreground"
                      )}>
                        R$ {item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      
                      {/* Action buttons */}
                      {isRejected ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleRestoreItem(index)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Restaurar item</TooltipContent>
                        </Tooltip>
                      ) : isDuplicate && !item.include_in_import ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-chart-4 hover:text-chart-4 hover:bg-chart-4/10"
                              onClick={() => handleForceInclude(index)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Forçar importação</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRejectItem(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ignorar item</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>

                  {/* Duplicate warning */}
                  {isDuplicate && (
                    <div className="flex items-start gap-2 text-xs text-chart-4 bg-chart-4/5 rounded-md px-2 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Possível duplicata:</strong> Encontrada transação similar já cadastrada neste período.
                        {item.include_in_import && " Você escolheu importar mesmo assim."}
                      </span>
                    </div>
                  )}

                  {/* Editing controls - always visible, disabled for rejected items */}
                  <div className={cn(
                    item.duplicate_status === 'rejected' && "opacity-50 pointer-events-none"
                  )}>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Combobox de Categoria com Busca e Criação */}
                        <Popover 
                          open={openCategoryPopoverIndex === index} 
                          onOpenChange={(open) => {
                            setOpenCategoryPopoverIndex(open ? index : null);
                            if (!open) setCategorySearch("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={openCategoryPopoverIndex === index}
                              className={cn(
                                "h-8 text-xs flex-1 min-w-[150px] justify-between font-normal",
                                !item.category_id && "text-muted-foreground"
                              )}
                            >
                              {item.category_id ? (
                                <span className="flex items-center gap-2 truncate">
                                  <span>{category?.icon}</span>
                                  <span>{category?.name}</span>
                                </span>
                              ) : (
                                "Sem categoria"
                              )}
                              <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[220px] p-0" align="start">
                            <Command>
                              <CommandInput 
                                placeholder="Buscar ou criar..." 
                                className="h-9"
                                value={categorySearch}
                                onValueChange={setCategorySearch}
                              />
                              <CommandList>
                                <CommandEmpty className="py-2 px-3 text-sm">
                                  {categorySearch.trim() && !expenseCategories.some(c => c.name.toLowerCase() === categorySearch.toLowerCase()) && (
                                    <Button
                                      variant="ghost"
                                      className="w-full justify-start h-8 text-xs"
                                      onClick={() => handleCreateCategory(index, categorySearch)}
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
                                    value="sem-categoria"
                                    onSelect={() => handleCategoryChange(index, "")}
                                  >
                                    <span className="mr-2">⊘</span>
                                    Sem categoria
                                    {!item.category_id && (
                                      <Check className="ml-auto h-4 w-4" />
                                    )}
                                  </CommandItem>
                                </CommandGroup>
                                {groupCategoriesByParent(
                                  expenseCategories.filter(cat => 
                                    cat.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
                                    (cat.fullName && cat.fullName.toLowerCase().includes(categorySearch.toLowerCase()))
                                  )
                                ).map((group, groupIndex) => (
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
                                {categorySearch.trim() && !expenseCategories.some(c => c.name.toLowerCase() === categorySearch.toLowerCase()) && expenseCategories.filter(cat => cat.name.toLowerCase().includes(categorySearch.toLowerCase())).length > 0 && (
                                  <>
                                    <CommandSeparator />
                                    <CommandGroup>
                                      <CommandItem
                                        onSelect={() => handleCreateCategory(index, categorySearch)}
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

                        {/* Corporate expense toggle */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={item.is_corporate ? "default" : "outline"}
                              size="icon"
                              className={cn(
                                "h-8 w-8 flex-shrink-0",
                                item.is_corporate && "bg-muted text-muted-foreground hover:bg-muted/80"
                              )}
                              onClick={() => handleCorporateChange(index, !item.is_corporate)}
                            >
                              <Briefcase className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.is_corporate ? "Remover da empresa" : "Marcar como empresa"}
                          </TooltipContent>
                        </Tooltip>

                        {/* Notes toggle */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={item.notes ? "default" : "outline"}
                              size="icon"
                              className={cn(
                                "h-8 w-8 flex-shrink-0",
                                item.notes && "bg-primary/10 text-primary hover:bg-primary/20"
                              )}
                              onClick={() => toggleNotes(index)}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.notes ? "Editar descrição" : "Adicionar descrição"}
                          </TooltipContent>
                        </Tooltip>

                        {item.original_category_id && (
                          <Badge variant="secondary" className="text-xs">
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
                              Lembrar
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Notes field */}
                      <Collapsible open={isNotesExpanded}>
                        <CollapsibleContent>
                          <div className="pt-2">
                            <Textarea
                              placeholder="Adicione uma descrição ou observação sobre esta transação..."
                              value={item.notes}
                              onChange={(e) => handleNotesChange(index, e.target.value)}
                              className="text-xs min-h-[60px] resize-none"
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* Future installments option */}
                      {hasInstallments && remainingInstallments > 0 && (
                        <div className="flex items-center gap-2 pt-1 p-2 rounded-md bg-primary/5 border border-primary/20">
                          <Checkbox
                            id={`future-${index}`}
                            checked={item.add_future_installments}
                            onCheckedChange={(checked) =>
                              handleFutureInstallmentsChange(index, checked === true)
                            }
                          />
                          <label
                            htmlFor={`future-${index}`}
                            className="text-xs cursor-pointer flex-1"
                          >
                            <span className="font-medium text-primary">
                              Adicionar {remainingInstallments} parcelas futuras
                            </span>
                            <span className="text-muted-foreground ml-1">
                              ({item.installment_current! + 1} a {item.installment_total} de R$ {item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
                            </span>
                          </label>
                        </div>
                      )}

                      {/* Input de Keyword da Regra (Condicional) */}
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

                      {/* Remember corporate status with editable keyword */}
                      {item.is_corporate && (
                        <div className="space-y-2 pt-1 border-t border-dashed">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`remember-corp-${index}`}
                              checked={item.remember_corporate}
                              onCheckedChange={(checked) =>
                                handleRememberCorporateChange(index, checked === true)
                              }
                            />
                            <label
                              htmlFor={`remember-corp-${index}`}
                              className="text-xs text-muted-foreground cursor-pointer"
                            >
                              Lembrar como despesa da empresa
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
                    </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2 border-t pt-4">
          <div className="flex-1 space-y-1 text-sm">
            <div className="flex gap-4 flex-wrap">
              <span>
                <span className="text-muted-foreground">Total: </span>
                <span className="font-semibold text-expense">
                  R$ {totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </span>
              {futureInstallmentsToAdd > 0 && (
                <span>
                  <span className="text-muted-foreground">+ </span>
                  <span className="font-medium text-primary">
                    {futureInstallmentsToAdd} parcelas futuras
                  </span>
                </span>
              )}
              {excludedCount > 0 && (
                <span className="text-muted-foreground text-xs">
                  ({excludedCount} {excludedCount === 1 ? "ignorada" : "ignoradas"})
                </span>
              )}
            </div>
            {corporateTotal > 0 && (
              <div className="flex gap-4 text-xs">
                <span>
                  <span className="text-muted-foreground">Meu custo: </span>
                  <span className="font-medium">
                    R$ {personalTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Empresa: </span>
                  <span className="font-medium">
                    R$ {corporateTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </span>
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
            <Button onClick={handleImport} disabled={isImporting || includedItems.length === 0}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar ({includedItems.length})
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
