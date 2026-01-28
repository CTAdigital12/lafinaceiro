import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { CategorySelector } from "@/components/CategorySelector";
import { Transaction } from "@/hooks/useTransactions";

interface EditInstallmentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installments: Transaction[];
  baseDescription: string;
  onSave: (data: { description?: string; amount?: number; category_id?: string }) => Promise<void>;
}

export function EditInstallmentsModal({
  open,
  onOpenChange,
  installments,
  baseDescription,
  onSave,
}: EditInstallmentsModalProps) {
  const [description, setDescription] = useState(baseDescription);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  
  const [updateDescription, setUpdateDescription] = useState(false);
  const [updateAmount, setUpdateAmount] = useState(false);
  const [updateCategory, setUpdateCategory] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open && installments.length > 0) {
      setDescription(baseDescription);
      setAmount(String(installments[0].amount));
      setCategoryId(installments[0].category_id || "");
      setUpdateDescription(false);
      setUpdateAmount(false);
      setUpdateCategory(false);
    }
  }, [open, installments, baseDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!updateDescription && !updateAmount && !updateCategory) {
      return;
    }
    
    setIsSubmitting(true);
    try {
      const data: { description?: string; amount?: number; category_id?: string } = {};
      
      if (updateDescription) data.description = description;
      if (updateAmount) data.amount = parseFloat(amount);
      if (updateCategory) data.category_id = categoryId;
      
      await onSave(data);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentCategory = installments[0]?.categories;
  const hasSelection = updateDescription || updateAmount || updateCategory;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar Todas as Parcelas"
      description={`As alterações serão aplicadas a todas as ${installments.length} parcelas.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="updateDescription"
              checked={updateDescription}
              onCheckedChange={(checked) => setUpdateDescription(!!checked)}
            />
            <Label htmlFor="updateDescription" className="cursor-pointer">
              Atualizar Descrição
            </Label>
          </div>
          {updateDescription && (
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nova descrição base"
            />
          )}
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="updateAmount"
              checked={updateAmount}
              onCheckedChange={(checked) => setUpdateAmount(!!checked)}
            />
            <Label htmlFor="updateAmount" className="cursor-pointer">
              Atualizar Valor
            </Label>
          </div>
          {updateAmount && (
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Novo valor por parcela"
            />
          )}
        </div>

        {/* Category */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="updateCategory"
              checked={updateCategory}
              onCheckedChange={(checked) => setUpdateCategory(!!checked)}
            />
            <Label htmlFor="updateCategory" className="cursor-pointer">
              Atualizar Categoria
            </Label>
          </div>
          {updateCategory && (
            <CategorySelector
              value={categoryId}
              type="expense"
              currentCategory={currentCategory}
              onSelect={setCategoryId}
            />
          )}
        </div>

        {/* Info box */}
        <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
          <p>Selecione os campos que deseja atualizar. As alterações serão aplicadas em lote a todas as parcelas.</p>
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
            disabled={isSubmitting || !hasSelection}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
