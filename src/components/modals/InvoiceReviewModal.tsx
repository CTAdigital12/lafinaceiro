import { useState, useEffect } from "react";
import { Check, AlertCircle, Sparkles, Loader2, Plus, Briefcase, Copy, ChevronDown, ChevronUp, MessageSquare, ChevronsUpDown, Info, AlertTriangle, CalendarClock } from "lucide-react";
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
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useCategories } from "@/hooks/useCategories";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useTransactions } from "@/hooks/useTransactions";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ImportedItem, ImportCompleteData } from "./InvoiceImportModal";
import { format, addMonths, parse } from "date-fns";

interface ReviewItem extends ImportedItem {
  category_id: string | null;
  original_category_id: string | null;
  remember_category: boolean;
  is_corporate: boolean;
  remember_corporate: boolean;
  notes: string;
  add_future_installments: boolean;
  include_in_import: boolean;
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
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("📦");
  const [newCategoryColor, setNewCategoryColor] = useState("#3B82F6");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [openPopoverIndex, setOpenPopoverIndex] = useState<number | null>(null);
  const [openCategoryPopoverIndex, setOpenCategoryPopoverIndex] = useState<number | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [showPostClosingWarning, setShowPostClosingWarning] = useState(true);

  const colorOptions = [
    "#EF4444", "#F97316", "#F59E0B", "#22C55E", 
    "#3B82F6", "#8B5CF6", "#EC4899", "#6B7280"
  ];

  const items = importData?.items || [];
  const futureInstallmentsFromBackend = importData?.future_installments || [];
  const postClosingCount = importData?.post_closing_count || 0;
  const invoiceMonth = importData?.invoice_month;
  const invoiceYear = importData?.invoice_year;
  const closingDay = importData?.closing_day;

  // Initialize review items with suggested categories and corporate status
  useEffect(() => {
    if (items.length > 0 && open) {
      const itemsWithCategories = items.map((item) => {
        const suggestedCategoryId = findCategoryForDescription(item.description);
        const suggestedCorporate = findCorporateForDescription(item.description);
        const isInstallment = !!(item.installment_current && item.installment_total && item.installment_current < item.installment_total);
        return {
          ...item,
          category_id: suggestedCategoryId,
          original_category_id: suggestedCategoryId,
          remember_category: false,
          is_corporate: suggestedCorporate,
          remember_corporate: false,
          notes: "",
          add_future_installments: isInstallment, // Auto-check for installments that have more to come
          include_in_import: !item.is_post_closing, // Exclude post-closing by default
        };
      });
      setReviewItems(itemsWithCategories);
      setExpandedNotes(new Set());
      setShowPostClosingWarning(postClosingCount > 0);
    }
  }, [items, open, findCategoryForDescription, findCorporateForDescription, postClosingCount]);

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

