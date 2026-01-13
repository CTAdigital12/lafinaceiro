import { useState, useEffect, useRef, useCallback } from "react";
import { Check, AlertCircle, Sparkles, Loader2, Plus, Ban, Briefcase, ChevronsUpDown } from "lucide-react";
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
import { useCategories } from "@/hooks/useCategories";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AccountImportedItem } from "./AccountImportModal";

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
}

interface AccountReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AccountImportedItem[];
  accountId: string;
  accountName: string;
}

export function AccountReviewModal({
  open,
  onOpenChange,
  items,
  accountId,
  accountName,
}: AccountReviewModalProps) {
  const { user } = useAuth();
  const { categories, createCategory } = useCategories();
  const { findCategoryForDescription, findCorporateForDescription, createRule } = useCategorizationRules();
  const { createTransaction } = useTransactions();
  const { updateAccount } = useAccounts();
  const { toast } = useToast();

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
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
        // Fetch existing transactions for this account
        const { data: existingTransactions } = await supabase
          .from("transactions")
          .select("date, amount, description")
          .eq("account_id", accountId);

        const existing = existingTransactions || [];

        const itemsWithCategories = items.map((item) => {
          const suggestedCategoryId = findCategoryForDescription(item.description);
          const isCorporate = findCorporateForDescription(item.description);
          
          // Check for duplicates: same date, amount, and similar description
          const isDuplicate = existing.some(
            (tx) =>
              tx.date === item.date &&
              Math.abs(Number(tx.amount) - item.amount) < 0.01 &&
              (tx.description.toUpperCase().includes(item.description.toUpperCase().substring(0, 10)) ||
               item.description.toUpperCase().includes(tx.description.toUpperCase().substring(0, 10)))
          );

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
          };
        });
        
        setReviewItems(itemsWithCategories);
      } catch (error) {
        console.error("Error checking duplicates:", error);
        // Initialize without duplicate checking if it fails
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
          };
        });
        setReviewItems(itemsWithCategories);
      } finally {
        setIsCheckingDuplicates(false);
      }
    };

    initializeItems();
  }, [items, open, accountId, user, getItemsKey, findCategoryForDescription, findCorporateForDescription]);

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
      // Filter out duplicates that user doesn't want to force import
      const itemsToImport = reviewItems.filter(
        (item) => !item.isDuplicate || item.forceImport
      );

      // First, create categorization rules for items marked to remember
      const rulesToCreate = itemsToImport
        .filter((item) => item.remember_category && item.category_id && item.category_id !== item.original_category_id && item.rule_keyword.trim())
        .map((item) => ({
          keyword: item.rule_keyword.trim(),
          category_id: item.category_id!,
          is_corporate: item.is_corporate,
        }));

      // Create corporate rules for items marked to remember as corporate
      const corporateRulesToCreate = itemsToImport
        .filter((item) => item.remember_corporate && item.is_corporate && item.corporate_keyword.trim())
        .map((item) => ({
          keyword: item.corporate_keyword.trim(),
          category_id: item.category_id || null,
          is_corporate: true,
        }));

      // Create all rules
      for (const rule of [...rulesToCreate, ...corporateRulesToCreate]) {
        await createRule.mutateAsync(rule);
      }

      // Calculate balance change
      let balanceChange = 0;
      let successCount = 0;
      let errorCount = 0;

      // Create transactions
      for (const item of itemsToImport) {
        try {
          await createTransaction.mutateAsync({
            description: item.description,
            amount: item.amount,
            date: item.date,
            type: item.type,
            category_id: item.category_id || null,
            account_id: accountId,
            credit_card_id: null,
            status: "completed",
            is_corporate_expense: item.is_corporate,
            is_refund: false,
            refunded_transaction_id: null,
            reimbursement_status: item.is_corporate ? "pending" : null,
            installment_group_id: null,
            installment_number: null,
            total_installments: null,
            silent: true,
          });
          successCount++;

          // Update balance calculation
          if (item.type === "income") {
            balanceChange += item.amount;
          } else {
            balanceChange -= item.amount;
          }
        } catch (error) {
          console.error("Error creating transaction:", error);
          errorCount++;
        }
      }

      // Update account balance
      const { data: currentAccount } = await supabase
        .from("accounts")
        .select("current_balance")
        .eq("id", accountId)
        .single();

      if (currentAccount) {
        const newBalance = Number(currentAccount.current_balance) + balanceChange;
        await updateAccount.mutateAsync({
          id: accountId,
          current_balance: newBalance,
        });
      }

      const skippedCount = reviewItems.length - itemsToImport.length;
      const corporateCount = itemsToImport.filter((item) => item.is_corporate).length;
      const totalRules = rulesToCreate.length + corporateRulesToCreate.length;

      let description = `${successCount} transações importadas`;
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

      onOpenChange(false);
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

  const duplicateCount = reviewItems.filter((item) => item.isDuplicate && !item.forceImport).length;
  
  const corporateCount = reviewItems.filter(
    (item) => item.is_corporate && item.type === "expense" && (!item.isDuplicate || item.forceImport)
  ).length;

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
                cat.name.toLowerCase().includes(categorySearch.toLowerCase())
              );
              
              // Check if search matches any existing category
              const searchMatchesExisting = relevantCategories.some(
                (cat) => cat.name.toLowerCase() === categorySearch.toLowerCase()
              );

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
                        {item.isDuplicate && (
                          <Badge variant="secondary" className="text-xs flex-shrink-0">
                            Já importada
                          </Badge>
                        )}
                        {item.is_corporate && !item.isDuplicate && (
                          <Badge variant="outline" className="text-xs flex-shrink-0 text-primary border-primary">
                            <Briefcase className="h-3 w-3 mr-1" />
                            Reembolso
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-0.5">{item.description}</p>
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
                                  <span>{category.name}</span>
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
                                  {filteredCategories.map((cat) => (
                                    <CommandItem
                                      key={cat.id}
                                      value={cat.name}
                                      onSelect={() => handleCategoryChange(index, cat.id)}
                                    >
                                      <span className="mr-2">{cat.icon}</span>
                                      {cat.name}
                                      {item.category_id === cat.id && (
                                        <Check className="ml-auto h-4 w-4" />
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
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
