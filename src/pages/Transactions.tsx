import { useState } from "react";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  CheckCircle2,
  Circle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Loader2,
  CreditCard,
  Building2,
  CalendarDays,
  List,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { TransactionModal } from "@/components/modals/TransactionModal";

type TransactionTab = "checking" | "credit";

export default function Transactions() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TransactionTab>("checking");
  const [showAll, setShowAll] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  
  const { 
    transactions, 
    isLoading, 
    totalIncome, 
    totalExpense, 
    totalCount,
    totalPages,
    deleteTransaction 
  } = useTransactions(undefined, undefined, { showAll, page: currentPage, pageSize });
  const { totalBalance } = useAccounts();

  // Reset page when toggling showAll
  const handleShowAllChange = (checked: boolean) => {
    setShowAll(checked);
    setCurrentPage(1);
  };

  // Filter transactions by tab type
  const filteredByTab = transactions.filter((t) => {
    if (activeTab === "credit") {
      return t.credit_card_id !== null;
    }
    return t.credit_card_id === null;
  });

  const filteredTransactions = filteredByTab.filter((t) =>
    t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate totals per tab
  const tabTotalIncome = filteredByTab
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  
  const tabTotalExpense = filteredByTab
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const toggleTransaction = (id: string) => {
    setSelectedTransactions((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setEditingTransaction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-balance" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Transações</h1>
            <p className="text-muted-foreground">Gerencie suas receitas e despesas</p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Nova Transação
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TransactionTab)}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="checking" className="gap-2">
              <Building2 className="h-4 w-4" />
              Conta Corrente
            </TabsTrigger>
            <TabsTrigger value="credit" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Cartão de Crédito
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar transações..." 
                  className="pl-9" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              {/* Show All Toggle */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
                <CalendarDays className={cn("h-4 w-4", !showAll && "text-primary")} />
                <Switch
                  id="show-all"
                  checked={showAll}
                  onCheckedChange={handleShowAllChange}
                />
                <List className={cn("h-4 w-4", showAll && "text-primary")} />
                <Label htmlFor="show-all" className="text-sm cursor-pointer">
                  {showAll ? "Todas" : "Mês"}
                </Label>
              </div>

              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
            </div>

            {/* Pagination Info */}
            {showAll && totalCount > 0 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Mostrando {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalCount)} de {totalCount} transações
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-2">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Transactions Table */}
            {filteredTransactions.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-12 text-center shadow-card">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">
                  {searchQuery ? "Nenhuma transação encontrada" : `Nenhuma transação de ${activeTab === "credit" ? "cartão" : "conta"}`}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery ? "Tente buscar por outro termo" : "Adicione sua primeira transação para começar"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => setIsModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Transação
                  </Button>
                )}
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data Compra</TableHead>
                      {activeTab === "credit" && (
                        <TableHead className="text-primary font-medium">Vencimento</TableHead>
                      )}
                      <TableHead>Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>{activeTab === "credit" ? "Cartão" : "Conta"}</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-20">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((transaction) => (
                      <TableRow key={transaction.id} className="group">
                        <TableCell>
                          <Checkbox
                            checked={selectedTransactions.includes(transaction.id)}
                            onCheckedChange={() => toggleTransaction(transaction.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {transaction.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 text-income" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString("pt-BR")}
                        </TableCell>
                        {activeTab === "credit" && (
                          <TableCell className="text-primary font-medium">
                            {transaction.due_date 
                              ? new Date(transaction.due_date).toLocaleDateString("pt-BR")
                              : "-"
                            }
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{transaction.description}</TableCell>
                        <TableCell>
                          {transaction.categories ? (
                            <Badge variant="secondary" className="font-normal">
                              {transaction.categories.icon} {transaction.categories.name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {transaction.accounts?.name || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "font-semibold",
                              transaction.type === "income" ? "text-income" : "text-expense"
                            )}
                          >
                            {transaction.type === "income" ? "+" : "-"} R${" "}
                            {Number(transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => handleEdit(transaction)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-expense hover:text-expense"
                              onClick={() => deleteTransaction.mutate(transaction.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Bottom Pagination */}
                {showAll && totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 p-4 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                    <span className="px-4 text-sm text-muted-foreground">
                      Página {currentPage} de {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Sidebar Summary */}
      <div className="hidden xl:block w-72 space-y-4">
        <div className="sticky top-24 space-y-4">
          {/* Current Balance */}
          <div className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg gradient-balance flex items-center justify-center">
                <Wallet className="h-5 w-5 text-balance-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo Atual</p>
                <p className="text-lg font-bold text-foreground">
                  R$ {totalBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Income */}
          <div className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg gradient-income flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-income-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {showAll ? "Receitas (Página)" : activeTab === "credit" ? "Receitas (Cartão)" : "Receitas (Conta)"}
                </p>
                <p className="text-lg font-bold text-income">
                  R$ {tabTotalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg gradient-expense flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-expense-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {showAll ? "Despesas (Página)" : activeTab === "credit" ? "Despesas (Cartão)" : "Despesas (Conta)"}
                </p>
                <p className="text-lg font-bold text-expense">
                  R$ {tabTotalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Total Count when showing all */}
          {showAll && (
            <div className="bg-card rounded-xl border border-border p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <List className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de Transações</p>
                  <p className="text-lg font-bold text-foreground">{totalCount}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <TransactionModal 
        open={isModalOpen} 
        onOpenChange={handleModalClose} 
        transaction={editingTransaction}
      />
    </div>
  );
}
