import { useState } from "react";
import { Loader2 } from "lucide-react";

import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { useBudgets } from "@/hooks/useBudgets";
import { useCategories } from "@/hooks/useCategories";

interface NewBudgetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: number;
  year: number;
  /** Categories that already have a budget this period; disabled in the picker. */
  existingBudgetCategoryIds?: string[];
}

export function NewBudgetModal({
  open,
  onOpenChange,
  month,
  year,
  existingBudgetCategoryIds = [],
}: NewBudgetModalProps) {
  const { createBudget } = useBudgets(month, year);
  const { categories } = useCategories();
  const [categoryId, setCategoryId] = useState("");
  const [plannedAmount, setPlannedAmount] = useState<number | undefined>(undefined);

  const expenseCategories = categories.filter((c) => c.type === "expense");
  const disabledIds = new Set(existingBudgetCategoryIds);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    createBudget.mutate({
      category_id: categoryId || null,
      month,
      year,
      planned_amount: plannedAmount ?? 0,
    }, {
      onSuccess: () => {
        setCategoryId("");
        setPlannedAmount(undefined);
        onOpenChange(false);
      },
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova Meta de Orçamento"
      description="Defina uma meta de gastos para uma categoria"
      className="sm:max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="category">Categoria</Label>
          <CategoryCombobox
            categories={expenseCategories}
            value={categoryId}
            onChange={setCategoryId}
            disabledIds={disabledIds}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Valor Planejado (R$)</Label>
          <CurrencyInput
            id="amount"
            value={plannedAmount}
            onValueChange={setPlannedAmount}
            required
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1" disabled={createBudget.isPending || !categoryId}>
            {createBudget.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Criar Meta"
            )}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
