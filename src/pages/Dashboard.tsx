import { useState, useMemo } from "react";
import { Wallet, TrendingUp, TrendingDown, CreditCard, Loader2 } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { BalanceChart } from "@/components/dashboard/BalanceChart";
import { CategoryDetailSheet } from "@/components/dashboard/CategoryDetailSheet";
import { ParentCategoryDetailSheet } from "@/components/dashboard/ParentCategoryDetailSheet";
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
  id?: string;
  icon?: string | null;
}

interface ParentCategoryData {
  id: string;
  name: string;
  value: number;
  color: string;
  icon?: string | null;
}

interface SubcategoryData {
  id: string;
  name: string;
  value: number;
  color: string;
  icon?: string | null;
  transactions: {
    id: string;
    description: string;
    amount: number;
    date: string;
    type: string;
    category_id?: string;
  }[];
}

export default function Dashboard() {
  const { totalBalance, isLoading: accountsLoading } = useAccounts();
  const { transactions, totalIncome, totalExpense, isLoading: transactionsLoading } = useTransactions(
    undefined,
    undefined,
    { showAll: false, loadedCount: 1000, useHybridDateFilter: true }
  );
  const { totalInvoice, isLoading: cardsLoading } = useCreditCards();
  const { expenseCategories, incomeCategories, isLoading: categoriesLoading } = useCategories();

  const [selectedParentCategory, setSelectedParentCategory] = useState<ParentCategoryData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryData | null>(null);
  const [categoryType, setCategoryType] = useState<"expense" | "income">("expense");
  const [expenseSheetOpen, setExpenseSheetOpen] = useState(false);
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false);
  const [allCategoriesDialogOpen, setAllCategoriesDialogOpen] = useState(false);
  const [allCategoriesType, setAllCategoriesType] = useState<"expense" | "income">("expense");

  const isLoading = accountsLoading || transactionsLoading || cardsLoading || categoriesLoading;

  // Calculate expenses grouped by parent category
  const expensesByParentCategory = useMemo(() => {
    const parentCategories = expenseCategories.filter(c => !c.parent_id);
    const childCategories = expenseCategories.filter(c => c.parent_id);
    
    const result = parentCategories.map(parent => {
      // Direct transactions in parent category
      const parentTotal = transactions
        .filter(t => t.type === "expense" && t.category_id === parent.id && !t.is_corporate_expense)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      // Transactions from subcategories
      const childrenIds = childCategories.filter(c => c.parent_id === parent.id).map(c => c.id);
      const childrenTotal = transactions
        .filter(t => t.type === "expense" && childrenIds.includes(t.category_id!) && !t.is_corporate_expense)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      return {
        id: parent.id,
        name: parent.name,
        value: parentTotal + childrenTotal,
        color: parent.color || "hsl(var(--chart-1))",
        icon: parent.icon,
      };
    }).filter(c => c.value > 0);

    // Add orphan subcategories (subcategories whose parent doesn't exist)
    const orphanCategories = childCategories.filter(c => !parentCategories.some(p => p.id === c.parent_id));
    const orphanExpenses = orphanCategories.map(cat => {
      const total = transactions
        .filter(t => t.type === "expense" && t.category_id === cat.id && !t.is_corporate_expense)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      return {
        id: cat.id,
        name: cat.name,
        value: total,
        color: cat.color || "hsl(var(--chart-1))",
        icon: cat.icon,
      };
    }).filter(c => c.value > 0);

    return [...result, ...orphanExpenses].sort((a, b) => b.value - a.value);
  }, [expenseCategories, transactions]);

  // Get subcategories data for a parent category
  const getSubcategoriesData = (parentId: string): SubcategoryData[] => {
    const subcategories = expenseCategories.filter(c => c.parent_id === parentId);
    
    return subcategories.map(sub => {
      const subTransactions = transactions
        .filter(t => t.type === "expense" && t.category_id === sub.id && !t.is_corporate_expense)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(t => ({
          id: t.id,
          description: t.description,
          amount: Number(t.amount),
          date: t.date,
          type: t.type,
          category_id: t.category_id || undefined,
        }));
      
      const total = subTransactions.reduce((sum, t) => sum + t.amount, 0);
      
      return {
        id: sub.id,
        name: sub.name,
        value: total,
        color: sub.color || "hsl(var(--chart-3))",
        icon: sub.icon,
        transactions: subTransactions,
      };
    }).filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  };

  // Get direct transactions for a parent category (transactions directly in parent, not in subcategories)
  const getDirectTransactions = (parentId: string) => {
    return transactions
      .filter(t => t.type === "expense" && t.category_id === parentId && !t.is_corporate_expense)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(t => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        type: t.type,
        category_id: t.category_id || undefined,
      }));
  };

  // Calculate income by category (keep original behavior for income)
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
  const defaultExpenseData = expensesByParentCategory.length > 0 ? expensesByParentCategory : [
    { id: "", name: "Sem dados", value: 1, color: "hsl(210, 20%, 80%)", icon: null },
  ];

  const defaultIncomeData = incomeByCategory.length > 0 ? incomeByCategory : [
    { name: "Sem dados", value: 1, color: "hsl(210, 20%, 80%)", id: "" },
  ];

  // Get transactions for selected income category
  const getTransactionsForCategory = (categoryName: string, type: "expense" | "income") => {
    const categories = type === "expense" ? expenseCategories : incomeCategories;
    const category = categories.find(c => (c.fullName || c.name) === categoryName);
    
    if (!category) return [];
    
    return transactions
      .filter(t => t.category_id === category.id && t.type === type)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(t => ({
        ...t,
        category_id: t.category_id || undefined,
      }));
  };

  // Get sorted categories for navigation
  const sortedIncomeCategories = [...incomeByCategory].sort((a, b) => b.value - a.value);

  const handleExpenseCategoryClick = (category: CategoryData) => {
    if (category.name === "Sem dados") return;
    const parentCat = expensesByParentCategory.find(c => c.name === category.name);
    if (parentCat) {
      setSelectedParentCategory(parentCat);
      setExpenseSheetOpen(true);
    }
  };

  const handleIncomeCategoryClick = (category: CategoryData) => {
    if (category.name === "Sem dados") return;
    setSelectedCategory(category);
    setCategoryType("income");
    setIncomeSheetOpen(true);
  };

  const handleCategoryChange = (category: CategoryData) => {
    setSelectedCategory(category);
  };

  const handleParentCategoryChange = (category: ParentCategoryData) => {
    setSelectedParentCategory(category);
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

  const incomeTransactions = selectedCategory 
    ? getTransactionsForCategory(selectedCategory.name, "income")
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
          onCategoryClick={handleExpenseCategoryClick}
          onViewAllClick={() => handleViewAllClick("expense")}
        />
        <CategoryChart 
          title="Receitas por Categoria" 
          data={defaultIncomeData}
          onCategoryClick={handleIncomeCategoryClick}
          onViewAllClick={() => handleViewAllClick("income")}
        />
      </div>

      {/* Balance Chart */}
      <BalanceChart />

      {/* Parent Category Detail Sheet for Expenses */}
      {selectedParentCategory && (
        <ParentCategoryDetailSheet
          open={expenseSheetOpen}
          onOpenChange={setExpenseSheetOpen}
          parentCategory={selectedParentCategory}
          subcategories={getSubcategoriesData(selectedParentCategory.id)}
          directTransactions={getDirectTransactions(selectedParentCategory.id)}
          allParentCategories={expensesByParentCategory}
          onParentCategoryChange={handleParentCategoryChange}
          categoryType="expense"
        />
      )}

      {/* Category Detail Sheet for Income */}
      {selectedCategory && (
        <CategoryDetailSheet
          open={incomeSheetOpen}
          onOpenChange={setIncomeSheetOpen}
          categoryName={selectedCategory.name}
          categoryColor={selectedCategory.color}
          totalAmount={selectedCategory.value}
          transactions={incomeTransactions}
          allCategories={sortedIncomeCategories}
          onCategoryChange={handleCategoryChange}
          categoryType="income"
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
            data={allCategoriesType === "expense" ? expensesByParentCategory : incomeByCategory}
            total={allCategoriesType === "expense" ? totalExpense : totalIncome}
            onCategoryClick={(cat) => {
              setAllCategoriesDialogOpen(false);
              if (allCategoriesType === "expense") {
                handleExpenseCategoryClick(cat);
              } else {
                handleIncomeCategoryClick(cat);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
