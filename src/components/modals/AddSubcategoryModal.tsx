import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategories } from "@/hooks/useCategories";
import { useBudgets } from "@/hooks/useBudgets";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const emojiOptions = [
  "🏠", "🚗", "🍔", "🎬", "💊", "📚", "✈️", "🛒", "💡", "📱",
  "👕", "🎁", "🏋️", "🐕", "👶", "💼", "🎓", "🎵", "🎮", "💅",
  "🔧", "📦", "💰", "🏥", "🚌", "☕", "🍕", "🎭", "🎨", "⚽",
];

const colorOptions = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E",
  "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E",
];

interface AddSubcategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentCategory: { id: string; name: string; icon: string; color: string } | null;
  month: number;
  year: number;
}

export function AddSubcategoryModal({ 
  open, 
  onOpenChange, 
  parentCategory,
  month,
  year 
}: AddSubcategoryModalProps) {
  const { createCategory } = useCategories();
  const { createBudget } = useBudgets(month, year);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState("#3B82F6");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentCategory || !name.trim()) return;

    setIsSubmitting(true);
    try {
      // Create the subcategory
      const newCategory = await createCategory.mutateAsync({
        name: name.trim(),
        icon,
        color,
        type: "expense",
        parent_id: parentCategory.id,
      });

      // If a planned amount was provided, create a budget for it
      if (plannedAmount && parseFloat(plannedAmount) > 0) {
        await createBudget.mutateAsync({
          category_id: newCategory.id,
          month,
          year,
          planned_amount: parseFloat(plannedAmount),
        });
      }

      // Reset and close
      setName("");
      setIcon("📦");
      setColor(parentCategory.color || "#3B82F6");
      setPlannedAmount("");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form when modal opens with new parent
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && parentCategory) {
      setColor(parentCategory.color || "#3B82F6");
    }
    if (!newOpen) {
      setName("");
      setIcon("📦");
      setPlannedAmount("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{parentCategory?.icon}</span>
            Nova Subcategoria
          </DialogTitle>
          <DialogDescription>
            Adicionar subcategoria em "{parentCategory?.name}"
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Subcategoria</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Aluguel, Energia, Água..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Ícone</Label>
            <div className="flex flex-wrap gap-2">
              {emojiOptions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={cn(
                    "w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all",
                    icon === emoji
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all",
                    color === c ? "ring-2 ring-offset-2 ring-primary" : ""
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Meta de Orçamento (R$) - Opcional</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0,00"
              value={plannedAmount}
              onChange={(e) => setPlannedAmount(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Criar Subcategoria"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
