import { useState } from "react";
import { Plus, Target, TrendingDown, AlertTriangle, CheckCircle, Copy, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useBudgets, Budget } from "@/hooks/useBudgets";
import { useTransactions } from "@/hooks/useTransactions";
import { NewBudgetModal } from "@/components/modals/NewBudgetModal";

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function BudgetCard({ budget, spent, onDelete }: { budget: Budget; spent: number; onDelete: () => void }) {
  const planned = Number(budget.planned_amount);
  const percentage = planned > 0 ? (spent / planned) * 100 : 0;
  const isOverBudget = spent > planned;
  const remaining = planned - spent;

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-card hover:shadow-card-hover transition-all duration-300 animate-scale-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-xl">
            {budget.categories?.icon || "📦"}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{budget.categories?.name || "Categoria"}</h3>
            <p className="text-xs text-muted-foreground">
              {isOverBudget ? (
                <span className="text-expense flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Excedido em R$ {Math.abs(remaining).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              ) : (
                <span className="text-income flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Resta R$ {remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              )}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-expense" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Gasto</span>
          <span className={cn("font-semibold", isOverBudget ? "text-expense" : "text-foreground")}>
            R$ {spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <Progress
          value={Math.min(percentage, 100)}
          className={cn(
            "h-3",
            isOverBudget ? "[&>div]:bg-expense" : percentage > 80 ? "[&>div]:bg-chart-4" : "[&>div]:bg-income"
          )}
        />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Planejado</span>
          <span className="font-medium text-foreground">
            R$ {planned.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Progresso</span>
            <span className={cn("text-sm font-bold", isOverBudget ? "text-expense" : percentage > 80 ? "text-chart-4" : "text-income")}>
              {percentage.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Planning() {
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { budgets, isLoading, totalPlanned, deleteBudget, copyFromPreviousMonth } = useBudgets(month, year);
  const { transactions } = useTransactions(month, year);

  // Calculate spent per category
  const spentByCategory = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => {
      const catId = t.category_id || "uncategorized";
      acc[catId] = (acc[catId] || 0) + Number(t.amount);
      return acc;
    }, {} as Record<string, number>);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planejamento Mensal</h1>
          <p className="text-muted-foreground">Defina e acompanhe seus orçamentos</p>
        </div>
        <div className="flex gap-2">
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

      {/* Budget Categories Grid */}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {budgets.map((budget) => (
            <BudgetCard key={budget.id} budget={budget} spent={spentByCategory[budget.category_id || ""] || 0} onDelete={() => deleteBudget.mutate(budget.id)} />
          ))}
        </div>
      )}

      <NewBudgetModal open={isModalOpen} onOpenChange={setIsModalOpen} month={month} year={year} />
    </div>
  );
}
