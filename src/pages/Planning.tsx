import React, { useState, useMemo } from "react";
import { Plus, Target, TrendingDown, AlertTriangle, CheckCircle, Copy, ChevronLeft, ChevronRight, Loader2, Trash2, Pencil, CornerDownRight, ChevronDown, ChevronUp, LineChart } from "lucide-react";
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
import { NewBudgetModal } from "@/components/modals/NewBudgetModal";
import { EditBudgetModal } from "@/components/modals/EditBudgetModal";
import { BudgetEvolutionChart } from "@/components/dashboard/BudgetEvolutionChart";

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface HierarchicalBudget extends Budget {
  children: HierarchicalBudget[];
  totalPlanned: number;
  totalSpent: number;
  isParent: boolean;
}

export default function Planning() {
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showChart, setShowChart] = useState(false);

  const { budgets, isLoading, totalPlanned, deleteBudget, copyFromPreviousMonth } = useBudgets(month, year);
  const { transactions } = useTransactions(month, year);

  // Calculate spent per category (excluding corporate expenses)
  const spentByCategory = useMemo(() => {
    return transactions
      .filter((t) => t.type === "expense" && !t.is_corporate_expense)
      .reduce((acc, t) => {
        const catId = t.category_id || "uncategorized";
        acc[catId] = (acc[catId] || 0) + Number(t.amount);
        return acc;
      }, {} as Record<string, number>);
  }, [transactions]);

  // Build hierarchical structure
  const hierarchicalBudgets = useMemo(() => {
    const parentBudgets: HierarchicalBudget[] = [];
    const childBudgetsMap: Record<string, HierarchicalBudget[]> = {};

    budgets.forEach((budget) => {
      const parentId = budget.categories?.parent_id;
      const spent = spentByCategory[budget.category_id || ""] || 0;
      
      const hierarchicalBudget: HierarchicalBudget = {
        ...budget,
        children: [],
        totalPlanned: Number(budget.planned_amount),
        totalSpent: spent,
        isParent: false,
      };

      if (parentId) {
        if (!childBudgetsMap[parentId]) {
          childBudgetsMap[parentId] = [];
        }
        childBudgetsMap[parentId].push(hierarchicalBudget);
      } else {
        hierarchicalBudget.isParent = true;
        parentBudgets.push(hierarchicalBudget);
      }
    });

    parentBudgets.forEach((parent) => {
      const categoryId = parent.categories?.id;
      if (categoryId && childBudgetsMap[categoryId]) {
        parent.children = childBudgetsMap[categoryId].sort((a, b) => 
          (a.categories?.name || "").localeCompare(b.categories?.name || "")
        );
        
        // Parent category shows ONLY the sum of children, not its own budget + children
        const childrenPlanned = parent.children.reduce((sum, child) => sum + child.totalPlanned, 0);
        const childrenSpent = parent.children.reduce((sum, child) => sum + child.totalSpent, 0);
        
        parent.totalPlanned = childrenPlanned;
        parent.totalSpent = childrenSpent;
      }
    });

    return parentBudgets.sort((a, b) => 
      (a.categories?.name || "").localeCompare(b.categories?.name || "")
    );
  }, [budgets, spentByCategory]);

  const totalSpent = Object.values(spentByCategory).reduce((sum, val) => sum + val, 0);
  const totalRemaining = totalPlanned - totalSpent;
  const totalPercentage = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;
  const categoriesOverBudget = budgets.filter((b) => (spentByCategory[b.category_id || ""] || 0) > Number(b.planned_amount)).length;

  const goToPreviousMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else { setMonth(month - 1); }
  };

  const goToNextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else { setMonth(month + 1); }
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

  const handleEditBudget = (budget: Budget) => {
    setEditingBudget(budget);
    setEditModalOpen(true);
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
            <span className={cn("font-medium", isChild && "text-sm")}>
              {budget.categories?.name || "Categoria"}
            </span>
          </div>
        </TableCell>
        <TableCell className="text-right font-medium">
          R$ {planned.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </TableCell>
        <TableCell className="text-right text-muted-foreground">
          R$ 0,00
        </TableCell>
        <TableCell className="text-right text-muted-foreground">
          R$ {spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </TableCell>
        <TableCell className="text-right font-medium">
          R$ {spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </TableCell>
        <TableCell>
          <div className="space-y-1 min-w-[180px]">
            <div className="flex items-center justify-between">
              {isOverBudget ? (
                <span className="text-expense text-sm font-medium">
                  Excederam R$ {Math.abs(remaining).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-income text-sm font-medium">
                  Restam R$ {remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => handleEditBudget(budget)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-expense"
              onClick={() => deleteBudget.mutate(budget.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planejamento Mensal</h1>
          <p className="text-muted-foreground">Defina e acompanhe seus orçamentos</p>
        </div>
        <div className="flex gap-2">
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-balance flex items-center justify-center"><Target className="h-5 w-5 text-balance-foreground" /></div>
            <div><p className="text-xs text-muted-foreground">Orçamento Total</p><p className="text-lg font-bold text-foreground">R$ {totalPlanned.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-expense flex items-center justify-center"><TrendingDown className="h-5 w-5 text-expense-foreground" /></div>
            <div><p className="text-xs text-muted-foreground">Total Gasto</p><p className="text-lg font-bold text-foreground">R$ {totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", totalRemaining >= 0 ? "gradient-income" : "gradient-expense")}><Target className={cn("h-5 w-5", totalRemaining >= 0 ? "text-income-foreground" : "text-expense-foreground")} /></div>
            <div><p className="text-xs text-muted-foreground">{totalRemaining >= 0 ? "Disponível" : "Excedido"}</p><p className={cn("text-lg font-bold", totalRemaining >= 0 ? "text-income" : "text-expense")}>R$ {Math.abs(totalRemaining).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div>
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

      {/* Budget Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="h-8 w-8 animate-spin text-balance" /></div>
      ) : budgets.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-card">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma meta para {months[month - 1]}</h3>
          <p className="text-muted-foreground mb-4">Crie metas ou copie do mês anterior</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => copyFromPreviousMonth.mutate()} disabled={copyFromPreviousMonth.isPending}><Copy className="h-4 w-4 mr-2" />Copiar do Mês Anterior</Button>
            <Button onClick={() => setIsModalOpen(true)}><Plus className="h-4 w-4 mr-2" />Nova Meta</Button>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
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
                    {!isCollapsed && parentBudget.children.map((childBudget) => 
                      renderBudgetRow(childBudget, true)
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <NewBudgetModal open={isModalOpen} onOpenChange={setIsModalOpen} month={month} year={year} />
      <EditBudgetModal open={editModalOpen} onOpenChange={setEditModalOpen} budget={editingBudget} month={month} year={year} />
    </div>
  );
}
