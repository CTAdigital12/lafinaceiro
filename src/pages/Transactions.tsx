import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  CheckCircle2,
  Circle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Loader2,
  CreditCard,
  Building2,
  CalendarDays,
  List,
  Receipt,
  Download,
  X,
  Tag,
  Copy,
  Building,
  RotateCcw,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories, groupCategoriesByParent } from "@/hooks/useCategories";
import { TransactionModal } from "@/components/modals/TransactionModal";
import { TransactionFiltersModal, TransactionFilters } from "@/components/modals/TransactionFiltersModal";
import { CategorySelector } from "@/components/CategorySelector";
import { InstallmentDetailsSheet } from "@/components/InstallmentDetailsSheet";
import { useDate } from "@/contexts/DateContext";
import { useToast } from "@/hooks/use-toast";
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

// Format date string (YYYY-MM-DD) to Brazilian format without timezone issues
function formatDateBR(dateString: string | null): string {
  if (!dateString) return "-";
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

type TransactionTab = "checking" | "credit";

export default function Transactions() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [duplicatingTransaction, setDuplicatingTransaction] = useState<Transaction | null>(null);
  const [refundingTransaction, setRefundingTransaction] = useState<Transaction | null>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TransactionTab>("checking");
  const [showAll, setShowAll] = useState(false);
  const [loadedCount, setLoadedCount] = useState(20);

  // Debounce search query to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset loadedCount when search changes
  useEffect(() => {
    setLoadedCount(20);
  }, [debouncedSearchQuery]);
  const [showCurrentInvoice, setShowCurrentInvoice] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null);
  const [showBulkCategorySelector, setShowBulkCategorySelector] = useState(false);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [selectedInstallmentGroupId, setSelectedInstallmentGroupId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({
    categoryIds: [],
    type: "all",
    accountId: null,
    creditCardId: null,
    status: "all",
    dateRange: null,
    installmentFilter: "all",
    corporateFilter: "all",
    cardPaymentFilter: "all",
  });
  
  // Sorting state
  type SortField = "date" | "amount" | "description" | null;
  type SortDirection = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  const pageSize = 20;
  
  const { month, year } = useDate();
  const { toast } = useToast();
  const { categories } = useCategories();
  const queryClient = useQueryClient();
  
  // Use filterByDueDate when showing current invoice on credit tab
  const filterByDueDate = showCurrentInvoice && activeTab === "credit";
  
  const { 
    transactions, 
    isLoading, 
    totalIncome, 
    totalExpense, 
    totalCount,
    hasMore,
    deleteTransaction,
    updateTransaction,
  } = useTransactions(undefined, undefined, { 
    showAll, 
    loadedCount,
    filterByDueDate,
    creditCardFilter: activeTab === "credit" ? "only" : "exclude",
    searchQuery: debouncedSearchQuery,
  });
  const { totalBalance } = useAccounts();
  
  // Count active filters
  const activeFiltersCount =
    filters.categoryIds.length +
    (filters.type !== "all" ? 1 : 0) +
    (filters.accountId ? 1 : 0) +
    (filters.creditCardId ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.dateRange ? 1 : 0) +
    (filters.installmentFilter !== "all" ? 1 : 0) +
    (filters.corporateFilter !== "all" ? 1 : 0) +
    (filters.cardPaymentFilter !== "all" ? 1 : 0);

  // Bulk delete handler
  const handleBulkDelete = async () => {
    for (const id of selectedTransactions) {
      await deleteTransaction.mutateAsync(id);
    }
    setSelectedTransactions([]);
    setShowDeleteDialog(false);
    toast({ title: `${selectedTransactions.length} transações excluídas!` });
  };

  // Bulk category update handler
  const handleBulkCategoryUpdate = async (categoryId: string) => {
    for (const id of selectedTransactions) {
      await updateTransaction.mutateAsync({ id, category_id: categoryId });
    }
    setSelectedTransactions([]);
    setShowBulkCategorySelector(false);
    toast({ title: `Categoria atualizada em ${selectedTransactions.length} transações!` });
  };

  // Bulk corporate expense toggle handler
  const handleBulkCorporateToggle = async (markAsCorporate: boolean) => {
    for (const id of selectedTransactions) {
      await updateTransaction.mutateAsync({ id, is_corporate_expense: markAsCorporate });
    }
    setSelectedTransactions([]);
    toast({ 
      title: markAsCorporate 
        ? `${selectedTransactions.length} transações marcadas como empresarial!` 
        : `${selectedTransactions.length} transações desmarcadas como empresarial!`
    });
  };

  // Export transactions to XLSX
  const handleExport = () => {
    const transactionsToExport = selectedTransactions.length > 0
      ? filteredTransactions.filter(t => selectedTransactions.includes(t.id))
      : filteredTransactions;

    const data = transactionsToExport.map(t => {
      let value = Number(t.amount);
      if (t.type === "expense" && !t.is_refund) value = -value;
      if (t.type === "income" && t.is_refund) value = -value;
      
      return {
        "Data": formatDateBR(t.date),
        "Vencimento": formatDateBR(t.due_date),
        "Descrição": t.description,
        "Categoria": t.categories?.name || "",
        "Conta/Cartão": t.credit_card_id ? t.credit_cards?.name : t.accounts?.name || "",
        "Tipo": t.type === "income" ? "Receita" : "Despesa",
        "Valor": value,
        "Status": t.status === "completed" ? "Concluída" : "Pendente",
        "Pag. Fatura": t.is_card_payment ? "Sim" : "Não",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transações");
    
    // Auto-size columns
    const colWidths = [
      { wch: 12 }, // Data
      { wch: 12 }, // Vencimento
      { wch: 40 }, // Descrição
      { wch: 20 }, // Categoria
      { wch: 20 }, // Conta/Cartão
      { wch: 10 }, // Tipo
      { wch: 15 }, // Valor
      { wch: 12 }, // Status
      { wch: 12 }, // Pag. Fatura
    ];
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, `transacoes_${year}-${String(month).padStart(2, "0")}.xlsx`);
    
    toast({ title: `${transactionsToExport.length} transações exportadas!` });
  };

  // Reset loadedCount when toggling showAll
  const handleShowAllChange = (checked: boolean) => {
    setShowAll(checked);
    setLoadedCount(20);
  };

  // Load all remaining transactions
  const handleLoadMore = () => {
    setLoadedCount(totalCount);
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as TransactionTab);
    setLoadedCount(20);
    setSelectedTransactions([]);
  };

  // Apply advanced filters (no need for tab filtering since query already filters by credit_card_id)
  const filteredByAdvanced = transactions.filter((t) => {
    // Filter by category
    if (filters.categoryIds.length > 0 && !filters.categoryIds.includes(t.category_id || "")) {
      return false;
    }
    // Filter by type
    if (filters.type !== "all" && t.type !== filters.type) {
      return false;
    }
    // Filter by account
    if (filters.accountId && t.account_id !== filters.accountId) {
      return false;
    }
    // Filter by credit card
    if (filters.creditCardId && t.credit_card_id !== filters.creditCardId) {
      return false;
    }
    // Filter by status
    if (filters.status !== "all" && t.status !== filters.status) {
      return false;
    }
    // Filter by date range
    if (filters.dateRange) {
      const transactionDate = new Date(t.date);
      if (filters.dateRange.from && transactionDate < filters.dateRange.from) {
        return false;
      }
      if (filters.dateRange.to && transactionDate > filters.dateRange.to) {
        return false;
      }
    }
    // Filter by installments
    if (filters.installmentFilter === "only_installments") {
      if (!t.total_installments || t.total_installments <= 1) {
        return false;
      }
    } else if (filters.installmentFilter === "no_installments") {
      if (t.total_installments && t.total_installments > 1) {
        return false;
      }
    }
    // Filter by corporate expenses
    if (filters.corporateFilter === "only_corporate") {
      if (!t.is_corporate_expense) {
        return false;
      }
    } else if (filters.corporateFilter === "no_corporate") {
      if (t.is_corporate_expense) {
        return false;
      }
    }
    // Filter by card payment
    if (filters.cardPaymentFilter === "only_card_payment") {
      if (!t.is_card_payment) {
        return false;
      }
    } else if (filters.cardPaymentFilter === "no_card_payment") {
      if (t.is_card_payment) {
        return false;
      }
    }
    return true;
  });

  // Handle sorting toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction or clear sort
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else {
        setSortField(null);
        setSortDirection("desc");
      }
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Get sort icon for header
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    return sortDirection === "desc" 
      ? <ArrowDown className="h-3 w-3" /> 
      : <ArrowUp className="h-3 w-3" />;
  };

  // Apply sorting to filtered transactions
  const sortedTransactions = [...filteredByAdvanced].sort((a, b) => {
    if (!sortField) return 0;
    
    let comparison = 0;
    
    switch (sortField) {
      case "date":
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case "amount":
        comparison = Number(a.amount) - Number(b.amount);
        break;
      case "description":
        comparison = a.description.localeCompare(b.description, "pt-BR");
        break;
    }
    
    return sortDirection === "asc" ? comparison : -comparison;
  });

  // Search is now handled at database level, so just use advanced filters
  const filteredTransactions = sortedTransactions;

  // Select all visible transactions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTransactions(filteredTransactions.map(t => t.id));
    } else {
      setSelectedTransactions([]);
    }
  };

  const allSelected = filteredTransactions.length > 0 && 
    filteredTransactions.every(t => selectedTransactions.includes(t.id));

  // Handle category update inline - for installments, update all in group
  const handleCategoryChange = async (transactionId: string, categoryId: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    
    // If it's part of an installment group, update all installments
    if (transaction?.installment_group_id) {
      const { error } = await supabase
        .from("transactions")
        .update({ category_id: categoryId })
        .eq("installment_group_id", transaction.installment_group_id);
      
      if (error) {
        toast({ title: "Erro ao atualizar categoria", description: error.message, variant: "destructive" });
        return;
      }
      
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({ title: "Categoria atualizada em todas as parcelas!" });
    } else {
      // Single transaction - update only it
      updateTransaction.mutate({ id: transactionId, category_id: categoryId });
    }
  };

  // Calculate totals based on filtered transactions (respects all filters and refunds)
  const tabTotalIncome = filteredTransactions
    .filter((t) => 
      (t.type === "income" && !t.is_refund) || 
      (t.type === "expense" && t.is_refund)
    )
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  // Calcular despesas normais (excluindo estornos e pagamentos de fatura)
  const normalExpenses = filteredTransactions
    .filter((t) => t.type === "expense" && !t.is_refund && !t.is_card_payment)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Calcular estornos de despesas (devem ser subtraídos)
  const expenseRefunds = filteredTransactions
    .filter((t) => t.type === "expense" && t.is_refund)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Total = Despesas - Estornos (mesma lógica do useCreditCardReconciliation)
  const tabTotalExpense = normalExpenses - expenseRefunds;

  const toggleTransaction = (id: string) => {
    setSelectedTransactions((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setDuplicatingTransaction(null);
    setRefundingTransaction(null);
    setIsModalOpen(true);
  };

  const handleDuplicate = (transaction: Transaction) => {
    setDuplicatingTransaction(transaction);
    setEditingTransaction(null);
    setRefundingTransaction(null);
    setIsModalOpen(true);
  };

  const handleCreateRefund = (transaction: Transaction) => {
    setRefundingTransaction(transaction);
    setEditingTransaction(null);
    setDuplicatingTransaction(null);
    setIsModalOpen(true);
  };

  // Handle clicking on a transaction row
  const handleTransactionClick = (transaction: Transaction) => {
    // If it has an installment group, open the installment details sheet
    if (transaction.installment_group_id) {
      setSelectedInstallmentGroupId(transaction.installment_group_id);
    } else {
      // Otherwise, open edit modal
      handleEdit(transaction);
    }
  };

  // Handle editing a single installment from the InstallmentDetailsSheet
  const handleEditInstallment = (transaction: Transaction) => {
    setSelectedInstallmentGroupId(null); // Close the sheet
    handleEdit(transaction); // Open the edit modal
  };

  const handleModalClose = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setEditingTransaction(null);
      setDuplicatingTransaction(null);
      setRefundingTransaction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-balance" />
      </div>
    );
  }

  return (
    <div className="flex gap-6 overflow-x-hidden">
      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Transações</h1>
            <p className="text-muted-foreground">Gerencie suas receitas e despesas</p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Nova Transação
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="checking" className="gap-2">
              <Building2 className="h-4 w-4" />
              Conta Corrente
            </TabsTrigger>
            <TabsTrigger value="credit" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Cartão de Crédito
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar transações..." 
                  className="pl-9" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* Show All Toggle */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
                <CalendarDays className={cn("h-4 w-4 transition-colors", !showAll ? "text-primary" : "text-muted-foreground")} />
                <Switch
                  id="show-all"
                  checked={showAll}
                  onCheckedChange={handleShowAllChange}
                />
                <List className={cn("h-4 w-4 transition-colors", showAll ? "text-primary" : "text-muted-foreground")} />
                <Label htmlFor="show-all" className="text-sm cursor-pointer min-w-[70px]">
                  {showAll ? "Todas" : (
                    <span className="font-medium text-primary">
                      {String(month).padStart(2, "0")}/{year}
                    </span>
                  )}
                </Label>
              </div>

              {/* Current Invoice Filter - only for credit card tab */}
              {activeTab === "credit" && (
                <Button
                  variant={showCurrentInvoice ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setShowCurrentInvoice(!showCurrentInvoice)}
                >
                  <Receipt className="h-4 w-4" />
                  Fatura Atual
                  {showCurrentInvoice && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {String(month).padStart(2, "0")}/{year}
                    </Badge>
                  )}
                </Button>
              )}

              <Button variant="outline" className="gap-2" onClick={handleExport}>
                <Download className="h-4 w-4" />
                Exportar
                {selectedTransactions.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {selectedTransactions.length}
                  </Badge>
                )}
              </Button>

              <Button 
                variant={activeFiltersCount > 0 ? "default" : "outline"} 
                className="gap-2"
                onClick={() => setShowFiltersModal(true)}
              >
                <Filter className="h-4 w-4" />
                Filtros
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Active Filters Chips */}
            {activeFiltersCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {filters.type !== "all" && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Tipo: {filters.type === "income" ? "Receita" : "Despesa"}
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, type: "all" }))}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.status !== "all" && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Status: {filters.status === "completed" ? "Concluída" : "Pendente"}
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, status: "all" }))}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.accountId && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Conta filtrada
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, accountId: null }))}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.creditCardId && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Cartão filtrado
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, creditCardId: null }))}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.dateRange && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Período personalizado
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, dateRange: null }))}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filters.categoryIds.length > 0 && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    {filters.categoryIds.length} categoria{filters.categoryIds.length > 1 ? "s" : ""}
                    <button
                      onClick={() => setFilters((prev) => ({ ...prev, categoryIds: [] }))}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setFilters({
                    categoryIds: [],
                    type: "all",
                    accountId: null,
                    creditCardId: null,
                    status: "all",
                    dateRange: null,
                    installmentFilter: "all",
                    corporateFilter: "all",
                    cardPaymentFilter: "all",
                  })}
                >
                  Limpar todos
                </Button>
              </div>
            )}

            {/* Bulk Actions Bar */}
            {selectedTransactions.length > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Badge variant="default" className="font-medium">
                  {selectedTransactions.length} selecionada{selectedTransactions.length > 1 ? "s" : ""}
                </Badge>
                
                <div className="flex items-center gap-2 ml-auto">
                  {/* Bulk Category Change */}
                  {showBulkCategorySelector ? (
                    <div className="flex items-center gap-2 bg-card rounded-lg border border-border p-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 min-w-[180px] justify-start text-sm">
                            Selecionar categoria...
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar categoria..." />
                            <CommandList>
                              <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                              {groupCategoriesByParent(categories).map((group, groupIndex) => (
                                <CommandGroup 
                                  key={groupIndex} 
                                  heading={group.parent ? `${group.parent.icon} ${group.parent.name}` : undefined}
                                >
                                  {group.children.map((cat) => (
                                    <CommandItem
                                      key={cat.id}
                                      value={cat.fullName || cat.name}
                                      onSelect={() => handleBulkCategoryUpdate(cat.id)}
                                      className={group.parent ? "pl-4" : ""}
                                    >
                                      <span className="mr-2">{cat.icon}</span>
                                      {group.parent ? cat.name : (cat.fullName || cat.name)}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setShowBulkCategorySelector(false)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowBulkCategorySelector(true)}
                    >
                      <Tag className="h-4 w-4" />
                      Alterar Categoria
                    </Button>
                  )}

                  {/* Bulk Corporate Expense */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleBulkCorporateToggle(true)}
                  >
                    <Building className="h-4 w-4" />
                    Marcar Empresarial
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleBulkCorporateToggle(false)}
                  >
                    <X className="h-4 w-4" />
                    Desmarcar Empresarial
                  </Button>

                  {/* Bulk Delete */}
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>

                  {/* Clear Selection */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTransactions([])}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Transactions Info */}
            {totalCount > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Mostrando {filteredTransactions.length} de {totalCount} transações
                </span>
              </div>
            )}

            {/* Transactions Table */}
            {filteredTransactions.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-12 text-center shadow-card">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {searchQuery ? "Nenhuma transação encontrada" : `Nenhuma transação de ${activeTab === "credit" ? "cartão" : "conta"}`}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? "Tente buscar por outro termo" : "Adicione sua primeira transação para começar"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setIsModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Transação
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block bg-card rounded-xl border border-border shadow-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={handleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>
                          <button
                            className={cn(
                              "flex items-center gap-1 hover:text-primary transition-colors cursor-pointer",
                              sortField === "date" && "text-primary font-semibold"
                            )}
                            onClick={() => handleSort("date")}
                          >
                            Data Compra
                            {getSortIcon("date")}
                          </button>
                        </TableHead>
                        {activeTab === "credit" && (
                          <TableHead className="text-primary font-medium">Vencimento</TableHead>
                        )}
                        <TableHead>
                          <button
                            className={cn(
                              "flex items-center gap-1 hover:text-primary transition-colors cursor-pointer",
                              sortField === "description" && "text-primary font-semibold"
                            )}
                            onClick={() => handleSort("description")}
                          >
                            Descrição
                            {getSortIcon("description")}
                          </button>
                        </TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>{activeTab === "credit" ? "Cartão" : "Conta"}</TableHead>
                        <TableHead className="text-right">
                          <button
                            className={cn(
                              "flex items-center gap-1 ml-auto hover:text-primary transition-colors cursor-pointer",
                              sortField === "amount" && "text-primary font-semibold"
                            )}
                            onClick={() => handleSort("amount")}
                          >
                            Valor
                            {getSortIcon("amount")}
                          </button>
                        </TableHead>
                        <TableHead className="w-20">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((transaction) => (
                        <TableRow 
                          key={transaction.id} 
                          className={cn(
                            "group",
                            transaction.installment_group_id && "cursor-pointer hover:bg-muted/50",
                            transaction.total_installments && transaction.total_installments > 1 && "bg-primary/5 border-l-2 border-l-primary"
                          )}
                          onClick={() => {
                            if (transaction.installment_group_id) {
                              handleTransactionClick(transaction);
                            }
                          }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedTransactions.includes(transaction.id)}
                              onCheckedChange={() => toggleTransaction(transaction.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {transaction.status === "completed" ? (
                                <CheckCircle2 className="h-4 w-4 text-income" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
                              {transaction.total_installments && transaction.total_installments > 1 && (
                                <Layers className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{formatDateBR(transaction.date)}</TableCell>
                          {activeTab === "credit" && (
                            <TableCell className="text-primary font-medium">
                              {formatDateBR(transaction.due_date)}
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium max-w-[200px] truncate">
                                {transaction.description}
                              </span>
                              {transaction.total_installments && transaction.total_installments > 1 && (
                                <Badge variant="outline" className="text-xs font-medium text-primary border-primary/30">
                                  {transaction.installment_number}/{transaction.total_installments}
                                </Badge>
                              )}
                              {transaction.is_refund && (
                                <Badge variant="outline" className="text-xs font-medium text-amber-600 border-amber-300 bg-amber-50">
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Extorno
                                </Badge>
                              )}
                              {transaction.is_corporate_expense && (
                                <Badge variant="secondary" className="text-xs">
                                  <Building2 className="h-3 w-3 mr-1" />
                                  Empresa
                                </Badge>
                              )}
                              {transaction.is_card_payment && (
                                <Badge variant="outline" className="text-xs text-purple-600 border-purple-300 bg-purple-50">
                                  <CreditCard className="h-3 w-3 mr-1" />
                                  Fatura
                                </Badge>
                              )}
                              {transaction.is_reimbursable && (
                                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 bg-blue-50">
                                  <Receipt className="h-3 w-3 mr-1" />
                                  Reembolsável
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <CategorySelector
                              value={transaction.category_id}
                              type={transaction.type as "income" | "expense"}
                              currentCategory={transaction.categories}
                              onSelect={(categoryId) => handleCategoryChange(transaction.id, categoryId)}
                            />
                          </TableCell>
                          <TableCell>
                            {transaction.credit_card_id ? (
                              <span className="flex items-center gap-1 text-sm">
                                <CreditCard className="h-4 w-4" />
                                {transaction.credit_cards?.name}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-sm">
                                {transaction.accounts?.name}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(
                                "font-bold",
                                (transaction.type === "income" && !transaction.is_refund) || 
                                (transaction.type === "expense" && transaction.is_refund)
                                  ? "text-income"
                                  : "text-expense"
                              )}
                            >
                              {(transaction.type === "income" && !transaction.is_refund) || 
                               (transaction.type === "expense" && transaction.is_refund) ? "+" : "-"}{" "}
                              R$ {Number(transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </span>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDuplicate(transaction)}
                                title="Duplicar"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              {!transaction.is_refund && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleCreateRefund(transaction)}
                                  title="Criar Extorno"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(transaction)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => {
                                  setDeleteTransactionId(transaction.id);
                                  setShowDeleteDialog(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {hasMore && (
                    <div className="p-4 border-t border-border flex justify-center">
                      <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        className="gap-2"
                      >
                        Carregar mais ({totalCount - transactions.length} restantes)
                      </Button>
                    </div>
                  )}
                </div>

                {/* Mobile Card List */}
                <div className="block md:hidden space-y-2 overflow-hidden">
                  {filteredTransactions.map((transaction) => {
                    const isIncome = (transaction.type === "income" && !transaction.is_refund) || 
                                     (transaction.type === "expense" && transaction.is_refund);
                    const category = categories.find(c => c.id === transaction.category_id);
                    
                    return (
                      <div
                        key={transaction.id}
                        onClick={() => handleTransactionClick(transaction)}
                        className={cn(
                          "flex items-center gap-3 p-3 bg-card rounded-lg border border-border active:bg-muted/50 w-full",
                          transaction.installment_group_id && "border-l-2 border-l-primary"
                        )}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                          style={{ backgroundColor: category?.color ? `${category.color}20` : '#6B728020' }}
                        >
                          {category?.icon || "📦"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{transaction.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateBR(transaction.date)}
                            {transaction.total_installments && transaction.total_installments > 1 && (
                              <span className="text-primary"> • {transaction.installment_number}/{transaction.total_installments}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("font-semibold text-sm", isIncome ? "text-income" : "text-expense")}>
                            {isIncome ? "+" : "-"} R$ {Number(transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                          {transaction.is_corporate_expense && (
                            <span className="text-[10px] text-muted-foreground">Empresa</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {hasMore && (
                    <Button
                      variant="outline"
                      onClick={handleLoadMore}
                      className="w-full gap-2"
                    >
                      Carregar mais ({totalCount - transactions.length} restantes)
                    </Button>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Sidebar Summary */}
      <div className="hidden xl:block w-72 space-y-4">
        <div className="sticky top-24 space-y-4">
          {/* Current Balance */}
          <div className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg gradient-balance flex items-center justify-center">
                <Wallet className="h-5 w-5 text-balance-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo Atual</p>
                <p className="text-lg font-bold text-foreground">
                  R$ {totalBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Income */}
          <div className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg gradient-income flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-income-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {activeFiltersCount > 0 || searchQuery
                    ? "Receitas (filtradas)"
                    : showAll 
                      ? "Receitas (Página)" 
                      : activeTab === "credit" 
                        ? "Receitas (Cartão)" 
                        : "Receitas (Conta)"}
                </p>
                <p className="text-lg font-bold text-income">
                  R$ {tabTotalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg gradient-expense flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-expense-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {activeFiltersCount > 0 || searchQuery
                    ? "Despesas (filtradas)"
                    : showAll 
                      ? "Despesas (Página)" 
                      : activeTab === "credit" 
                        ? "Despesas (Cartão)" 
                        : "Despesas (Conta)"}
                </p>
                <p className="text-lg font-bold text-expense">
                  R$ {tabTotalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Total Count when showing all */}
          {showAll && (
            <div className="bg-card rounded-xl border border-border p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <List className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de Transações</p>
                  <p className="text-lg font-bold text-foreground">{totalCount}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <TransactionModal 
        open={isModalOpen} 
        onOpenChange={handleModalClose} 
        transaction={editingTransaction}
        duplicateFrom={duplicatingTransaction}
        refundFrom={refundingTransaction}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transações?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedTransactions.length} transação{selectedTransactions.length > 1 ? "ões" : ""}.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Installment Details Sheet */}
      <InstallmentDetailsSheet
        open={!!selectedInstallmentGroupId}
        onOpenChange={(open) => !open && setSelectedInstallmentGroupId(null)}
        groupId={selectedInstallmentGroupId}
        onEditTransaction={handleEditInstallment}
      />

      {/* Filters Modal */}
      <TransactionFiltersModal
        open={showFiltersModal}
        onOpenChange={setShowFiltersModal}
        filters={filters}
        onApplyFilters={setFilters}
        activeTab={activeTab}
      />

      {/* Delete Single Transaction Dialog */}
      <AlertDialog open={!!deleteTransactionId} onOpenChange={(open) => !open && setDeleteTransactionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTransactionId) deleteTransaction.mutate(deleteTransactionId);
                setDeleteTransactionId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
