import { useState } from "react";
import { Wallet, TrendingUp, TrendingDown, CreditCard, Loader2 } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { BalanceChart } from "@/components/dashboard/BalanceChart";
import { CategoryDetailSheet } from "@/components/dashboard/CategoryDetailSheet";
import { AllCategoriesList } from "@/components/dashboard/AllCategoriesList";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCategories } from "@/hooks/useCategories";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

export default function Dashboard() {
  const { totalBalance, isLoading: accountsLoading } = useAccounts();
  const { transactions, totalIncome, totalExpense, isLoading: transactionsLoading } = useTransactions(
    undefined,
    undefined,
    { showAll: false, loadedCount: 1000 }
  );
  const { totalInvoice, isLoading: cardsLoading } = useCreditCards();
  const { expenseCategories, incomeCategories, isLoading: categoriesLoading } = useCategories();

  const [selectedCategory, setSelectedCategory] = useState<CategoryData | null>(null);
  const [categoryType, setCategoryType] = useState<"expense" | "income">("expense");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [allCategoriesDialogOpen, setAllCategoriesDialogOpen] = useState(false);
  const [allCategoriesType, setAllCategoriesType] = useState<"expense" | "income">("expense");

  const isLoading = accountsLoading || transactionsLoading || cardsLoading || categoriesLoading;

  // Calculate expenses by category (excluding corporate expenses)
  const expensesByCategory = expenseCategories.map((cat) => {
    const total = transactions
      .filter((t) => t.type === "expense" && t.category_id === cat.id && !t.is_corporate_expense)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      name: cat.fullName || cat.name,
      value: total,
      color: cat.color || "hsl(var(--chart-1))",
      id: cat.id,
    };
  }).filter((c) => c.value > 0);

  // Calculate income by category
  const incomeByCategory = incomeCategories.map((cat) => {
    const total = transactions
      .filter((t) => t.type === "income" && t.category_id === cat.id)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      name: cat.fullName || cat.name,
      value: total,
      color: cat.color || "hsl(var(--chart-2))",
      id: cat.id,
    };
  }).filter((c) => c.value > 0);

  // Default data for empty states
  const defaultExpenseData = expensesByCategory.length > 0 ? expensesByCategory : [
    { name: "Sem dados", value: 1, color: "hsl(210, 20%, 80%)", id: "" },
  ];

  const defaultIncomeData = incomeByCategory.length > 0 ? incomeByCategory : [
    { name: "Sem dados", value: 1, color: "hsl(210, 20%, 80%)", id: "" },
  ];

  // Get transactions for selected category
  const getTransactionsForCategory = (categoryName: string, type: "expense" | "income") => {
    const categories = type === "expense" ? expenseCategories : incomeCategories;
    const category = categories.find(c => (c.fullName || c.name) === categoryName);
    
    if (!category) return [];
    
    return transactions
      .filter(t => t.category_id === category.id && t.type === type)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const handleCategoryClick = (category: CategoryData, type: "expense" | "income") => {
    if (category.name === "Sem dados") return;
    setSelectedCategory(category);
    setCategoryType(type);
    setSheetOpen(true);
  };

  const handleViewAllClick = (type: "expense" | "income") => {
    setAllCategoriesType(type);
    setAllCategoriesDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-balance" />
      </div>
    );
  }

  const categoryTransactions = selectedCategory 
    ? getTransactionsForCategory(selectedCategory.name, categoryType)
    : [];

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
        <CategoryChart 
          title="Despesas por Categoria" 
          data={defaultExpenseData} 
          onCategoryClick={(cat) => handleCategoryClick(cat, "expense")}
          onViewAllClick={() => handleViewAllClick("expense")}
        />
        <CategoryChart 
          title="Receitas por Categoria" 
          data={defaultIncomeData}
          onCategoryClick={(cat) => handleCategoryClick(cat, "income")}
          onViewAllClick={() => handleViewAllClick("income")}
        />
      </div>

      {/* Balance Chart */}
      <BalanceChart />

      {/* Category Detail Sheet */}
      {selectedCategory && (
        <CategoryDetailSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          categoryName={selectedCategory.name}
          categoryColor={selectedCategory.color}
          totalAmount={selectedCategory.value}
          transactions={categoryTransactions}
        />
      )}

      {/* All Categories Dialog */}
      <Dialog open={allCategoriesDialogOpen} onOpenChange={setAllCategoriesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {allCategoriesType === "expense" ? "Todas as Despesas" : "Todas as Receitas"}
            </DialogTitle>
          </DialogHeader>
          <AllCategoriesList
            data={allCategoriesType === "expense" ? expensesByCategory : incomeByCategory}
            total={allCategoriesType === "expense" ? totalExpense : totalIncome}
            onCategoryClick={(cat) => {
              setAllCategoriesDialogOpen(false);
              handleCategoryClick(cat, allCategoriesType);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
