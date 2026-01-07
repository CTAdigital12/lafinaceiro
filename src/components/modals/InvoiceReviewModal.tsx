import { useState, useEffect } from "react";
import { Check, AlertCircle, Sparkles, Loader2, Plus } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useCategories } from "@/hooks/useCategories";
import { useCategorizationRules } from "@/hooks/useCategorizationRules";
import { useTransactions } from "@/hooks/useTransactions";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ImportedItem } from "./InvoiceImportModal";

interface ReviewItem extends ImportedItem {
  category_id: string | null;
  original_category_id: string | null;
  remember_category: boolean;
}

interface InvoiceReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ImportedItem[];
  creditCardId: string;
  creditCardName: string;
}

export function InvoiceReviewModal({
  open,
  onOpenChange,
  items,
  creditCardId,
  creditCardName,
}: InvoiceReviewModalProps) {
  const { expenseCategories, createCategory } = useCategories();
  const { findCategoryForDescription, createRule } = useCategorizationRules();
  const { createTransaction } = useTransactions();
  const { toast } = useToast();

  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("📦");
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [openPopoverIndex, setOpenPopoverIndex] = useState<number | null>(null);

  // Initialize review items with suggested categories
  useEffect(() => {
    if (items.length > 0 && open) {
      const itemsWithCategories = items.map((item) => {
        const suggestedCategoryId = findCategoryForDescription(item.description);
        return {
          ...item,
          category_id: suggestedCategoryId,
          original_category_id: suggestedCategoryId,
          remember_category: false,
        };
      });
      setReviewItems(itemsWithCategories);
    }
  }, [items, open, findCategoryForDescription]);

  const handleCategoryChange = (index: number, categoryId: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              category_id: categoryId,
              // Show remember option if category was changed
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

  const handleCreateCategory = async (index: number) => {
    if (!newCategoryName.trim()) return;
    
    setIsCreatingCategory(true);
    try {
      const newCategory = await createCategory.mutateAsync({
        name: newCategoryName.trim(),
        icon: newCategoryIcon,
        color: "#6B7280",
        type: "expense",
      });
      
      handleCategoryChange(index, newCategory.id);
      setNewCategoryName("");
      setNewCategoryIcon("📦");
      setOpenPopoverIndex(null);
    } catch (error) {
      console.error("Error creating category:", error);
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const extractKeyword = (description: string): string => {
    // Extract main keyword from description
    // Remove common prefixes and take first meaningful word
    const cleaned = description
      .toUpperCase()
      .replace(/^(PAG\*|PIX|COMPRA\s+)/i, "")
      .trim();
    
    // Take first word or first part before special chars
    const match = cleaned.match(/^[\w]+/);
    return match ? match[0] : cleaned.substring(0, 20);
  };

  const handleImport = async () => {
    setIsImporting(true);

    try {
      // First, create categorization rules for items marked to remember
      const rulesToCreate = reviewItems
        .filter((item) => item.remember_category && item.category_id && item.category_id !== item.original_category_id)
        .map((item) => ({
          keyword: extractKeyword(item.description),
          category_id: item.category_id!,
        }));

      // Create rules
      for (const rule of rulesToCreate) {
        await createRule.mutateAsync(rule);
      }

      // Create transactions
      for (const item of reviewItems) {
        await createTransaction.mutateAsync({
          description: item.description,
          amount: item.amount,
          date: item.date,
          type: "expense",
          category_id: item.category_id || null,
          credit_card_id: creditCardId,
          account_id: null,
          status: "completed",
        });
      }

      toast({
        title: "Fatura importada com sucesso!",
        description: `${reviewItems.length} transações adicionadas${rulesToCreate.length > 0 ? ` e ${rulesToCreate.length} regras de categorização criadas` : ""}`,
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

  const totalAmount = reviewItems.reduce((sum, item) => sum + item.amount, 0);
  const uncategorizedCount = reviewItems.filter((item) => !item.category_id).length;

  return (
    <Dialog open={open} onOpenChange={isImporting ? () => {} : onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Revisar Importação
          </DialogTitle>
          <DialogDescription>
            {creditCardName} - {reviewItems.length} transações encontradas
          </DialogDescription>
        </DialogHeader>

        {uncategorizedCount > 0 && (
          <div className="flex-shrink-0 flex items-start gap-2 p-3 rounded-lg bg-chart-4/10 text-chart-4 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              {uncategorizedCount} {uncategorizedCount === 1 ? "item precisa" : "itens precisam"} de categorização
            </span>
          </div>
        )}

        <ScrollArea className="h-[400px] -mx-6 px-6 pr-3">
          <div className="space-y-2 pr-3">
            {reviewItems.map((item, index) => {
              const categoryChanged = item.category_id !== item.original_category_id;
              const category = expenseCategories.find((c) => c.id === item.category_id);

              return (
                <div
                  key={index}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{item.date}</p>
                    </div>
                    <p className="text-sm font-semibold text-expense whitespace-nowrap">
                      R$ {item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={item.category_id || "none"}
                      onValueChange={(value) =>
                        handleCategoryChange(index, value === "none" ? "" : value)
                      }
                    >
                      <SelectTrigger className={cn(
                        "h-8 text-xs flex-1",
                        !item.category_id && "border-chart-4/50"
                      )}>
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">Sem categoria</span>
                        </SelectItem>
                        {expenseCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <span className="flex items-center gap-2">
                              <span>{cat.icon}</span>
                              <span>{cat.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

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

                    {item.original_category_id && (
                      <Badge variant="secondary" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Auto
                      </Badge>
                    )}
                  </div>

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
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2 border-t pt-4">
          <div className="flex-1 text-sm">
            <span className="text-muted-foreground">Total: </span>
            <span className="font-semibold text-expense">
              R$ {totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isImporting}
            >
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={isImporting}>
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