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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  account: string;
  amount: number;
  type: "income" | "expense";
  status: "completed" | "pending";
}

const transactions: Transaction[] = [
  { id: "1", date: "2024-01-15", description: "Salário", category: "Salário", account: "Itaú", amount: 5500, type: "income", status: "completed" },
  { id: "2", date: "2024-01-14", description: "Aluguel", category: "Moradia", account: "Itaú", amount: 1500, type: "expense", status: "completed" },
  { id: "3", date: "2024-01-13", description: "Supermercado Extra", category: "Alimentação", account: "Nubank", amount: 450, type: "expense", status: "completed" },
  { id: "4", date: "2024-01-12", description: "Freelance - Projeto X", category: "Freelance", account: "Nubank", amount: 1200, type: "income", status: "completed" },
  { id: "5", date: "2024-01-11", description: "Uber", category: "Transporte", account: "Nubank", amount: 85, type: "expense", status: "pending" },
  { id: "6", date: "2024-01-10", description: "Netflix", category: "Lazer", account: "Nubank", amount: 55, type: "expense", status: "completed" },
  { id: "7", date: "2024-01-09", description: "Farmácia", category: "Saúde", account: "Carteira", amount: 120, type: "expense", status: "completed" },
  { id: "8", date: "2024-01-08", description: "Dividendos", category: "Investimentos", account: "Bradesco", amount: 350, type: "income", status: "completed" },
];

export default function Transactions() {
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const currentBalance = totalIncome - totalExpense;

  const toggleTransaction = (id: string) => {
    setSelectedTransactions((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

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
          <Button className="gap-2 bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            Nova Transação
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar transações..." className="pl-9" />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
        </div>

        {/* Transactions Table */}
        <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12"></TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
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
                  <TableCell className="font-medium">{transaction.description}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {transaction.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{transaction.account}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "font-semibold",
                        transaction.type === "income" ? "text-income" : "text-expense"
                      )}
                    >
                      {transaction.type === "income" ? "+" : "-"} R${" "}
                      {transaction.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-expense hover:text-expense">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
                  R$ {currentBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
                <p className="text-xs text-muted-foreground">Total Receitas</p>
                <p className="text-lg font-bold text-income">
                  R$ {totalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
                <p className="text-xs text-muted-foreground">Total Despesas</p>
                <p className="text-lg font-bold text-expense">
                  R$ {totalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
