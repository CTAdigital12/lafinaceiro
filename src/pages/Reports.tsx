import { Download, Calendar, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { cn } from "@/lib/utils";

interface ExpenseCategory {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

const expenseData: ExpenseCategory[] = [
  { name: "Moradia", value: 1500, color: "hsl(217, 91%, 60%)", percentage: 35.3 },
  { name: "Alimentação", value: 850, color: "hsl(142, 71%, 45%)", percentage: 20.0 },
  { name: "Transporte", value: 620, color: "hsl(45, 93%, 47%)", percentage: 14.6 },
  { name: "Vestuário", value: 450, color: "hsl(280, 65%, 60%)", percentage: 10.6 },
  { name: "Lazer", value: 380, color: "hsl(0, 84%, 60%)", percentage: 8.9 },
  { name: "Saúde", value: 200, color: "hsl(190, 80%, 45%)", percentage: 4.7 },
  { name: "Educação", value: 150, color: "hsl(330, 70%, 55%)", percentage: 3.5 },
  { name: "Outros", value: 100, color: "hsl(210, 20%, 50%)", percentage: 2.4 },
];

const totalExpenses = expenseData.reduce((sum, item) => sum + item.value, 0);

export default function Reports() {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground">Análise detalhada das suas finanças</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" />
            Janeiro 2024
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

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
            {expenseData
              .sort((a, b) => b.value - a.value)
              .map((category, index) => (
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
              <p className="text-lg font-bold text-foreground">Moradia</p>
              <p className="text-sm text-expense">R$ 1.500,00</p>
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
                R$ {(totalExpenses / expenseData.length).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
    </div>
  );
}
