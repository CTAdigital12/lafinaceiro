import { useState, useMemo } from "react";
import { Download, Calendar, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefundReport } from "@/components/reports/RefundReport";
import { useTransactions } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { useDate } from "@/contexts/DateContext";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

interface ExpenseCategory {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

export default function Reports() {
  const { currentDate: contextDate } = useDate();
  const [currentDate, setCurrentDate] = useState(contextDate);

  const { transactions, isLoading: transactionsLoading } = useTransactions(undefined, undefined, {
    showAll: true,
    loadedCount: 10000,
  });

  const { categories, isLoading: categoriesLoading } = useCategories();

  const isLoading = transactionsLoading || categoriesLoading;

  const expenseData = useMemo(() => {
    if (!transactions || !categories) return [];

    const startDate = startOfMonth(currentDate);
    const endDate = endOfMonth(currentDate);

    // Filter transactions for current month
    const monthTransactions = transactions.filter((t) => {
      if (t.type !== "expense") return false;
      if (t.is_refund || t.is_card_payment) return false;
      if (t.is_corporate_expense || t.is_reimbursable) return false;

      // Use hybrid date filter: due_date for credit card, date for others
      const transactionDate = t.credit_card_id && t.due_date 
        ? new Date(t.due_date) 
        : new Date(t.date);
      
      return transactionDate >= startDate && transactionDate <= endDate;
    });

    // Group by category
    const byCategory: Record<string, number> = {};
    monthTransactions.forEach((t) => {
      const catId = t.category_id || "uncategorized";
      byCategory[catId] = (byCategory[catId] || 0) + Number(t.amount);
    });

    // Calculate total
    const total = Object.values(byCategory).reduce((sum, val) => sum + val, 0);

    // Transform to array with name, color, and percentage
    const result: ExpenseCategory[] = Object.entries(byCategory)
      .map(([catId, value]) => {
        const category = categories.find((c) => c.id === catId);
        return {
          name: category?.name || "Sem categoria",
          value,
          color: category?.color || "#6B7280",
          percentage: total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.value - a.value);

    return result;
  }, [transactions, categories, currentDate]);

  const totalExpenses = useMemo(() => {
    return expenseData.reduce((sum, item) => sum + item.value, 0);
  }, [expenseData]);

  const topExpense = expenseData.length > 0 ? expenseData[0] : null;

  const averagePerCategory = expenseData.length > 0 
    ? totalExpenses / expenseData.length 
    : 0;

  const handlePreviousMonth = () => setCurrentDate((prev) => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentDate((prev) => addMonths(prev, 1));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">{item.percentage}%</p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
            <p className="text-muted-foreground">Análise detalhada das suas finanças</p>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[500px] rounded-xl" />
          <Skeleton className="h-[500px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground">Análise detalhada das suas finanças</p>
        </div>
      </div>

      {/* Tabs for different reports */}
      <Tabs defaultValue="expenses" className="space-y-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-max md:w-auto">
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
            <TabsTrigger value="refunds">Reembolsos</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="expenses" className="space-y-6">
          {/* Header actions for expenses tab */}
          <div className="flex items-center gap-3 justify-end">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="gap-2 min-w-[160px]">
                <Calendar className="h-4 w-4" />
                {format(currentDate, "MMMM yyyy", { locale: ptBR })}
              </Button>
              <Button variant="outline" size="icon" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>

          {expenseData.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-10 text-center">
              <p className="text-muted-foreground">Nenhuma despesa encontrada para este mês.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Pie Chart */}
                <div className="bg-card rounded-xl border border-border p-5 shadow-card animate-slide-up">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Despesas por Categoria</h3>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseData}
                          cx="50%"
                          cy="50%"
                          innerRadius={80}
                          outerRadius={140}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {expenseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 text-center">
                    <p className="text-sm text-muted-foreground">Total de Despesas</p>
                    <p className="text-2xl font-bold text-expense">
                      R$ {totalExpenses.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Category List */}
                <div className="bg-card rounded-xl border border-border p-5 shadow-card animate-slide-up">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Ranking de Despesas</h3>
                  <div className="space-y-3">
                    {expenseData.map((category, index) => (
                      <div
                        key={category.name}
                        className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-bold text-muted-foreground">
                          {index + 1}
                        </div>
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: category.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{category.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${category.percentage}%`,
                                  backgroundColor: category.color,
                                }}
                              />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground w-12 text-right">
                              {category.percentage}%
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">
                            R$ {category.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="bg-card rounded-xl border border-border p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl gradient-expense flex items-center justify-center">
                      <TrendingDown className="h-6 w-6 text-expense-foreground" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Maior Despesa</p>
                      <p className="text-lg font-bold text-foreground">{topExpense?.name || "-"}</p>
                      <p className="text-sm text-expense">
                        {topExpense 
                          ? `R$ ${topExpense.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                          : "-"
                        }
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                      <span className="text-2xl">📊</span>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Média por Categoria</p>
                      <p className="text-lg font-bold text-foreground">
                        R$ {averagePerCategory.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-card rounded-xl border border-border p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                      <span className="text-2xl">📈</span>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total de Categorias</p>
                      <p className="text-lg font-bold text-foreground">{expenseData.length} categorias</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="refunds">
          <RefundReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
