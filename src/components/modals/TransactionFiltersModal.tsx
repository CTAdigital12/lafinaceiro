import { useState, useEffect, useMemo } from "react";
import { X, Filter, Calendar, Check, ChevronsUpDown, Search } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCategories, groupCategoriesByParent } from "@/hooks/useCategories";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreditCards } from "@/hooks/useCreditCards";

export interface TransactionFilters {
  categoryIds: string[];
  type: "all" | "income" | "expense";
  accountId: string | null;
  creditCardId: string | null;
  status: "all" | "completed" | "pending";
  dateRange: { from: Date | null; to: Date | null } | null;
  installmentFilter: "all" | "only_installments" | "no_installments";
  corporateFilter: "all" | "only_corporate" | "no_corporate";
  cardPaymentFilter: "all" | "only_card_payment" | "no_card_payment";
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
  installmentFilter: "all",
  corporateFilter: "all",
  cardPaymentFilter: "all",
};

const typeOptions = [
  { value: "all", label: "Todos" },
  { value: "income", label: "Receita" },
  { value: "expense", label: "Despesa" },
];

const statusOptions = [
  { value: "all", label: "Todos" },
  { value: "completed", label: "Concluída" },
  { value: "pending", label: "Pendente" },
];

const installmentOptions = [
  { value: "all", label: "Todas" },
  { value: "only_installments", label: "Apenas parceladas" },
  { value: "no_installments", label: "Apenas à vista" },
];

const corporateOptions = [
  { value: "all", label: "Todas" },
  { value: "only_corporate", label: "Apenas empresariais" },
  { value: "no_corporate", label: "Apenas pessoais" },
];

