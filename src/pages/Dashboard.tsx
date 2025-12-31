import { Wallet, TrendingUp, TrendingDown, CreditCard } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { BalanceChart } from "@/components/dashboard/BalanceChart";

const expenseData = [
  { name: "Moradia", value: 1500, color: "hsl(217, 91%, 60%)" },
  { name: "Alimentação", value: 800, color: "hsl(142, 71%, 45%)" },
  { name: "Transporte", value: 450, color: "hsl(45, 93%, 47%)" },
  { name: "Lazer", value: 350, color: "hsl(280, 65%, 60%)" },
  { name: "Saúde", value: 200, color: "hsl(0, 84%, 60%)" },
  { name: "Outros", value: 400, color: "hsl(190, 80%, 45%)" },
];

const incomeData = [
  { name: "Salário", value: 5500, color: "hsl(142, 71%, 45%)" },
  { name: "Freelance", value: 1200, color: "hsl(217, 91%, 60%)" },
  { name: "Investimentos", value: 350, color: "hsl(45, 93%, 47%)" },
  { name: "Outros", value: 150, color: "hsl(280, 65%, 60%)" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral das suas finanças</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Saldo Atual"
          value="R$ 12.450,00"
          subtitle="Atualizado agora"
          icon={Wallet}
          variant="balance"
          trend={{ value: 12.5, isPositive: true }}
        />
        <SummaryCard
          title="Receitas"
          value="R$ 7.200,00"
          subtitle="Este mês"
          icon={TrendingUp}
          variant="income"
          trend={{ value: 8.2, isPositive: true }}
        />
        <SummaryCard
          title="Despesas"
          value="R$ 3.700,00"
          subtitle="Este mês"
          icon={TrendingDown}
          variant="expense"
          trend={{ value: 5.4, isPositive: false }}
        />
        <SummaryCard
          title="Cartão de Crédito"
          value="R$ 1.850,00"
          subtitle="Fatura atual"
          icon={CreditCard}
          variant="card"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryChart title="Despesas por Categoria" data={expenseData} />
        <CategoryChart title="Receitas por Categoria" data={incomeData} />
      </div>

      {/* Balance Chart */}
      <BalanceChart />
    </div>
  );
}
