import { useState } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBudgets } from "@/hooks/useBudgets";
import { useCategories, groupCategoriesByParent } from "@/hooks/useCategories";
import { Loader2, Check, ChevronsUpDown } from "lucide-react";
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
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface NewBudgetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: number;
  year: number;
}

export function NewBudgetModal({ open, onOpenChange, month, year }: NewBudgetModalProps) {
  const { createBudget } = useBudgets(month, year);
  const { categories } = useCategories();
  const [categoryId, setCategoryId] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [openCategoryPopover, setOpenCategoryPopover] = useState(false);

  const expenseCategories = categories.filter((c) => c.type === "expense");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    createBudget.mutate({
      category_id: categoryId || null,
      month,
      year,
      planned_amount: parseFloat(plannedAmount) || 0,
    }, {
      onSuccess: () => {
        setCategoryId("");
        setPlannedAmount("");
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Meta de Orçamento</DialogTitle>
          <DialogDescription>
            Defina uma meta de gastos para uma categoria
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            <Popover open={openCategoryPopover} onOpenChange={setOpenCategoryPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCategoryPopover}
                  className="w-full justify-between"
                >
                  {categoryId ? (
                    <span className="flex items-center gap-2">
                      {expenseCategories.find(c => c.id === categoryId)?.icon}
                      {expenseCategories.find(c => c.id === categoryId)?.fullName || expenseCategories.find(c => c.id === categoryId)?.name}
                    </span>
                  ) : (
                    "Selecione uma categoria"
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar categoria..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                    {groupCategoriesByParent(expenseCategories).map((group, groupIndex) => (
                      <CommandGroup 
                        key={groupIndex} 
                        heading={group.parent ? `${group.parent.icon} ${group.parent.name}` : undefined}
                      >
                        {group.children.map((category) => (
                          <CommandItem
                            key={category.id}
                            value={category.fullName || category.name}
                            onSelect={() => {
                              setCategoryId(category.id);
                              setOpenCategoryPopover(false);
                            }}
                            className={group.parent ? "pl-4" : ""}
                          >
                            <Check
                              className={cn("mr-2 h-4 w-4", categoryId === category.id ? "opacity-100" : "opacity-0")}
                            />
                            <span className="mr-2">{category.icon}</span>
                            {group.parent ? category.name : (category.fullName || category.name)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Valor Planejado (R$)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0,00"
              value={plannedAmount}
              onChange={(e) => setPlannedAmount(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={createBudget.isPending}>
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
      </DialogContent>
    </Dialog>
  );
}