  const handleCreateCategory = async (index: number) => {
    if (!newCategoryName.trim()) return;
    
    setIsCreatingCategory(true);
    try {
      const newCategory = await createCategory.mutateAsync({
        name: newCategoryName.trim(),
        icon: newCategoryIcon,
        color: newCategoryColor,
        type: "expense",
      });
      
      handleCategoryChange(index, newCategory.id);
      setNewCategoryName("");
      setNewCategoryIcon("📦");
      setNewCategoryColor("#3B82F6");
      setOpenPopoverIndex(null);
    } catch (error) {
      console.error("Error creating category:", error);
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const extractKeyword = (description: string): string => {
    const cleaned = description
      .toUpperCase()
      .replace(/^(PAG\*|PIX|COMPRA\s+)/i, "")
      .trim();
    
    const withoutInstallment = cleaned.replace(/\s*\d+\/\d+\s*/g, " ").trim();
    
    const match = withoutInstallment.match(/^[\w]+/);
    return match ? match[0] : withoutInstallment.substring(0, 20);
  };

  const generateFutureInstallments = (item: ReviewItem): Array<{
    description: string;
    amount: number;
    date: string;
    notes: string;
    category_id: string | null;
    is_corporate: boolean;
  }> => {
    if (!item.installment_current || !item.installment_total) return [];
    
    const futureInstallments: Array<{
      description: string;
      amount: number;
      date: string;
      notes: string;
      category_id: string | null;
      is_corporate: boolean;
    }> = [];
    
    const baseDate = parse(item.date, "yyyy-MM-dd", new Date());
    const remaining = item.installment_total - item.installment_current;
    
    const baseDescription = item.description
      .replace(/\s*\d+\/\d+\s*/g, " ")
      .replace(/\s*PARC\s*\d+\s*\/\s*\d+\s*/gi, " ")
      .replace(/\s*\(\d+\/\d+\)\s*/g, " ")
      .trim();
    
    for (let i = 1; i <= remaining; i++) {
      const installmentNumber = item.installment_current + i;
      const futureDate = addMonths(baseDate, i);
      
      futureInstallments.push({
        description: `${baseDescription} ${installmentNumber}/${item.installment_total}`,
        amount: item.amount,
        date: format(futureDate, "yyyy-MM-dd"),
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

      // First, create categorization rules for items marked to remember
      const rulesToCreate = itemsToImport
        .filter((item) => (item.remember_category && item.category_id && item.category_id.trim() !== "" && item.category_id !== item.original_category_id) || item.remember_corporate)
        .map((item) => ({
          keyword: extractKeyword(item.description),
          category_id: item.category_id && item.category_id.trim() !== "" ? item.category_id : null,
          is_corporate: item.is_corporate,
        }));

      const seenKeywords = new Set<string>();
      for (const rule of rulesToCreate) {
        if (!seenKeywords.has(rule.keyword)) {
          seenKeywords.add(rule.keyword);
          await createRule.mutateAsync(rule);
        }
      }

      // Collect all transactions to create (including future installments)
      const allTransactions: Array<{
        description: string;
        amount: number;
        date: string;
        type: "expense" | "income";
        category_id: string | null;
        credit_card_id: string;
        account_id: string | null;
        status: "completed" | "pending";
        is_corporate_expense: boolean;
      }> = [];

      let futureInstallmentsCount = 0;

      for (const item of itemsToImport) {
        const categoryId = item.category_id && item.category_id.trim() !== "" ? item.category_id : null;
        
        allTransactions.push({
          description: item.notes ? `${item.description} - ${item.notes}` : item.description,
          amount: item.amount,
          date: item.date,
          type: "expense",
          category_id: categoryId,
          credit_card_id: creditCardId,
          account_id: null,
          status: "completed",
          is_corporate_expense: item.is_corporate,
        });

        // Add future installments if requested
        if (item.add_future_installments && item.installment_current && item.installment_total) {
          const futureItems = generateFutureInstallments(item);
          futureInstallmentsCount += futureItems.length;
          
          for (const future of futureItems) {
            const futureCategoryId = future.category_id && future.category_id.trim() !== "" ? future.category_id : null;
            
            allTransactions.push({
              description: future.notes ? `${future.description} - ${future.notes}` : future.description,
              amount: future.amount,
              date: future.date,
              type: "expense",
              category_id: futureCategoryId,
              credit_card_id: creditCardId,
              account_id: null,
              status: "pending",
              is_corporate_expense: future.is_corporate,
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
      if (rulesToCreate.length > 0) {
        description += ` • ${rulesToCreate.length} regras criadas`;
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

        <ScrollArea className={cn("h-[400px] -mx-6 px-6 pr-3", isImporting && "opacity-50 pointer-events-none")}>
          <div className="space-y-2 pr-3">
            {reviewItems.map((item, index) => {
              const categoryChanged = item.category_id !== item.original_category_id;
              const category = expenseCategories.find((c) => c.id === item.category_id);
              const hasInstallments = !!(item.installment_current && item.installment_total);
              const isNotesExpanded = expandedNotes.has(index);
              const remainingInstallments = hasInstallments ? item.installment_total! - item.installment_current! : 0;

              return (
                <div
                  key={index}
                  className={cn(
                    "border rounded-lg p-3 space-y-2 transition-opacity",
                    item.is_corporate && "bg-muted/30",
                    item.is_post_closing && "border-chart-4/50",
                    !item.include_in_import && "opacity-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={item.include_in_import}
                        onCheckedChange={(checked) => handleIncludeChange(index, checked === true)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
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
                          <p className="text-sm font-medium truncate">{item.description}</p>
                          {hasInstallments && (
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              <Copy className="h-3 w-3 mr-1" />
                              {item.installment_current}/{item.installment_total}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.date}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-expense whitespace-nowrap">
                      R$ {item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  {item.include_in_import && (
                    <>
                      <div className="flex items-center gap-2">
                        <Popover 
                          open={openCategoryPopoverIndex === index} 
                          onOpenChange={(open) => setOpenCategoryPopoverIndex(open ? index : null)}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={openCategoryPopoverIndex === index}
                              className={cn(
                                "h-8 text-xs flex-1 justify-between font-normal",
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
                          <PopoverContent className="w-[200px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar categoria..." className="h-9" />
                              <CommandList>
                                <CommandEmpty>Nenhuma categoria encontrada</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="sem-categoria"
                                    onSelect={() => {
                                      handleCategoryChange(index, "");
                                      setOpenCategoryPopoverIndex(null);
                                    }}
                                  >
                                    <span className="text-muted-foreground">Sem categoria</span>
                                    {!item.category_id && (
                                      <Check className="ml-auto h-4 w-4" />
                                    )}
                                  </CommandItem>
                                  {expenseCategories.map((cat) => (
                                    <CommandItem
                                      key={cat.id}
                                      value={`${cat.name} ${cat.icon}`}
                                      onSelect={() => {
                                        handleCategoryChange(index, cat.id);
                                        setOpenCategoryPopoverIndex(null);
                                      }}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span>{cat.icon}</span>
                                        <span>{cat.name}</span>
                                      </span>
                                      {item.category_id === cat.id && (
                                        <Check className="ml-auto h-4 w-4" />
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>

                        <Popover open={openPopoverIndex === index} onOpenChange={(open) => setOpenPopoverIndex(open ? index : null)}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-3" align="end">
                            <div className="space-y-3">
                              <p className="text-sm font-medium">Nova categoria</p>
                              <div className="flex gap-2">
                                <Input
                                  value={newCategoryIcon}
                                  onChange={(e) => setNewCategoryIcon(e.target.value)}
                                  className="w-12 text-center"
                                  maxLength={2}
                                />
                                <Input
                                  value={newCategoryName}
                                  onChange={(e) => setNewCategoryName(e.target.value)}
                                  placeholder="Nome da categoria"
                                  className="flex-1"
                                />
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {colorOptions.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={() => setNewCategoryColor(color)}
                                    className={cn(
                                      "w-6 h-6 rounded-full transition-all",
                                      newCategoryColor === color && "ring-2 ring-offset-2 ring-primary"
                                    )}
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                              <Button
                                size="sm"
                                className="w-full"
                                onClick={() => handleCreateCategory(index)}
                                disabled={!newCategoryName.trim() || isCreatingCategory}
                              >
                                {isCreatingCategory ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Criar e aplicar"
                                )}
                              </Button>
                            </div>
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

                      {/* Remember category */}
                      {categoryChanged && item.category_id && (
                        <div className="flex items-center gap-2 pt-1">
                          <Checkbox
                            id={`remember-${index}`}
                            checked={item.remember_category}
                            onCheckedChange={(checked) =>
                              handleRememberChange(index, checked === true)
                            }
                          />
                          <label
                            htmlFor={`remember-${index}`}
                            className="text-xs text-muted-foreground cursor-pointer"
                          >
                            Lembrar "{extractKeyword(item.description)}" como "{category?.name}"
                          </label>
                        </div>
                      )}

                      {/* Remember corporate status */}
                      {item.is_corporate && (
                        <div className="flex items-center gap-2 pt-1">
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
                            Lembrar "{extractKeyword(item.description)}" como despesa da empresa
                          </label>
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
