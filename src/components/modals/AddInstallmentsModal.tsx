import { useState } from "react";
import { Loader2, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Transaction } from "@/hooks/useTransactions";

interface AddInstallmentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTotal: number;
  lastInstallment: Transaction | null;
  onAdd: (count: number) => Promise<void>;
}

export function AddInstallmentsModal({
  open,
  onOpenChange,
  currentTotal,
  lastInstallment,
  onAdd,
}: AddInstallmentsModalProps) {
  const [count, setCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (count < 1) return;
    
    setIsSubmitting(true);
    try {
      await onAdd(count);
      onOpenChange(false);
      setCount(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const incrementCount = () => setCount(prev => Math.min(prev + 1, 48));
  const decrementCount = () => setCount(prev => Math.max(prev - 1, 1));

  const newTotal = currentTotal + count;
  const installmentValue = lastInstallment ? Number(lastInstallment.amount) : 0;
  const additionalAmount = installmentValue * count;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Adicionar Parcelas"
      description="Adicionar novas parcelas ao final da compra parcelada."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Counter */}
        <div className="space-y-2">
          <Label>Quantidade de Parcelas</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={decrementCount}
              disabled={count <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={48}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(48, Number(e.target.value) || 1)))}
              className="text-center"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={incrementCount}
              disabled={count >= 48}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-muted/50 p-4 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total atual:</span>
            <span className="font-medium">{currentTotal} parcelas</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Novo total:</span>
            <span className="font-medium text-primary">{newTotal} parcelas</span>
          </div>
          <div className="border-t border-border my-2" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Valor por parcela:</span>
            <span className="font-medium">
              R$ {installmentValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Valor adicional:</span>
            <span className="font-medium text-expense">
              R$ {additionalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={isSubmitting || count < 1}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adicionando...
              </>
            ) : (
              `Adicionar ${count} Parcela${count > 1 ? "s" : ""}`
            )}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
