import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Checkbox } from "@/components/ui/checkbox";
import { useCategories } from "@/hooks/useCategories";
import { useBudgets } from "@/hooks/useBudgets";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AddSubcategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentCategory: { id: string; name: string; icon: string; color: string } | null;
  month: number;
  year: number;
  existingBudgetCategoryIds: string[];
}

export function AddSubcategoryModal({ 
  open, 
  onOpenChange, 
  parentCategory,
  month,
  year,
  existingBudgetCategoryIds 
}: AddSubcategoryModalProps) {
  const { categories } = useCategories();
  const { createBudget } = useBudgets(month, year);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number | undefined>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter subcategories that belong to this parent and don't have a budget yet
  const availableSubcategories = useMemo(() => {
    return categories.filter(
      (c) => 
        c.parent_id === parentCategory?.id && 
        !existingBudgetCategoryIds.includes(c.id)
    );
  }, [categories, parentCategory?.id, existingBudgetCategoryIds]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const setAmount = (id: string, value: number | undefined) => {
    setAmounts((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) return;

    setIsSubmitting(true);
    try {
      for (const categoryId of selectedIds) {
        const amount = amounts[categoryId] ?? 0;
        await createBudget.mutateAsync({
          category_id: categoryId,
          month,
          year,
          planned_amount: amount > 0 ? amount : 0,
        });
      }

      // Reset and close
      setSelectedIds([]);
      setAmounts({});
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedIds([]);
      setAmounts({});
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{parentCategory?.icon}</span>
            Adicionar Subcategoria ao Planejamento
          </DialogTitle>
          <DialogDescription>
            Selecione subcategorias de "{parentCategory?.name}" para adicionar ao planejamento
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px] pr-4">
          <div className="space-y-3">
            {availableSubcategories.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                Todas as subcategorias desta categoria já estão no planejamento ou não existem subcategorias cadastradas.
              </p>
            ) : (
              availableSubcategories.map((subcategory) => (
                <div 
                  key={subcategory.id} 
                  className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={subcategory.id}
                    checked={selectedIds.includes(subcategory.id)}
                    onCheckedChange={() => toggleSelection(subcategory.id)}
                  />
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-base"
                    style={{ backgroundColor: `${subcategory.color}20` }}
                  >
                    {subcategory.icon || "📦"}
                  </div>
                  <label 
                    htmlFor={subcategory.id}
                    className="flex-1 text-sm font-medium cursor-pointer"
                  >
                    {subcategory.name}
                  </label>
                  <CurrencyInput
                    placeholder="R$ 0,00"
                    className="w-28 text-right"
                    value={amounts[subcategory.id]}
                    onValueChange={(v) => setAmount(subcategory.id, v)}
                  />
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-3 pt-4">
          <Button 
            type="button" 
            variant="outline" 
            className="flex-1" 
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button 
            className="flex-1" 
            disabled={isSubmitting || selectedIds.length === 0}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adicionando...
              </>
            ) : (
              `Adicionar ${selectedIds.length > 0 ? `(${selectedIds.length})` : ""}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
