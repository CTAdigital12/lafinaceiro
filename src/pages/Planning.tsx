import React, { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Target, TrendingDown, AlertTriangle, CheckCircle, Copy, ChevronLeft, ChevronRight, Loader2, Trash2, Pencil, CornerDownRight, ChevronDown, LineChart, Info, ChevronsUpDown, MoreVertical, List } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Transaction } from "@/hooks/useTransactions";
import { TransactionModal } from "@/components/modals/TransactionModal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useBudgets, Budget } from "@/hooks/useBudgets";
import { useTransactions } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { useDate } from "@/contexts/DateContext";
import { NewBudgetModal } from "@/components/modals/NewBudgetModal";
import { EditBudgetModal } from "@/components/modals/EditBudgetModal";
import { BudgetEvolutionChart } from "@/components/dashboard/BudgetEvolutionChart";
import { AddSubcategoryModal } from "@/components/modals/AddSubcategoryModal";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { Currency } from "@/components/ui/currency";
import {
  buildHierarchicalBudgets,
  type HierarchicalBudget,
} from "@/lib/buildHierarchicalBudgets";

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function Planning() {
  const { month, year, setCurrentDate } = useDate();
  const fmt = useFormatCurrency();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showChart, setShowChart] = useState(false);
  const [addSubcategoryModalOpen, setAddSubcategoryModalOpen] = useState(false);
  const [selectedParentCategory, setSelectedParentCategory] = useState<{ id: string; name: string; icon: string; color: string } | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);

  const { categories } = useCategories();

  const { budgets, isLoading, totalPlanned, deleteBudget, copyFromPreviousMonth } = useBudgets(month, year);
  const { transactions } = useTransactions(month, year, { loadedCount: 1000, useHybridDateFilter: true });

  // IDs of categories that already have a budget this month
  const existingBudgetCategoryIds = useMemo(() => {
    return budgets.map(b => b.category_id).filter(Boolean) as string[];
  }, [budgets]);

  // Calculate spent per category (excluding corporate expenses, refunds, and reimbursable expenses)
  // Also aggregates subcategory spending into parent categories
  const spentByCategory = useMemo(() => {
    const result: Record<string, number> = {};
    
    transactions
      .filter((t) => t.type === "expense" && !t.is_corporate_expense && !t.is_refund && !t.is_reimbursable && !t.is_card_payment)
      .forEach((t) => {
        const catId = t.category_id || "uncategorized";
        result[catId] = (result[catId] || 0) + Number(t.amount);
        
        // If the category is a subcategory, also add to the parent's total
        const category = categories.find(c => c.id === catId);
        if (category?.parent_id) {
          result[category.parent_id] = (result[category.parent_id] || 0) + Number(t.amount);
        }
      });
      
    return result;
  }, [transactions, categories]);

  // Build hierarchical structure (extracted to a pure helper for unit testing
  // and to fix Bug 4: orphan child budgets now get a synthesized virtual parent
  // so they remain visible when the parent category has no budget of its own).
  const hierarchicalBudgets = useMemo(
    () => buildHierarchicalBudgets(budgets, spentByCategory, categories),
    [budgets, spentByCategory, categories],
  );

  // Calculate total spent from transactions directly (not from spentByCategory which has duplicates)
  const totalSpent = useMemo(() => {
    return transactions
      .filter((t) => t.type === "expense" && !t.is_corporate_expense && !t.is_refund && !t.is_reimbursable && !t.is_card_payment)
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [transactions]);
  
  const totalRemaining = totalPlanned - totalSpent;
  const totalPercentage = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;
  const categoriesOverBudget = budgets.filter((b) => (spentByCategory[b.category_id || ""] || 0) > Number(b.planned_amount)).length;

  // Uncategorized transactions
  const uncategorizedTransactions = useMemo(() => {
    return transactions.filter(
      (t) => 
        t.type === "expense" && 
        !t.category_id && 
        !t.is_corporate_expense && 
        !t.is_refund && 
        !t.is_reimbursable &&
        !t.is_card_payment
    );
  }, [transactions]);

  const uncategorizedTotal = useMemo(() => {
    return uncategorizedTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
  }, [uncategorizedTransactions]);

  const goToPreviousMonth = () => {
    const newDate = new Date(year, month - 2, 1);
    setCurrentDate(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(year, month, 1);
    setCurrentDate(newDate);
  };

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());

  const parentCategoriesWithChildren = useMemo(() => {
    return hierarchicalBudgets.filter(b => b.children.length > 0).map(b => b.categories?.id).filter(Boolean) as string[];
  }, [hierarchicalBudgets]);

  // Initialize all parent categories as collapsed on first load
  const hasInitializedCollapse = useRef(false);
  useEffect(() => {
    if (!hasInitializedCollapse.current && parentCategoriesWithChildren.length > 0) {
      setCollapsedCategories(new Set(parentCategoriesWithChildren));
      hasInitializedCollapse.current = true;
    }
  }, [parentCategoriesWithChildren]);

  const toggleTransactions = (categoryId: string) => {
    setExpandedTransactions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Get transactions for a specific category (for parent, include subcategories)
  const getTransactionsForCategory = (categoryId: string, isParent: boolean) => {
    const childCategoryIds = isParent 
      ? categories.filter(c => c.parent_id === categoryId).map(c => c.id)
      : [];
    
    return transactions.filter(t => 
      t.type === "expense" && !t.is_corporate_expense && !t.is_refund && !t.is_reimbursable && !t.is_card_payment &&
      (t.category_id === categoryId || (isParent && childCategoryIds.includes(t.category_id || "")))
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const allCollapsed = parentCategoriesWithChildren.length > 0 && 
    parentCategoriesWithChildren.every(id => collapsedCategories.has(id));

  const toggleAllCategories = () => {
    if (allCollapsed) {
      // Expand all
      setCollapsedCategories(new Set());
    } else {
      // Collapse all
      setCollapsedCategories(new Set(parentCategoriesWithChildren));
    }
  };

  const handleEditBudget = (budget: Budget) => {
    setEditingBudget(budget);
    setEditModalOpen(true);
  };

  const handleAddSubcategory = (budget: HierarchicalBudget) => {
    const category = budget.categories;
    if (category) {
      setSelectedParentCategory({
        id: category.id,
        name: category.name,
        icon: category.icon || "📦",
        color: category.color || "#3B82F6",
      });
      setAddSubcategoryModalOpen(true);
    }
  };

  const renderBudgetRow = (budget: HierarchicalBudget, isChild: boolean = false) => {
    const planned = budget.isParent ? budget.totalPlanned : Number(budget.planned_amount);
    const spent = budget.isParent ? budget.totalSpent : (spentByCategory[budget.category_id || ""] || 0);
    const remaining = planned - spent;
    const percentage = planned > 0 ? (spent / planned) * 100 : 0;
    const isOverBudget = spent > planned;
    const categoryId = budget.categories?.id || "";
    const isCollapsed = collapsedCategories.has(categoryId);
    const hasChildren = budget.children.length > 0;
    const hasUnbudgetedSubcategories = budget.unbudgetedSubcategorySpent > 0;

    return (
      <TableRow key={budget.id} className={cn(isChild && "bg-muted/30")}>
        <TableCell>
          <div className={cn("flex items-center gap-3", isChild && "pl-6")}>
            {isChild ? (
              <CornerDownRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <>
                {hasChildren && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 p-0"
                    onClick={() => toggleCategory(categoryId)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <div 
                  className={cn("h-9 w-9 rounded-lg flex items-center justify-center text-lg", !hasChildren && "ml-6")}
                  style={{ backgroundColor: `${budget.categories?.color}20` }}
                >
                  {budget.categories?.icon || "📦"}
                </div>
              </>
            )}
            <div className="flex flex-col">
              <span className={cn("font-medium", isChild && "text-sm")}>
                {budget.categories?.name || "Categoria"}
              </span>
              {hasUnbudgetedSubcategories && (
                <div className="flex items-center gap-1 text-xs text-chart-4">
                  <Info className="h-3 w-3" />
                  <span>
                    {fmt(budget.unbudgetedSubcategorySpent)} em: {budget.subcategoriesWithoutBudget.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right font-medium">
          {fmt(planned)}
        </TableCell>
        <TableCell className="text-right text-muted-foreground">
          {fmt(0)}
        </TableCell>
        <TableCell className="text-right text-muted-foreground">
          {fmt(spent)}
        </TableCell>
        <TableCell className="text-right font-medium">
          {fmt(spent)}
        </TableCell>
        <TableCell>
          <div className="space-y-1 min-w-[180px]">
            <div className="flex items-center justify-between">
              {isOverBudget ? (
                <span className="text-expense text-sm font-medium">
                  Excederam {fmt(Math.abs(remaining))}
                </span>
              ) : (
                <span className="text-income text-sm font-medium">
                  Restam {fmt(remaining)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Progress
                value={Math.min(percentage, 100)}
                className={cn(
                  "h-2 flex-1",
                  isOverBudget ? "[&>div]:bg-expense" : percentage > 80 ? "[&>div]:bg-chart-4" : "[&>div]:bg-income"
                )}
              />
              <span className={cn(
                "text-xs font-medium min-w-[50px] text-right",
                isOverBudget ? "text-expense" : percentage > 80 ? "text-chart-4" : "text-income"
              )}>
                {percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 text-muted-foreground hover:text-primary", expandedTransactions.has(categoryId) && "text-primary")}
              onClick={() => toggleTransactions(categoryId)}
              title="Ver lançamentos"
            >
              <List className="h-4 w-4" />
            </Button>
            {!isChild && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={() => handleAddSubcategory(budget)}
                title="Adicionar subcategoria"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => handleEditBudget(budget)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-expense"
              onClick={() => setDeleteBudgetId(budget.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const renderTransactionRows = (categoryId: string, isParent: boolean) => {
    if (!expandedTransactions.has(categoryId)) return null;
    const txns = getTransactionsForCategory(categoryId, isParent);
    if (txns.length === 0) {
      return (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-3">
            Nenhum lançamento nesta categoria
          </TableCell>
        </TableRow>
      );
    }
    return txns.map(t => (
      <TableRow 
        key={`txn-${t.id}`} 
        className="bg-muted/20 cursor-pointer hover:bg-muted/40"
        onClick={() => { setEditingTransaction(t); setTransactionModalOpen(true); }}
      >
        <TableCell className="pl-12 text-sm text-muted-foreground">
          {new Date(t.date).toLocaleDateString("pt-BR")}
        </TableCell>
        <TableCell colSpan={3} className="text-sm">{t.description}</TableCell>
        <TableCell className="text-right text-sm font-medium text-expense">
          {fmt(Number(t.amount))}
        </TableCell>
        <TableCell colSpan={2} />
      </TableRow>
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planejamento Mensal</h1>
          <p className="text-muted-foreground">Defina e acompanhe seus orçamentos</p>
        </div>
        {/* Desktop Buttons */}
        <div className="hidden sm:flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={() => setShowChart(!showChart)}
          >
            <LineChart className="h-4 w-4" />
            {showChart ? "Ocultar Gráfico" : "Ver Evolução"}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => copyFromPreviousMonth.mutate()} disabled={copyFromPreviousMonth.isPending}>
            {copyFromPreviousMonth.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Copiar do Mês Anterior
          </Button>
          <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova Meta
          </Button>
        </div>
        {/* Mobile Buttons */}
        <div className="flex sm:hidden gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setShowChart(!showChart)}
          >
            <LineChart className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => copyFromPreviousMonth.mutate()} disabled={copyFromPreviousMonth.isPending}>
            {copyFromPreviousMonth.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button size="icon" className="bg-primary hover:bg-primary/90" onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Evolution Chart */}
      {showChart && (
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <h3 className="text-lg font-semibold text-foreground mb-4">Evolução do Orçamento - {year}</h3>
          <BudgetEvolutionChart currentYear={year} />
        </div>
      )}

      {/* Month Selector */}
      <div className="flex items-center justify-center gap-4 bg-card rounded-xl border border-border p-4 shadow-card">
        <Button variant="ghost" size="icon" onClick={goToPreviousMonth}><ChevronLeft className="h-5 w-5" /></Button>
        <span className="text-lg font-semibold text-foreground min-w-[180px] text-center">{months[month - 1]} {year}</span>
        <Button variant="ghost" size="icon" onClick={goToNextMonth}><ChevronRight className="h-5 w-5" /></Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-balance flex items-center justify-center"><Target className="h-5 w-5 text-balance-foreground" /></div>
            <div><p className="text-xs text-muted-foreground">Orçamento Total</p><Currency value={totalPlanned} className="text-lg font-bold text-foreground block" /></div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-expense flex items-center justify-center"><TrendingDown className="h-5 w-5 text-expense-foreground" /></div>
            <div><p className="text-xs text-muted-foreground">Total Gasto</p><Currency value={totalSpent} className="text-lg font-bold text-foreground block" /></div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", totalRemaining >= 0 ? "gradient-income" : "gradient-expense")}><Target className={cn("h-5 w-5", totalRemaining >= 0 ? "text-income-foreground" : "text-expense-foreground")} /></div>
            <div><p className="text-xs text-muted-foreground">{totalRemaining >= 0 ? "Disponível" : "Excedido"}</p><Currency value={Math.abs(totalRemaining)} className={cn("text-lg font-bold block", totalRemaining >= 0 ? "text-income" : "text-expense")} /></div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", categoriesOverBudget > 0 ? "bg-expense/10" : "bg-income/10")}>{categoriesOverBudget > 0 ? <AlertTriangle className="h-5 w-5 text-expense" /> : <CheckCircle className="h-5 w-5 text-income" />}</div>
            <div><p className="text-xs text-muted-foreground">Categorias Excedidas</p><p className={cn("text-lg font-bold", categoriesOverBudget > 0 ? "text-expense" : "text-income")}>{categoriesOverBudget} de {budgets.length}</p></div>
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      {budgets.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Progresso Geral do Mês</h3>
            <span className={cn("text-2xl font-bold", totalPercentage > 100 ? "text-expense" : totalPercentage > 80 ? "text-chart-4" : "text-income")}>{totalPercentage.toFixed(0)}%</span>
          </div>
          <Progress value={Math.min(totalPercentage, 100)} className={cn("h-4", totalPercentage > 100 ? "[&>div]:bg-expense" : totalPercentage > 80 ? "[&>div]:bg-chart-4" : "[&>div]:bg-income")} />
        </div>
      )}

      {/* Budget Section */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="h-8 w-8 animate-spin text-balance" /></div>
      ) : budgets.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-card">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma meta para {months[month - 1]}</h3>
          <p className="text-muted-foreground mb-4">Crie metas ou copie do mês anterior</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button variant="outline" onClick={() => copyFromPreviousMonth.mutate()} disabled={copyFromPreviousMonth.isPending}><Copy className="h-4 w-4 mr-2" />Copiar do Mês Anterior</Button>
            <Button onClick={() => setIsModalOpen(true)}><Plus className="h-4 w-4 mr-2" />Nova Meta</Button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-card rounded-xl border border-border shadow-card overflow-hidden">
            {parentCategoriesWithChildren.length > 0 && (
              <div className="flex justify-end p-2 border-b border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={toggleAllCategories}
                >
                  <ChevronsUpDown className="h-4 w-4" />
                  {allCollapsed ? "Expandir Todas" : "Colapsar Todas"}
                </Button>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Categoria</TableHead>
                  <TableHead className="text-right">Meta planejada</TableHead>
                  <TableHead className="text-right">Despesas pagas</TableHead>
                  <TableHead className="text-right">Despesas previstas</TableHead>
                  <TableHead className="text-right">Total gasto</TableHead>
                  <TableHead className="min-w-[200px]">Progresso</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hierarchicalBudgets.map((parentBudget) => {
                  const categoryId = parentBudget.categories?.id || "";
                  const isCollapsed = collapsedCategories.has(categoryId);
                  
                  return (
                    <React.Fragment key={parentBudget.id}>
                      {renderBudgetRow(parentBudget, false)}
                      {renderTransactionRows(categoryId, parentBudget.children.length > 0)}
                      {!isCollapsed && parentBudget.children.map((childBudget) => {
                        const childCatId = childBudget.categories?.id || "";
                        return (
                          <React.Fragment key={childBudget.id}>
                            {renderBudgetRow(childBudget, true)}
                            {renderTransactionRows(childCatId, false)}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-3">
            {parentCategoriesWithChildren.length > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  onClick={toggleAllCategories}
                >
                  <ChevronsUpDown className="h-4 w-4" />
                  {allCollapsed ? "Expandir Todas" : "Colapsar Todas"}
                </Button>
              </div>
            )}
            {hierarchicalBudgets.map((parentBudget) => {
              const categoryId = parentBudget.categories?.id || "";
              const isCollapsed = collapsedCategories.has(categoryId);
              const planned = parentBudget.isParent ? parentBudget.totalPlanned : Number(parentBudget.planned_amount);
              const spent = parentBudget.isParent ? parentBudget.totalSpent : (spentByCategory[parentBudget.category_id || ""] || 0);
              const remaining = planned - spent;
              const percentage = planned > 0 ? (spent / planned) * 100 : 0;
              const isOverBudget = spent > planned;
              const hasChildren = parentBudget.children.length > 0;
              const hasUnbudgetedSubcategories = parentBudget.unbudgetedSubcategorySpent > 0;

              return (
                <div key={parentBudget.id} className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                  {/* Parent Card */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {hasChildren && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 p-0 shrink-0"
                            onClick={() => toggleCategory(categoryId)}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <div 
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                          style={{ backgroundColor: `${parentBudget.categories?.color}20` }}
                        >
                          {parentBudget.categories?.icon || "📦"}
                        </div>
                        <span className="font-semibold text-foreground truncate">
                          {parentBudget.categories?.name || "Categoria"}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => toggleTransactions(categoryId)}>
                            <List className="h-4 w-4 mr-2" />
                            {expandedTransactions.has(categoryId) ? "Ocultar lançamentos" : "Ver lançamentos"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAddSubcategory(parentBudget)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar subcategoria
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditBudget(parentBudget)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar meta
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeleteBudgetId(parentBudget.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {hasUnbudgetedSubcategories && (
                      <div className="flex items-center gap-1 text-xs text-chart-4 mb-3 ml-11">
                        <Info className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {fmt(parentBudget.unbudgetedSubcategorySpent)} em: {parentBudget.subcategoriesWithoutBudget.join(", ")}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Planejado</p>
                        <p className="font-semibold">{fmt(planned)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Gasto</p>
                        <p className="font-semibold text-expense">{fmt(spent)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={Math.min(percentage, 100)}
                          className={cn(
                            "h-2.5 flex-1",
                            isOverBudget ? "[&>div]:bg-expense" : percentage > 80 ? "[&>div]:bg-chart-4" : "[&>div]:bg-income"
                          )}
                        />
                        <span className={cn(
                          "text-xs font-medium min-w-[45px] text-right",
                          isOverBudget ? "text-expense" : percentage > 80 ? "text-chart-4" : "text-income"
                        )}>
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                      <p className={cn(
                        "text-sm font-medium",
                        isOverBudget ? "text-expense" : "text-income"
                      )}>
                        {isOverBudget
                          ? `Excederam ${fmt(Math.abs(remaining))}`
                          : `Restam ${fmt(remaining)}`
                        }
                      </p>
                    </div>
                  </div>

                  {/* Expanded Transactions for Parent */}
                  {expandedTransactions.has(categoryId) && (() => {
                    const txns = getTransactionsForCategory(categoryId, hasChildren);
                    return (
                      <div className="border-t border-border bg-muted/20 divide-y divide-border">
                        {txns.length === 0 ? (
                          <p className="text-center text-sm text-muted-foreground py-3">Nenhum lançamento nesta categoria</p>
                        ) : txns.map(t => (
                          <div 
                            key={t.id} 
                            className="px-4 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/40"
                            onClick={() => { setEditingTransaction(t); setTransactionModalOpen(true); }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm truncate">{t.description}</p>
                              <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                            </div>
                            <span className="text-sm font-medium text-expense shrink-0">
                              {fmt(Number(t.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Children Cards */}
                  {!isCollapsed && parentBudget.children.length > 0 && (
                    <div className="border-t border-border bg-muted/30">
                      {parentBudget.children.map((childBudget) => {
                        const childPlanned = Number(childBudget.planned_amount);
                        const childSpent = spentByCategory[childBudget.category_id || ""] || 0;
                        const childRemaining = childPlanned - childSpent;
                        const childPercentage = childPlanned > 0 ? (childSpent / childPlanned) * 100 : 0;
                        const childIsOverBudget = childSpent > childPlanned;

                        return (
                          <div key={childBudget.id} className="p-3 border-b border-border last:border-b-0">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <CornerDownRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium truncate">
                                  {childBudget.categories?.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className={cn("h-7 w-7", expandedTransactions.has(childBudget.categories?.id || "") && "text-primary")}
                                  onClick={() => toggleTransactions(childBudget.categories?.id || "")}
                                >
                                  <List className="h-3.5 w-3.5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7"
                                  onClick={() => handleEditBudget(childBudget)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7 text-muted-foreground hover:text-expense"
                                  onClick={() => setDeleteBudgetId(childBudget.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs mb-2">
                              <span className="text-muted-foreground">
                                {fmt(childSpent)} / {fmt(childPlanned)}
                              </span>
                              <span className={cn(
                                "font-medium",
                                childIsOverBudget ? "text-expense" : childPercentage > 80 ? "text-chart-4" : "text-income"
                              )}>
                                {childPercentage.toFixed(0)}%
                              </span>
                            </div>
                            <Progress
                              value={Math.min(childPercentage, 100)}
                              className={cn(
                                "h-1.5",
                                childIsOverBudget ? "[&>div]:bg-expense" : childPercentage > 80 ? "[&>div]:bg-chart-4" : "[&>div]:bg-income"
                              )}
                            />
                            <p className={cn(
                              "text-xs mt-1",
                              childIsOverBudget ? "text-expense" : "text-income"
                            )}>
                              {childIsOverBudget
                                ? `Excedeu ${fmt(Math.abs(childRemaining))}`
                                : `Resta ${fmt(childRemaining)}`
                              }
                            </p>
                            {/* Child Expanded Transactions */}
                            {expandedTransactions.has(childBudget.categories?.id || "") && (() => {
                              const childTxns = getTransactionsForCategory(childBudget.categories?.id || "", false);
                              return (
                                <div className="mt-2 divide-y divide-border rounded-md bg-background/50">
                                  {childTxns.length === 0 ? (
                                    <p className="text-center text-xs text-muted-foreground py-2">Nenhum lançamento</p>
                                  ) : childTxns.map(t => (
                                    <div 
                                      key={t.id} 
                                      className="px-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/40"
                                      onClick={() => { setEditingTransaction(t); setTransactionModalOpen(true); }}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs truncate">{t.description}</p>
                                        <p className="text-[10px] text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                                      </div>
                                      <span className="text-xs font-medium text-expense shrink-0">
                                        {fmt(Number(t.amount))}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Contextual CTA — discoverable way to extend the plan after creation.
              Shown only when there are already budgets, since the empty state
              above already exposes "Nova Meta". */}
          <Button
            type="button"
            variant="outline"
            className="w-full mt-3 border-dashed h-12 text-muted-foreground hover:text-foreground hover:border-solid"
            onClick={() => setIsModalOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar nova categoria ao plano
          </Button>
        </>
      )}

      {/* Uncategorized Expenses */}
      {uncategorizedTransactions.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-chart-4/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Despesas sem categoria</h3>
                <p className="text-sm text-muted-foreground">
                  {uncategorizedTransactions.length} transação(ões) totalizando {fmt(uncategorizedTotal)}
                </p>
              </div>
            </div>
          </div>
          
          {/* Desktop Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uncategorizedTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(transaction.date).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>{transaction.description}</TableCell>
                    <TableCell className="text-right font-medium text-expense">
                      {fmt(Number(transaction.amount))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingTransaction(transaction);
                          setTransactionModalOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Categorizar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-border">
            {uncategorizedTransactions.map((transaction) => (
              <div key={transaction.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{transaction.description}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {new Date(transaction.date).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="font-medium text-expense">
                      {fmt(Number(transaction.amount))}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setEditingTransaction(transaction);
                    setTransactionModalOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <NewBudgetModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        month={month}
        year={year}
        existingBudgetCategoryIds={existingBudgetCategoryIds}
      />
      <EditBudgetModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        budget={editingBudget}
        month={month}
        year={year}
        existingBudgetCategoryIds={existingBudgetCategoryIds}
      />
      <AddSubcategoryModal 
        open={addSubcategoryModalOpen} 
        onOpenChange={setAddSubcategoryModalOpen} 
        parentCategory={selectedParentCategory}
        month={month}
        year={year}
        existingBudgetCategoryIds={existingBudgetCategoryIds}
      />
      <TransactionModal
        open={transactionModalOpen}
        onOpenChange={(open) => {
          setTransactionModalOpen(open);
          if (!open) setEditingTransaction(null);
        }}
        transaction={editingTransaction}
      />

      {/* Delete Budget Confirmation */}
      <AlertDialog open={!!deleteBudgetId} onOpenChange={(open) => !open && setDeleteBudgetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta de orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta meta de orçamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteBudgetId) deleteBudget.mutate(deleteBudgetId);
                setDeleteBudgetId(null);
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
