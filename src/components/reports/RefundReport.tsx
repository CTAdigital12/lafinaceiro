import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, RotateCcw, Download, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useTransactions } from "@/hooks/useTransactions";
import { useCategories } from "@/hooks/useCategories";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { ListSortButtons } from "@/components/ui/list-sort-buttons";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface RefundSummary {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  totalExpense: number;
  totalRefund: number;
  netExpense: number;
  transactions: {
    id: string;
    description: string;
    amount: number;
    date: string;
    isRefund: boolean;
  }[];
}

export function RefundReport() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const month = selectedDate.getMonth() + 1;
  const year = selectedDate.getFullYear();
  
  const { transactions, isLoading } = useTransactions(month, year, {
    showAll: false,
    loadedCount: 1000,
  });
  
  const { expenseCategories } = useCategories();

  // Navigate months
  const handlePreviousMonth = () => setSelectedDate(subMonths(selectedDate, 1));
  const handleNextMonth = () => setSelectedDate(addMonths(selectedDate, 1));

  // Calculate refund summary by category
  const refundData = useMemo(() => {
    // Get all expense transactions (both normal and refunds)
    const expenseTransactions = transactions.filter(t => t.type === "expense");
    
    // Group by category
    const categoryMap = new Map<string, RefundSummary>();
    
    expenseTransactions.forEach(t => {
      const categoryId = t.category_id || "uncategorized";
      const category = expenseCategories.find(c => c.id === categoryId);
      
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          categoryId,
          categoryName: category?.name || "Sem categoria",
          categoryIcon: category?.icon || "📦",
          categoryColor: category?.color || "#6B7280",
          totalExpense: 0,
          totalRefund: 0,
          netExpense: 0,
          transactions: [],
        });
      }
      
      const summary = categoryMap.get(categoryId)!;
      
      if (t.is_refund) {
        summary.totalRefund += Number(t.amount);
      } else {
        summary.totalExpense += Number(t.amount);
      }
      
      summary.transactions.push({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        date: t.date,
        isRefund: t.is_refund,
      });
    });
    
    // Calculate net expense and filter categories with refunds
    const summaries = Array.from(categoryMap.values())
      .map(s => ({
        ...s,
        netExpense: s.totalExpense - s.totalRefund,
        transactions: s.transactions.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
      }))
      .filter(s => s.totalRefund > 0) // Only show categories with refunds
      .sort((a, b) => b.totalRefund - a.totalRefund);
    
    return summaries;
  }, [transactions, expenseCategories]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalExpense = refundData.reduce((sum, s) => sum + s.totalExpense, 0);
    const totalRefund = refundData.reduce((sum, s) => sum + s.totalRefund, 0);
    const netExpense = totalExpense - totalRefund;
    const categoriesWithRefunds = refundData.length;
    const totalRefundTransactions = refundData.reduce(
      (sum, s) => sum + s.transactions.filter(t => t.isRefund).length, 
      0
    );
    
    return { totalExpense, totalRefund, netExpense, categoriesWithRefunds, totalRefundTransactions };
  }, [refundData]);

  // Export to CSV
  const handleExport = () => {
    const headers = ["Data", "Descrição", "Categoria", "Tipo", "Valor"];
    const rows = refundData.flatMap(s => 
      s.transactions.map(t => [
        format(new Date(t.date), "dd/MM/yyyy"),
        t.description,
        s.categoryName,
        t.isRefund ? "Reembolso" : "Despesa",
        t.isRefund ? `-${t.amount.toFixed(2)}` : t.amount.toFixed(2),
      ])
    );
    
    const csv = [headers, ...rows].map(row => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `reembolsos-${format(selectedDate, "yyyy-MM")}.csv`;
    link.click();
  };

  const formatCurrency = useFormatCurrency();

  const { query, setQuery, sort, toggleSort, items: displayedRefundData } = useListSearchSort(refundData, {
    searchAccessors: [
      (s) => s.categoryName,
      (s) => s.transactions.map((t) => t.description).join(" "),
    ],
    sortAccessors: {
      category: (s) => s.categoryName,
      expense: (s) => s.totalExpense,
      refund: (s) => s.totalRefund,
      net: (s) => s.netExpense,
    },
    initialSort: { field: "refund", direction: "desc" },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with month navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-emerald-500" />
            Relatório de Reembolsos
          </h2>
          <p className="text-sm text-muted-foreground">
            Transações com estorno por categoria
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center font-medium capitalize">
            {format(selectedDate, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="ml-2">
            <Download className="h-4 w-4 mr-1" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Despesas Brutas</p>
                <p className="text-lg font-bold text-foreground">
                  {formatCurrency(totals.totalExpense)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <RotateCcw className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Reembolsado</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  - {formatCurrency(totals.totalRefund)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="text-lg">💰</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Despesa Líquida</p>
                <p className="text-lg font-bold text-foreground">
                  {formatCurrency(totals.netExpense)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <span className="text-lg">📊</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reembolsos</p>
                <p className="text-lg font-bold text-foreground">
                  {totals.totalRefundTransactions} transações
                </p>
                <p className="text-xs text-muted-foreground">
                  em {totals.categoriesWithRefunds} categorias
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Refund Details by Category */}
      {refundData.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <RotateCcw className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">
              Nenhum reembolso registrado neste período
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar categoria ou descrição..."
              className="sm:max-w-xs"
            />
            <ListSortButtons
              options={[
                { key: "category", label: "Categoria" },
                { key: "expense", label: "Despesa" },
                { key: "refund", label: "Reembolso" },
                { key: "net", label: "Líquido" },
              ]}
              activeField={sort.field}
              direction={sort.direction}
              onSort={toggleSort}
              className="sm:ml-auto"
            />
          </div>
          {displayedRefundData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma categoria corresponde à busca.</p>
          ) : (
            displayedRefundData.map(category => (
            <Card key={category.categoryId}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-xl"
                      style={{ backgroundColor: `${category.categoryColor}20` }}
                    >
                      {category.categoryIcon}
                    </div>
                    <div>
                      <CardTitle className="text-base">{category.categoryName}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {category.transactions.length} transações
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(category.totalExpense)}
                      <span className="text-emerald-600 ml-1">
                        - {formatCurrency(category.totalRefund)}
                      </span>
                    </p>
                    <p className="text-lg font-bold">
                      = {formatCurrency(category.netExpense)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <ScrollArea className="max-h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Data</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-[100px]">Tipo</TableHead>
                          <TableHead className="text-right w-[120px]">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {category.transactions.map(t => (
                          <TableRow key={t.id}>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(t.date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell className="font-medium">
                              {t.description}
                            </TableCell>
                            <TableCell>
                              {t.isRefund ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                                  Reembolso
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                                  Despesa
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${t.isRefund ? "text-emerald-600" : ""}`}>
                              {t.isRefund ? "- " : ""}
                              {formatCurrency(t.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2">
                  {category.transactions.map(t => (
                    <div 
                      key={t.id}
                      className="p-3 rounded-lg border border-border bg-muted/30"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(t.date), "dd/MM/yyyy")}
                        </span>
                        {t.isRefund ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 text-xs">
                            Reembolso
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-xs">
                            Despesa
                          </Badge>
                        )}
                      </div>
                      <p className="font-medium text-sm truncate">{t.description}</p>
                      <p className={`text-sm font-semibold mt-1 ${t.isRefund ? "text-emerald-600" : ""}`}>
                        {t.isRefund ? "- " : ""}
                        {formatCurrency(t.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
