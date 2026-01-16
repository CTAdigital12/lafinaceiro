import { useState, useMemo } from "react";
import { Wallet, TrendingUp, TrendingDown, CreditCard, Loader2 } from "lucide-react";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { BalanceChart } from "@/components/dashboard/BalanceChart";
import { CategoryDetailSheet } from "@/components/dashboard/CategoryDetailSheet";
import { ParentCategoryDetailSheet } from "@/components/dashboard/ParentCategoryDetailSheet";
import { AllCategoriesList } from "@/components/dashboard/AllCategoriesList";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCategories } from "@/hooks/useCategories";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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

type ExpenseViewFilter = "personal" | "corporate" | "reimbursable";

export default function Dashboard() {
  const { totalBalance, isLoading: accountsLoading } = useAccounts();
  const { transactions, totalIncome, isLoading: transactionsLoading } = useTransactions(
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
  const [expenseFilters, setExpenseFilters] = useState<ExpenseViewFilter[]>(["personal"]);

  const isLoading = accountsLoading || transactionsLoading || cardsLoading || categoriesLoading;

  // Filter function based on expense view filters (for regular expenses, not refunds)
  const filterTransactionsByView = (t: Transaction) => {
    if (t.type !== "expense" || t.is_refund) return false;
    if (t.is_card_payment) return false; // Exclui pagamentos de fatura (transferência interna)
    if (t.credit_card_id) return false; // Exclui compras no cartão (já aparecem na fatura)
    
    const isPersonal = !t.is_corporate_expense && !t.is_reimbursable;
    const isCorporate = t.is_corporate_expense;
    const isReimbursable = t.is_reimbursable;
    
    return (
      (expenseFilters.includes("personal") && isPersonal) ||
      (expenseFilters.includes("corporate") && isCorporate) ||
      (expenseFilters.includes("reimbursable") && isReimbursable)
    );
  };

  // Filter function for refunds of expenses (to subtract from category totals)
  const filterRefundsByView = (t: Transaction) => {
    // Refunds are expense type with is_refund = true, they should reduce the original category
    if (t.type !== "expense" || !t.is_refund) return false;
    if (t.is_card_payment) return false; // Exclui pagamentos de fatura
    if (t.credit_card_id) return false; // Exclui reembolsos de cartão (tratados na fatura)
    
    const isPersonal = !t.is_corporate_expense && !t.is_reimbursable;
    const isCorporate = t.is_corporate_expense;
    const isReimbursable = t.is_reimbursable;
    
    return (
      (expenseFilters.includes("personal") && isPersonal) ||
      (expenseFilters.includes("corporate") && isCorporate) ||
      (expenseFilters.includes("reimbursable") && isReimbursable)
    );
  };

  // Helper to calculate totals for a set of category IDs
  const calculateCategoryTotals = (categoryIds: string[]) => {
    const expenses = transactions
      .filter(t => filterTransactionsByView(t) && categoryIds.includes(t.category_id!))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const refunds = transactions
      .filter(t => filterRefundsByView(t) && categoryIds.includes(t.category_id!))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    return {
      grossValue: expenses,
      refundValue: refunds,
      netValue: expenses - refunds,
    };
  };

  // Calculate total expenses based on current filter (expenses - refunds)
  const filteredTotalExpense = useMemo(() => {
    const expenses = transactions
      .filter(filterTransactionsByView)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    const refunds = transactions
      .filter(filterRefundsByView)
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    return expenses - refunds;
  }, [transactions, expenseFilters]);

  // Calculate expenses grouped by parent category (with refunds subtracted)
  const expensesByParentCategory = useMemo(() => {
    const parentCategories = expenseCategories.filter(c => !c.parent_id);
    const childCategories = expenseCategories.filter(c => c.parent_id);
    
    const result = parentCategories.map(parent => {
      // Get all category IDs (parent + children)
      const childrenIds = childCategories.filter(c => c.parent_id === parent.id).map(c => c.id);
      const allCategoryIds = [parent.id, ...childrenIds];
      
      // Calculate totals (expenses, refunds, net)
      const totals = calculateCategoryTotals(allCategoryIds);
      
      return {
        id: parent.id,
        name: parent.name,
        value: totals.netValue,
        grossValue: totals.grossValue,
        refundValue: totals.refundValue,
        color: parent.color || "hsl(var(--chart-1))",
        icon: parent.icon,
      };
    }).filter(c => c.value > 0);

    // Add orphan subcategories (subcategories whose parent doesn't exist)
    const orphanCategories = childCategories.filter(c => !parentCategories.some(p => p.id === c.parent_id));
    const orphanExpenses = orphanCategories.map(cat => {
      const totals = calculateCategoryTotals([cat.id]);
      return {
        id: cat.id,
        name: cat.name,
        value: totals.netValue,
        grossValue: totals.grossValue,
        refundValue: totals.refundValue,
        color: cat.color || "hsl(var(--chart-1))",
        icon: cat.icon,
      };
    }).filter(c => c.value > 0);

    return [...result, ...orphanExpenses].sort((a, b) => b.value - a.value);
  }, [expenseCategories, transactions, expenseFilters]);

  // Get subcategories data for a parent category (with refunds included as negative)
  const getSubcategoriesData = (parentId: string): SubcategoryData[] => {
    const subcategories = expenseCategories.filter(c => c.parent_id === parentId);
    
    return subcategories.map(sub => {
      // Get regular expense transactions
      const expenseTransactions = transactions
        .filter(t => filterTransactionsByView(t) && t.category_id === sub.id)
        .map(t => ({
          id: t.id,
          description: t.description,
          amount: Number(t.amount),
          date: t.date,
          type: t.type,
          category_id: t.category_id || undefined,
          is_refund: false,
        }));
      
      // Get refund transactions (shown as negative)
      const refundTransactions = transactions
        .filter(t => filterRefundsByView(t) && t.category_id === sub.id)
        .map(t => ({
          id: t.id,
          description: `[Reembolso] ${t.description}`,
          amount: -Number(t.amount), // Negative to show as reduction
          date: t.date,
          type: t.type,
          category_id: t.category_id || undefined,
          is_refund: true,
        }));
      
      const allTransactions = [...expenseTransactions, ...refundTransactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      // Net total (expenses - refunds)
      const totals = calculateCategoryTotals([sub.id]);
      
      return {
        id: sub.id,
        name: sub.name,
        value: totals.netValue,
        color: sub.color || "hsl(var(--chart-3))",
        icon: sub.icon,
        transactions: allTransactions,
      };
    }).filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  };

  // Get direct transactions for a parent category (transactions directly in parent, not in subcategories)
  const getDirectTransactions = (parentId: string) => {
    // Get regular expense transactions
    const expenseTransactions = transactions
      .filter(t => filterTransactionsByView(t) && t.category_id === parentId)
      .map(t => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        type: t.type,
        category_id: t.category_id || undefined,
      }));
    
    // Get refund transactions (shown as negative)
    const refundTransactions = transactions
      .filter(t => filterRefundsByView(t) && t.category_id === parentId)
      .map(t => ({
        id: t.id,
        description: `[Reembolso] ${t.description}`,
        amount: -Number(t.amount), // Negative to show as reduction
        date: t.date,
        type: t.type,
        category_id: t.category_id || undefined,
      }));
    
    return [...expenseTransactions, ...refundTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Calculate income by category (exclude expense refunds - they are now deducted from expense categories)
  const incomeByCategory = incomeCategories.map((cat) => {
    const total = transactions
      .filter((t) => t.type === "income" && t.category_id === cat.id && !t.is_refund)
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

  const handleFilterChange = (value: string[]) => {
    if (value.length > 0) {
      setExpenseFilters(value as ExpenseViewFilter[]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral das suas finanças</p>
        </div>
        
        {/* Expense View Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Visualizar:</span>
          <ToggleGroup 
            type="multiple" 
            value={expenseFilters} 
            onValueChange={handleFilterChange}
            className="justify-start"
          >
            <ToggleGroupItem 
              value="personal" 
              aria-label="Meus gastos"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              Meus gastos
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="corporate" 
              aria-label="Empresa"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              Empresa
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="reimbursable" 
              aria-label="Reembolsáveis"
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              Reembolsáveis
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
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
          value={`R$ ${filteredTotalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
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
            total={allCategoriesType === "expense" ? filteredTotalExpense : totalIncome}
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
