import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
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
import { useCategories } from "@/hooks/useCategories";
import { TransactionModal } from "@/components/modals/TransactionModal";
import { TransactionFiltersModal, TransactionFilters } from "@/components/modals/TransactionFiltersModal";
import { CategorySelector } from "@/components/CategorySelector";
import { InstallmentDetailsSheet } from "@/components/InstallmentDetailsSheet";
import { useDate } from "@/contexts/DateContext";
import { useToast } from "@/hooks/use-toast";

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
    pageSize, 
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
    (filters.installmentFilter !== "all" ? 1 : 0);

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

  // Handle category update inline
  const handleCategoryChange = (transactionId: string, categoryId: string) => {
    updateTransaction.mutate({ id: transactionId, category_id: categoryId });
  };

  // Calculate totals based on filtered transactions (respects all filters and refunds)
  const tabTotalIncome = filteredTransactions
    .filter((t) => 
      (t.type === "income" && !t.is_refund) || 
      (t.type === "expense" && t.is_refund)
    )
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const tabTotalExpense = filteredTransactions
    .filter((t) => 
      (t.type === "expense" && !t.is_refund) ||
      (t.type === "income" && t.is_refund)
    )
    .reduce((sum, t) => sum + Number(t.amount), 0);

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
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 space-y-6">
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
                      <select
                        className="bg-transparent text-sm border-none focus:ring-0 outline-none"
                        onChange={(e) => {
                          if (e.target.value) handleBulkCategoryUpdate(e.target.value);
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Selecionar categoria...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.icon} {cat.name}
                          </option>
                        ))}
                      </select>
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
              <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
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
                            {/* Installment indicator in status column */}
                            {transaction.total_installments && transaction.total_installments > 1 && (
                              <Layers className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateBR(transaction.date)}
                        </TableCell>
                        {activeTab === "credit" && (
                          <TableCell className="text-primary font-medium">
                            {formatDateBR(transaction.due_date)}
                          </TableCell>
                        )}
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {transaction.description}
                            {/* Installment Badge */}
                            {transaction.total_installments && transaction.total_installments > 1 && (
                              <Badge 
                                variant="outline" 
                                className="text-xs gap-1 bg-primary/10 text-primary border-primary/30 cursor-pointer hover:bg-primary/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (transaction.installment_group_id) {
                                    setSelectedInstallmentGroupId(transaction.installment_group_id);
                                  }
                                }}
                              >
                                <Layers className="h-3 w-3" />
                                {transaction.installment_number}/{transaction.total_installments}
                              </Badge>
                            )}
                            {transaction.is_refund && (
                              <Badge variant="outline" className="text-xs gap-1 bg-orange-500/10 text-orange-600 border-orange-500/30">
                                <RotateCcw className="h-3 w-3" />
                                Extorno
                              </Badge>
                            )}
                            {transaction.is_corporate_expense && (
                              <Badge variant="outline" className="text-xs gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30">
                                <Building className="h-3 w-3" />
                                Empresarial
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <CategorySelector
                            value={transaction.category_id}
                            type={transaction.type}
                            currentCategory={transaction.categories}
                            onSelect={(categoryId) => handleCategoryChange(transaction.id, categoryId)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {activeTab === "credit" 
                            ? (transaction.credit_cards 
                                ? `${transaction.credit_cards.name} •${transaction.credit_cards.last_digits}` 
                                : "-")
                            : (transaction.accounts?.name || "-")
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "font-semibold",
                              transaction.is_refund
                                ? (transaction.type === "expense" ? "text-income" : "text-expense")
                                : (transaction.type === "income" ? "text-income" : "text-expense")
                            )}
                          >
                            {transaction.is_refund
                              ? (transaction.type === "expense" ? "+" : "-")
                              : (transaction.type === "income" ? "+" : "-")
                            } R${" "}
                            {Number(transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => handleDuplicate(transaction)}
                              title="Duplicar transação"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            {!transaction.is_refund && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-orange-600 hover:text-orange-600"
                                onClick={() => handleCreateRefund(transaction)}
                                title="Criar extorno"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => handleEdit(transaction)}
                              title="Editar transação"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-expense hover:text-expense"
                              onClick={() => deleteTransaction.mutate(transaction.id)}
                              title="Excluir transação"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Empty State */}
                {filteredTransactions.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CalendarDays className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground mb-2">
                      Nenhuma transação encontrada
                    </p>
                    <p className="text-sm text-muted-foreground/70 max-w-md">
                      {showAll 
                        ? "Não há transações que correspondam aos filtros aplicados." 
                        : `Não há transações em ${String(month).padStart(2, "0")}/${year}. Tente selecionar outro mês ou ativar "Todas".`
                      }
                    </p>
                  </div>
                )}

                {/* Load More Button */}
                {hasMore && (
                  <div className="flex items-center justify-center p-4 border-t border-border">
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
      />

      {/* Filters Modal */}
      <TransactionFiltersModal
        open={showFiltersModal}
        onOpenChange={setShowFiltersModal}
        filters={filters}
        onApplyFilters={setFilters}
        activeTab={activeTab}
      />
    </div>
  );
}
