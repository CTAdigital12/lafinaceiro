import { Plus, Target, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  planned: number;
  spent: number;
  color: string;
}

const budgetCategories: BudgetCategory[] = [
  { id: "1", name: "Moradia", icon: "🏠", planned: 1800, spent: 1500, color: "bg-blue-500" },
  { id: "2", name: "Alimentação", icon: "🍔", planned: 1000, spent: 850, color: "bg-green-500" },
  { id: "3", name: "Transporte", icon: "🚗", planned: 500, spent: 620, color: "bg-yellow-500" },
  { id: "4", name: "Lazer", icon: "🎬", planned: 400, spent: 380, color: "bg-purple-500" },
  { id: "5", name: "Saúde", icon: "💊", planned: 300, spent: 200, color: "bg-pink-500" },
  { id: "6", name: "Educação", icon: "📚", planned: 500, spent: 500, color: "bg-indigo-500" },
  { id: "7", name: "Vestuário", icon: "👕", planned: 300, spent: 450, color: "bg-orange-500" },
  { id: "8", name: "Outros", icon: "📦", planned: 200, spent: 150, color: "bg-gray-500" },
];

function BudgetCard({ category }: { category: BudgetCategory }) {
  const percentage = (category.spent / category.planned) * 100;
  const isOverBudget = category.spent > category.planned;
  const remaining = category.planned - category.spent;

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-card hover:shadow-card-hover transition-all duration-300 animate-scale-in">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-xl">
            {category.icon}
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{category.name}</h3>
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
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Gasto</span>
          <span className={cn("font-semibold", isOverBudget ? "text-expense" : "text-foreground")}>
            R$ {category.spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <Progress
          value={Math.min(percentage, 100)}
          className={cn(
            "h-3",
            isOverBudget
              ? "[&>div]:bg-expense"
              : percentage > 80
              ? "[&>div]:bg-chart-4"
              : "[&>div]:bg-income"
          )}
        />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Planejado</span>
          <span className="font-medium text-foreground">
            R$ {category.planned.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Progresso</span>
            <span
              className={cn(
                "text-sm font-bold",
                isOverBudget ? "text-expense" : percentage > 80 ? "text-chart-4" : "text-income"
              )}
            >
              {percentage.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Planning() {
  const totalPlanned = budgetCategories.reduce((sum, cat) => sum + cat.planned, 0);
  const totalSpent = budgetCategories.reduce((sum, cat) => sum + cat.spent, 0);
  const totalRemaining = totalPlanned - totalSpent;
  const totalPercentage = (totalSpent / totalPlanned) * 100;
  const categoriesOverBudget = budgetCategories.filter((cat) => cat.spent > cat.planned).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planejamento Mensal</h1>
          <p className="text-muted-foreground">Defina e acompanhe seus orçamentos</p>
        </div>
        <Button className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Nova Meta
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-balance flex items-center justify-center">
              <Target className="h-5 w-5 text-balance-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orçamento Total</p>
              <p className="text-lg font-bold text-foreground">
                R$ {totalPlanned.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg gradient-expense flex items-center justify-center">
              <TrendingDown className="h-5 w-5 text-expense-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Gasto</p>
              <p className="text-lg font-bold text-foreground">
                R$ {totalSpent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                totalRemaining >= 0 ? "gradient-income" : "gradient-expense"
              )}
            >
              <Target className={cn("h-5 w-5", totalRemaining >= 0 ? "text-income-foreground" : "text-expense-foreground")} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {totalRemaining >= 0 ? "Disponível" : "Excedido"}
              </p>
              <p className={cn("text-lg font-bold", totalRemaining >= 0 ? "text-income" : "text-expense")}>
                R$ {Math.abs(totalRemaining).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                categoriesOverBudget > 0 ? "bg-expense/10" : "bg-income/10"
              )}
            >
              {categoriesOverBudget > 0 ? (
                <AlertTriangle className="h-5 w-5 text-expense" />
              ) : (
                <CheckCircle className="h-5 w-5 text-income" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Categorias Excedidas</p>
              <p className={cn("text-lg font-bold", categoriesOverBudget > 0 ? "text-expense" : "text-income")}>
                {categoriesOverBudget} de {budgetCategories.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="bg-card rounded-xl border border-border p-5 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Progresso Geral do Mês</h3>
          <span
            className={cn(
              "text-2xl font-bold",
              totalPercentage > 100 ? "text-expense" : totalPercentage > 80 ? "text-chart-4" : "text-income"
            )}
          >
            {totalPercentage.toFixed(0)}%
          </span>
        </div>
        <Progress
          value={Math.min(totalPercentage, 100)}
          className={cn(
            "h-4",
            totalPercentage > 100
              ? "[&>div]:bg-expense"
              : totalPercentage > 80
              ? "[&>div]:bg-chart-4"
              : "[&>div]:bg-income"
          )}
        />
      </div>

      {/* Budget Categories Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {budgetCategories.map((category) => (
          <BudgetCard key={category.id} category={category} />
        ))}
      </div>
    </div>
  );
}
