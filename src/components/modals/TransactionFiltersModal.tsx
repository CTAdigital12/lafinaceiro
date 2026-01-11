import { useState, useEffect } from "react";
import { X, Filter, Calendar } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreditCards } from "@/hooks/useCreditCards";

export interface TransactionFilters {
  categoryIds: string[];
  type: "all" | "income" | "expense";
  accountId: string | null;
  creditCardId: string | null;
  status: "all" | "completed" | "pending";
  dateRange: { from: Date | null; to: Date | null } | null;
}

interface TransactionFiltersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: TransactionFilters;
  onApplyFilters: (filters: TransactionFilters) => void;
  activeTab: "checking" | "credit";
}

const defaultFilters: TransactionFilters = {
  categoryIds: [],
  type: "all",
  accountId: null,
  creditCardId: null,
  status: "all",
  dateRange: null,
};

export function TransactionFiltersModal({
  open,
  onOpenChange,
  filters,
  onApplyFilters,
  activeTab,
}: TransactionFiltersModalProps) {
  const [localFilters, setLocalFilters] = useState<TransactionFilters>(filters);
  const { incomeCategories, expenseCategories } = useCategories();
  const { accounts } = useAccounts();
  const { creditCards } = useCreditCards();

  const allCategories = [...incomeCategories, ...expenseCategories];

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters, open]);

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    setLocalFilters((prev) => ({
      ...prev,
      categoryIds: checked
        ? [...prev.categoryIds, categoryId]
        : prev.categoryIds.filter((id) => id !== categoryId),
    }));
  };

  const handleApply = () => {
    onApplyFilters(localFilters);
    onOpenChange(false);
  };

  const handleClear = () => {
    setLocalFilters(defaultFilters);
    onApplyFilters(defaultFilters);
    onOpenChange(false);
  };

  const activeFiltersCount =
    localFilters.categoryIds.length +
    (localFilters.type !== "all" ? 1 : 0) +
    (localFilters.accountId ? 1 : 0) +
    (localFilters.creditCardId ? 1 : 0) +
    (localFilters.status !== "all" ? 1 : 0) +
    (localFilters.dateRange ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros Avançados
            {activeFiltersCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Tipo de Transação */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de Transação</Label>
            <Select
              value={localFilters.type}
              onValueChange={(value: "all" | "income" | "expense") =>
                setLocalFilters((prev) => ({ ...prev, type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Status</Label>
            <Select
              value={localFilters.status}
              onValueChange={(value: "all" | "completed" | "pending") =>
                setLocalFilters((prev) => ({ ...prev, status: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="completed">Concluída</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conta ou Cartão */}
          {activeTab === "checking" ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Conta</Label>
              <Select
                value={localFilters.accountId || "all"}
                onValueChange={(value) =>
                  setLocalFilters((prev) => ({
                    ...prev,
                    accountId: value === "all" ? null : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as contas</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cartão</Label>
              <Select
                value={localFilters.creditCardId || "all"}
                onValueChange={(value) =>
                  setLocalFilters((prev) => ({
                    ...prev,
                    creditCardId: value === "all" ? null : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar cartão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cartões</SelectItem>
                  {creditCards.map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.name} •{card.last_digits}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Período Personalizado */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Período Personalizado</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !localFilters.dateRange?.from && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {localFilters.dateRange?.from
                      ? format(localFilters.dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                      : "Data inicial"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={localFilters.dateRange?.from || undefined}
                    onSelect={(date) =>
                      setLocalFilters((prev) => ({
                        ...prev,
                        dateRange: {
                          from: date || null,
                          to: prev.dateRange?.to || null,
                        },
                      }))
                    }
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "flex-1 justify-start text-left font-normal",
                      !localFilters.dateRange?.to && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {localFilters.dateRange?.to
                      ? format(localFilters.dateRange.to, "dd/MM/yyyy", { locale: ptBR })
                      : "Data final"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={localFilters.dateRange?.to || undefined}
                    onSelect={(date) =>
                      setLocalFilters((prev) => ({
                        ...prev,
                        dateRange: {
                          from: prev.dateRange?.from || null,
                          to: date || null,
                        },
                      }))
                    }
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              {localFilters.dateRange && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setLocalFilters((prev) => ({ ...prev, dateRange: null }))
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Categorias */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Categorias ({localFilters.categoryIds.length} selecionadas)
            </Label>
            <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-3 space-y-2">
              {allCategories.map((category) => (
                <label
                  key={category.id}
                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
                >
                  <Checkbox
                    checked={localFilters.categoryIds.includes(category.id)}
                    onCheckedChange={(checked) =>
                      handleCategoryToggle(category.id, !!checked)
                    }
                  />
                  <span className="text-lg">{category.icon}</span>
                  <span className="text-sm">{category.name}</span>
                  <span
                    className={cn(
                      "ml-auto text-xs px-1.5 py-0.5 rounded",
                      category.type === "income"
                        ? "bg-income/10 text-income"
                        : "bg-expense/10 text-expense"
                    )}
                  >
                    {category.type === "income" ? "Receita" : "Despesa"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t border-border">
          <Button variant="ghost" onClick={handleClear}>
            Limpar Filtros
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleApply}>Aplicar Filtros</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
