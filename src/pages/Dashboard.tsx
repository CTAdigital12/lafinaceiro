import { Wallet, TrendingUp, TrendingDown, CreditCard, Loader2 } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { BalanceChart } from "@/components/dashboard/BalanceChart";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCategories } from "@/hooks/useCategories";

export default function Dashboard() {
  const { totalBalance, isLoading: accountsLoading } = useAccounts();
  const { transactions, totalIncome, totalExpense, isLoading: transactionsLoading } = useTransactions();
  const { totalInvoice, isLoading: cardsLoading } = useCreditCards();
  const { expenseCategories, incomeCategories, isLoading: categoriesLoading } = useCategories();

  const isLoading = accountsLoading || transactionsLoading || cardsLoading || categoriesLoading;

  // Calculate expenses by category
  const expensesByCategory = expenseCategories.map((cat) => {
    const total = transactions
      .filter((t) => t.type === "expense" && t.category_id === cat.id)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      name: cat.name,
      value: total,
      color: cat.color,
    };
  }).filter((c) => c.value > 0);

  // Calculate income by category
  const incomeByCategory = incomeCategories.map((cat) => {
    const total = transactions
      .filter((t) => t.type === "income" && t.category_id === cat.id)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      name: cat.name,
      value: total,
      color: cat.color,
    };
  }).filter((c) => c.value > 0);

  // Default data for empty states
  const defaultExpenseData = expensesByCategory.length > 0 ? expensesByCategory : [
    { name: "Sem dados", value: 1, color: "hsl(210, 20%, 80%)" },
  ];

  const defaultIncomeData = incomeByCategory.length > 0 ? incomeByCategory : [
    { name: "Sem dados", value: 1, color: "hsl(210, 20%, 80%)" },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-balance" />
      </div>
    );
  }

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
          value={`R$ ${totalBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          subtitle="Todas as contas"
          icon={Wallet}
          variant="balance"
        />
        <SummaryCard
          title="Receitas"
          value={`R$ ${totalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          subtitle="Este mês"
          icon={TrendingUp}
          variant="income"
        />
        <SummaryCard
          title="Despesas"
          value={`R$ ${totalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          subtitle="Este mês"
          icon={TrendingDown}
          variant="expense"
        />
        <SummaryCard
          title="Cartão de Crédito"
          value={`R$ ${totalInvoice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          subtitle="Fatura atual"
          icon={CreditCard}
          variant="card"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryChart title="Despesas por Categoria" data={defaultExpenseData} />
        <CategoryChart title="Receitas por Categoria" data={defaultIncomeData} />
      </div>

      {/* Balance Chart */}
      <BalanceChart />
    </div>
  );
}