const cardPaymentOptions = [
  { value: "all", label: "Todas" },
  { value: "only_card_payment", label: "Apenas pagamentos de fatura" },
  { value: "no_card_payment", label: "Excluir pagamentos de fatura" },
];

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

  const [openTypePopover, setOpenTypePopover] = useState(false);
  const [openStatusPopover, setOpenStatusPopover] = useState(false);
  const [openAccountPopover, setOpenAccountPopover] = useState(false);
  const [openCardPopover, setOpenCardPopover] = useState(false);
  const [openInstallmentPopover, setOpenInstallmentPopover] = useState(false);
  const [openCorporatePopover, setOpenCorporatePopover] = useState(false);
  const [openCardPaymentPopover, setOpenCardPaymentPopover] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  const allCategories = [...incomeCategories, ...expenseCategories];

  // Filter categories by search text
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return allCategories;
    const searchLower = categorySearch.toLowerCase();
    return allCategories.filter(cat =>
      cat.name.toLowerCase().includes(searchLower) ||
      cat.fullName?.toLowerCase().includes(searchLower) ||
      cat.parentName?.toLowerCase().includes(searchLower)
    );
  }, [allCategories, categorySearch]);

  // Group categories by parent
  const groupedCategories = useMemo(() => {
    return groupCategoriesByParent(filteredCategories);
  }, [filteredCategories]);

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
    (localFilters.dateRange ? 1 : 0) +
    (localFilters.installmentFilter !== "all" ? 1 : 0) +
    (localFilters.corporateFilter !== "all" ? 1 : 0) +
    (localFilters.cardPaymentFilter !== "all" ? 1 : 0);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filtros Avançados
          {activeFiltersCount > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </span>
      }
      className="sm:max-w-lg"
    >

        <div className="space-y-6 py-4">
          {/* Tipo de Transação */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de Transação</Label>
            <Popover open={openTypePopover} onOpenChange={setOpenTypePopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openTypePopover}
                  className="w-full justify-between"
                >
                  {typeOptions.find(o => o.value === localFilters.type)?.label || "Selecionar tipo"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar tipo..." />
                  <CommandList>
                    <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
                    <CommandGroup>
                      {typeOptions.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.label}
                          onSelect={() => {
                            setLocalFilters((prev) => ({ ...prev, type: option.value as "all" | "income" | "expense" }));
                            setOpenTypePopover(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", localFilters.type === option.value ? "opacity-100" : "opacity-0")}
                          />
                          {option.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Status</Label>
            <Popover open={openStatusPopover} onOpenChange={setOpenStatusPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openStatusPopover}
                  className="w-full justify-between"
                >
                  {statusOptions.find(o => o.value === localFilters.status)?.label || "Selecionar status"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar status..." />
                  <CommandList>
                    <CommandEmpty>Nenhum status encontrado.</CommandEmpty>
                    <CommandGroup>
                      {statusOptions.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.label}
                          onSelect={() => {
                            setLocalFilters((prev) => ({ ...prev, status: option.value as "all" | "completed" | "pending" }));
                            setOpenStatusPopover(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", localFilters.status === option.value ? "opacity-100" : "opacity-0")}
                          />
                          {option.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Filtro de Parcelamentos */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Parcelamentos</Label>
            <Popover open={openInstallmentPopover} onOpenChange={setOpenInstallmentPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openInstallmentPopover}
                  className="w-full justify-between"
                >
                  {installmentOptions.find(o => o.value === localFilters.installmentFilter)?.label || "Todas"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
                    <CommandGroup>
                      {installmentOptions.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.label}
                          onSelect={() => {
                            setLocalFilters((prev) => ({ ...prev, installmentFilter: option.value as "all" | "only_installments" | "no_installments" }));
                            setOpenInstallmentPopover(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", localFilters.installmentFilter === option.value ? "opacity-100" : "opacity-0")}
                          />
                          {option.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Filtro de Despesas Empresariais */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Despesas Empresariais</Label>
            <Popover open={openCorporatePopover} onOpenChange={setOpenCorporatePopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCorporatePopover}
                  className="w-full justify-between"
                >
                  {corporateOptions.find(o => o.value === localFilters.corporateFilter)?.label || "Todas"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
                    <CommandGroup>
                      {corporateOptions.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.label}
                          onSelect={() => {
                            setLocalFilters((prev) => ({ ...prev, corporateFilter: option.value as "all" | "only_corporate" | "no_corporate" }));
                            setOpenCorporatePopover(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", localFilters.corporateFilter === option.value ? "opacity-100" : "opacity-0")}
                          />
                          {option.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Filtro de Pagamentos de Fatura */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Pagamentos de Fatura</Label>
            <Popover open={openCardPaymentPopover} onOpenChange={setOpenCardPaymentPopover}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openCardPaymentPopover}
                  className="w-full justify-between"
                >
                  {cardPaymentOptions.find(o => o.value === localFilters.cardPaymentFilter)?.label || "Todas"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar..." />
                  <CommandList>
                    <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
                    <CommandGroup>
                      {cardPaymentOptions.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.label}
                          onSelect={() => {
                            setLocalFilters((prev) => ({ ...prev, cardPaymentFilter: option.value as "all" | "only_card_payment" | "no_card_payment" }));
                            setOpenCardPaymentPopover(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", localFilters.cardPaymentFilter === option.value ? "opacity-100" : "opacity-0")}
                          />
                          {option.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Conta ou Cartão */}
          {activeTab === "checking" ? (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Conta</Label>
              <Popover open={openAccountPopover} onOpenChange={setOpenAccountPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openAccountPopover}
                    className="w-full justify-between"
                  >
                    {localFilters.accountId
                      ? accounts.find(a => a.id === localFilters.accountId)?.name || "Todas as contas"
                      : "Todas as contas"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar conta..." />
                    <CommandList>
                      <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Todas as contas"
                          onSelect={() => {
                            setLocalFilters((prev) => ({ ...prev, accountId: null }));
                            setOpenAccountPopover(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", !localFilters.accountId ? "opacity-100" : "opacity-0")}
                          />
                          Todas as contas
                        </CommandItem>
                        {accounts.map((account) => (
                          <CommandItem
                            key={account.id}
                            value={account.name}
                            onSelect={() => {
                              setLocalFilters((prev) => ({ ...prev, accountId: account.id }));
                              setOpenAccountPopover(false);
                            }}
                          >
                            <Check
                              className={cn("mr-2 h-4 w-4", localFilters.accountId === account.id ? "opacity-100" : "opacity-0")}
                            />
                            {account.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cartão</Label>
              <Popover open={openCardPopover} onOpenChange={setOpenCardPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCardPopover}
                    className="w-full justify-between"
                  >
                    {localFilters.creditCardId
                      ? (() => {
                          const card = creditCards.find(c => c.id === localFilters.creditCardId);
                          return card ? `${card.name} •${card.last_digits}` : "Todos os cartões";
                        })()
                      : "Todos os cartões"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cartão..." />
                    <CommandList>
                      <CommandEmpty>Nenhum cartão encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Todos os cartões"
                          onSelect={() => {
                            setLocalFilters((prev) => ({ ...prev, creditCardId: null }));
                            setOpenCardPopover(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", !localFilters.creditCardId ? "opacity-100" : "opacity-0")}
                          />
                          Todos os cartões
                        </CommandItem>
                        {creditCards.map((card) => (
                          <CommandItem
                            key={card.id}
                            value={`${card.name} ${card.last_digits}`}
                            onSelect={() => {
                              setLocalFilters((prev) => ({ ...prev, creditCardId: card.id }));
                              setOpenCardPopover(false);
                            }}
                          >
                            <Check
                              className={cn("mr-2 h-4 w-4", localFilters.creditCardId === card.id ? "opacity-100" : "opacity-0")}
                            />
                            {card.name} •{card.last_digits}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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

            {/* Campo de busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar categoria..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Lista agrupada hierarquicamente */}
            <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-3 space-y-3">
              {groupedCategories.map((group, index) => (
                <div key={group.parent?.id || `group-${index}`}>
                  {/* Cabeçalho do grupo (categoria pai) */}
                  {group.parent && (
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                      <span>{group.parent.icon}</span>
                      <span>{group.parent.name}</span>
                    </div>
                  )}

                  {/* Subcategorias com indentação */}
                  <div className={cn("space-y-1", group.parent && "pl-4")}>
                    {group.children.map((category) => (
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
              ))}

              {filteredCategories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Nenhuma categoria encontrada.
                </p>
              )}
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
    </ResponsiveDialog>
  );
}
