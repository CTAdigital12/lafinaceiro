import { useState, useEffect } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { useBudgets, Budget } from "@/hooks/useBudgets";
import { Loader2 } from "lucide-react";

interface EditBudgetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: Budget | null;
  month: number;
  year: number;
}

export function EditBudgetModal({ open, onOpenChange, budget, month, year }: EditBudgetModalProps) {
  const { updateBudget } = useBudgets(month, year);
  const [plannedAmount, setPlannedAmount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (budget) {
      setPlannedAmount(Number(budget.planned_amount));
    }
  }, [budget]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!budget) return;

    updateBudget.mutate({
      id: budget.id,
      planned_amount: plannedAmount ?? 0,
    }, {
      onSuccess: () => {
        onOpenChange(false);
      }
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar Meta de Orçamento"
      description={<>{budget?.categories?.icon} {budget?.categories?.name}</>}
      className="sm:max-w-md"
    >
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <Button type="submit" className="flex-1" disabled={updateBudget.isPending}>
              {updateBudget.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </form>
    </ResponsiveDialog>
  );
}
