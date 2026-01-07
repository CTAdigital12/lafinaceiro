import { useState, useMemo } from "react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Briefcase, 
  Download, 
  Calendar, 
  CreditCard, 
  ChevronLeft, 
  ChevronRight,
  FileText,
  Loader2,
  Check,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useToast } from "@/hooks/use-toast";

interface CorporateTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  credit_card_id: string | null;
  category_id: string | null;
  status: string;
  categories?: { name: string; icon: string; color: string } | null;
  credit_cards?: { name: string; last_digits: string } | null;
}

export default function CorporateExpenses() {
  const { user } = useAuth();
  const { creditCards } = useCreditCards();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedCardId, setSelectedCardId] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const startDate = format(startOfMonth(new Date(selectedYear, selectedMonth - 1)), "yyyy-MM-dd");
  const endDate = format(endOfMonth(new Date(selectedYear, selectedMonth - 1)), "yyyy-MM-dd");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["corporate_expenses", user?.id, selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          id,
          description,
          amount,
          date,
          credit_card_id,
          category_id,
          status,
          categories (name, icon, color),
          credit_cards (name, last_digits)
        `)
        .eq("is_corporate_expense", true)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (error) throw error;
      return data as CorporateTransaction[];
    },
    enabled: !!user,
  });

  // Filter by card and status
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const cardMatch = selectedCardId === "all" || t.credit_card_id === selectedCardId;
      const statusMatch = statusFilter === "all" || t.status === statusFilter;
      return cardMatch && statusMatch;
    });
  }, [transactions, selectedCardId, statusFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const total = filteredTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const pending = filteredTransactions
      .filter((t) => t.status === "pending")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const completed = filteredTransactions
      .filter((t) => t.status === "completed")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const selectedTotal = filteredTransactions
      .filter((t) => selectedIds.has(t.id))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    return { total, pending, completed, selectedTotal, selectedCount: selectedIds.size };
  }, [filteredTransactions, selectedIds]);

  // Group by credit card for summary
  const byCard = useMemo(() => {
    const grouped: Record<string, { name: string; lastDigits: string; total: number; count: number }> = {};
    
    filteredTransactions.forEach((t) => {
      const cardId = t.credit_card_id || "none";
      const cardName = t.credit_cards?.name || "Sem cartão";
      const lastDigits = t.credit_cards?.last_digits || "";
      
      if (!grouped[cardId]) {
        grouped[cardId] = { name: cardName, lastDigits, total: 0, count: 0 };
      }
      grouped[cardId].total += Number(t.amount);
      grouped[cardId].count += 1;
    });
    
    return Object.entries(grouped);
  }, [filteredTransactions]);

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const exportToCSV = () => {
    const itemsToExport = selectedIds.size > 0 
      ? filteredTransactions.filter((t) => selectedIds.has(t.id))
      : filteredTransactions;

    if (itemsToExport.length === 0) {
      toast({ title: "Nenhum item para exportar", variant: "destructive" });
      return;
    }

    const headers = ["Data", "Descrição", "Categoria", "Cartão", "Valor"];
    const rows = itemsToExport.map((t) => [
      format(parseISO(t.date), "dd/MM/yyyy"),
      t.description,
      t.categories?.name || "Sem categoria",
      t.credit_cards ? `${t.credit_cards.name} (*${t.credit_cards.last_digits})` : "N/A",
      t.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    ]);

    // Add total row
    const total = itemsToExport.reduce((sum, t) => sum + Number(t.amount), 0);
    rows.push(["", "", "", "TOTAL", total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })]);

    const csvContent = [
      headers.join(";"),
      ...rows.map((row) => row.join(";")),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `despesas-empresa-${format(new Date(selectedYear, selectedMonth - 1), "yyyy-MM")}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({ title: `${itemsToExport.length} itens exportados!` });
  };

  const monthName = format(new Date(selectedYear, selectedMonth - 1), "MMMM yyyy", { locale: ptBR });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Despesas Corporativas</h1>
              <p className="text-muted-foreground">Relatório para reembolso</p>
            </div>
          </div>
        </div>
        <Button className="gap-2" onClick={exportToCSV}>
          <Download className="h-4 w-4" />
          Exportar {selectedIds.size > 0 ? `(${selectedIds.size})` : "Tudo"}
        </Button>
      </div>

      {/* Month Navigation & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-lg border border-border min-w-[180px] justify-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium capitalize">{monthName}</span>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={selectedCardId} onValueChange={setSelectedCardId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os cartões" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cartões</SelectItem>
              {creditCards.map((card) => (
                <SelectItem key={card.id} value={card.id}>
                  {card.name} (*{card.last_digits})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="completed">Concluídos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Total a Reembolsar</p>
          <p className="text-2xl font-bold text-foreground">
            R$ {totals.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">{filteredTransactions.length} transações</p>
        </div>
        
        {byCard.slice(0, 3).map(([cardId, data]) => (
          <div key={cardId} className="bg-card rounded-xl border border-border p-4 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground truncate">
                {data.name} {data.lastDigits && `(*${data.lastDigits})`}
              </p>
            </div>
            <p className="text-lg font-bold text-foreground">
              R$ {data.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">{data.count} itens</p>
          </div>
        ))}
      </div>

      {/* Selection Summary */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{selectedIds.size} selecionados</Badge>
            <span className="text-sm font-medium">
              R$ {totals.selectedTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            <X className="h-4 w-4 mr-1" />
            Limpar seleção
          </Button>
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma despesa corporativa</h3>
            <p className="text-muted-foreground">Não há despesas corporativas para este período</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Cartão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((transaction) => (
                <TableRow 
                  key={transaction.id}
                  className={cn(selectedIds.has(transaction.id) && "bg-primary/5")}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(transaction.id)}
                      onCheckedChange={() => toggleSelect(transaction.id)}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(parseISO(transaction.date), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium truncate max-w-[200px]">
                        {transaction.description}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {transaction.categories ? (
                      <span className="flex items-center gap-1">
                        <span>{transaction.categories.icon}</span>
                        <span className="text-sm">{transaction.categories.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {transaction.credit_cards ? (
                      <span className="text-sm">
                        {transaction.credit_cards.name} (*{transaction.credit_cards.last_digits})
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    R$ {Number(transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
