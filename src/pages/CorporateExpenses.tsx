import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Briefcase, 
  Download, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  FileText,
  Loader2,
  X,
  Clock,
  Send,
  CheckCircle2,
  Search
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useToast } from "@/hooks/use-toast";

type ReimbursementStatus = "pending" | "requested" | "reimbursed";

const reimbursementStatusConfig: Record<ReimbursementStatus, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: "Pendente", icon: Clock, className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
  requested: { label: "Solicitado", icon: Send, className: "bg-primary/10 text-primary border-primary/20" },
  reimbursed: { label: "Reembolsado", icon: CheckCircle2, className: "bg-income/10 text-income border-income/20" },
};

interface CorporateTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  due_date: string | null;
  credit_card_id: string | null;
  category_id: string | null;
  status: string;
  reimbursement_status: ReimbursementStatus;
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
  const [searchQuery, setSearchQuery] = useState("");

  const [reimbursementFilter, setReimbursementFilter] = useState<string>("all");

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
          due_date,
          credit_card_id,
          category_id,
          status,
          reimbursement_status,
          categories (name, icon, color),
          credit_cards (name, last_digits)
        `)
        .eq("is_corporate_expense", true)
        .or(
          `and(credit_card_id.is.null,date.gte.${startDate},date.lte.${endDate}),` +
          `and(credit_card_id.not.is.null,due_date.gte.${startDate},due_date.lte.${endDate})`
        )
        .order("date", { ascending: false });

      if (error) throw error;
      return data as CorporateTransaction[];
    },
    enabled: !!user,
  });

  // Filter by card, reimbursement status, and search query
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const cardMatch = selectedCardId === "all" || t.credit_card_id === selectedCardId;
      const reimbursementMatch = reimbursementFilter === "all" || t.reimbursement_status === reimbursementFilter;
      const searchMatch = searchQuery === "" || 
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.categories?.name?.toLowerCase().includes(searchQuery.toLowerCase());
      return cardMatch && reimbursementMatch && searchMatch;
    });
  }, [transactions, selectedCardId, reimbursementFilter, searchQuery]);

  // Calculate totals
  const totals = useMemo(() => {
    const total = filteredTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const pending = filteredTransactions
      .filter((t) => t.reimbursement_status === "pending")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const requested = filteredTransactions
      .filter((t) => t.reimbursement_status === "requested")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const reimbursed = filteredTransactions
      .filter((t) => t.reimbursement_status === "reimbursed")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const selectedTotal = filteredTransactions
      .filter((t) => selectedIds.has(t.id))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
    return { total, pending, requested, reimbursed, selectedTotal, selectedCount: selectedIds.size };
  }, [filteredTransactions, selectedIds]);


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

  // Mutation to update reimbursement status
  const updateReimbursementStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReimbursementStatus }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ reimbursement_status: status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["corporate_expenses"] });
      toast({ title: "Status atualizado!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    },
  });

  // Bulk update reimbursement status
  const updateSelectedStatus = async (status: ReimbursementStatus) => {
    const selectedItems = filteredTransactions.filter((t) => selectedIds.has(t.id));
    for (const item of selectedItems) {
      await updateReimbursementStatus.mutateAsync({ id: item.id, status });
    }
    setSelectedIds(new Set());
  };

  const getExportData = () => {
    const itemsToExport = selectedIds.size > 0 
      ? filteredTransactions.filter((t) => selectedIds.has(t.id))
      : filteredTransactions;

    if (itemsToExport.length === 0) {
      toast({ title: "Nenhum item para exportar", variant: "destructive" });
      return null;
    }

    const statusLabels: Record<ReimbursementStatus, string> = {
      pending: "Pendente",
      requested: "Solicitado",
      reimbursed: "Reembolsado",
    };

    return { itemsToExport, statusLabels };
  };

  const exportToCSV = () => {
    const exportData = getExportData();
    if (!exportData) return;
    const { itemsToExport, statusLabels } = exportData;

    const headers = ["Data", "Descrição", "Categoria", "Cartão", "Status Reembolso", "Valor"];
    const rows = itemsToExport.map((t) => [
      format(parseISO(t.date), "dd/MM/yyyy"),
      t.description,
      t.categories?.name || "Sem categoria",
      t.credit_cards ? `${t.credit_cards.name} (*${t.credit_cards.last_digits})` : "N/A",
      statusLabels[t.reimbursement_status] || "Pendente",
      t.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
    ]);

    const total = itemsToExport.reduce((sum, t) => sum + Number(t.amount), 0);
    rows.push(["", "", "", "", "TOTAL", total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })]);

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

  const exportToXLSX = () => {
    const exportData = getExportData();
    if (!exportData) return;
    const { itemsToExport, statusLabels } = exportData;

    const rows = itemsToExport.map((t) => ({
      "Data": format(parseISO(t.date), "dd/MM/yyyy"),
      "Descrição": t.description,
      "Categoria": t.categories?.name || "Sem categoria",
      "Cartão": t.credit_cards ? `${t.credit_cards.name} (*${t.credit_cards.last_digits})` : "N/A",
      "Status Reembolso": statusLabels[t.reimbursement_status] || "Pendente",
      "Valor": Number(t.amount),
    }));

    const total = itemsToExport.reduce((sum, t) => sum + Number(t.amount), 0);
    rows.push({
      "Data": "",
      "Descrição": "",
      "Categoria": "",
      "Cartão": "",
      "Status Reembolso": "TOTAL",
      "Valor": total,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    
    // Set column widths
    ws["!cols"] = [
      { wch: 12 }, // Data
      { wch: 40 }, // Descrição
      { wch: 20 }, // Categoria
      { wch: 25 }, // Cartão
      { wch: 18 }, // Status
      { wch: 15 }, // Valor
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Despesas Corporativas");
    XLSX.writeFile(wb, `despesas-empresa-${format(new Date(selectedYear, selectedMonth - 1), "yyyy-MM")}.xlsx`);

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Download className="h-4 w-4" />
              Exportar {selectedIds.size > 0 ? `(${selectedIds.size})` : "Tudo"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportToXLSX}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar XLSX
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportToCSV}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar descrição..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>

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

          <Select value={reimbursementFilter} onValueChange={setReimbursementFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="requested">Solicitados</SelectItem>
              <SelectItem value="reimbursed">Reembolsados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-xl border border-border p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Total Despesas</p>
          <p className="text-2xl font-bold text-foreground">
            R$ {totals.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">{filteredTransactions.length} transações</p>
        </div>
        
        <div className="bg-card rounded-xl border border-border p-4 shadow-card border-l-4 border-l-chart-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-chart-4" />
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
          <p className="text-lg font-bold text-chart-4">
            R$ {totals.pending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 shadow-card border-l-4 border-l-primary">
          <div className="flex items-center gap-2 mb-1">
            <Send className="h-4 w-4 text-primary" />
            <p className="text-xs text-muted-foreground">Solicitados</p>
          </div>
          <p className="text-lg font-bold text-primary">
            R$ {totals.requested.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 shadow-card border-l-4 border-l-income">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-income" />
            <p className="text-xs text-muted-foreground">Reembolsados</p>
          </div>
          <p className="text-lg font-bold text-income">
            R$ {totals.reimbursed.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Selection Summary with bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{selectedIds.size} selecionados</Badge>
            <span className="text-sm font-medium">
              R$ {totals.selectedTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => updateSelectedStatus("requested")}
              disabled={updateReimbursementStatus.isPending}
            >
              <Send className="h-4 w-4 mr-1" />
              Marcar como Solicitado
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => updateSelectedStatus("reimbursed")}
              disabled={updateReimbursementStatus.isPending}
              className="text-income hover:text-income"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Marcar como Reembolsado
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X className="h-4 w-4 mr-1" />
              Limpar
            </Button>
          </div>
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
          <>
            {/* Desktop Table */}
            <div className="hidden md:block">
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
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Cartão</TableHead>
                    <TableHead>Status</TableHead>
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
                      <TableCell className="text-muted-foreground">
                        {transaction.due_date ? format(parseISO(transaction.due_date), "dd/MM/yyyy") : "-"}
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
                      <TableCell>
                        {(() => {
                          const status = reimbursementStatusConfig[transaction.reimbursement_status] || reimbursementStatusConfig.pending;
                          const StatusIcon = status.icon;
                          return (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className={cn(
                                    "h-7 px-2 gap-1.5 border",
                                    status.className
                                  )}
                                >
                                  <StatusIcon className="h-3.5 w-3.5" />
                                  <span className="text-xs">{status.label}</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => updateReimbursementStatus.mutate({ id: transaction.id, status: "pending" })}
                                  disabled={transaction.reimbursement_status === "pending"}
                                >
                                  <Clock className="h-4 w-4 mr-2 text-chart-4" />
                                  Pendente
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => updateReimbursementStatus.mutate({ id: transaction.id, status: "requested" })}
                                  disabled={transaction.reimbursement_status === "requested"}
                                >
                                  <Send className="h-4 w-4 mr-2 text-primary" />
                                  Solicitado
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => updateReimbursementStatus.mutate({ id: transaction.id, status: "reimbursed" })}
                                  disabled={transaction.reimbursement_status === "reimbursed"}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2 text-income" />
                                  Reembolsado
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        R$ {Number(transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden p-3 space-y-2">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                <Checkbox
                  checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">Selecionar todos</span>
              </div>
              {filteredTransactions.map((transaction) => {
                const status = reimbursementStatusConfig[transaction.reimbursement_status] || reimbursementStatusConfig.pending;
                const StatusIcon = status.icon;
                return (
                  <div 
                    key={transaction.id} 
                    className={cn(
                      "border border-border/50 rounded-lg p-3 bg-background/50",
                      selectedIds.has(transaction.id) && "bg-primary/5 border-primary/30"
                    )}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <Checkbox
                        checked={selectedIds.has(transaction.id)}
                        onCheckedChange={() => toggleSelect(transaction.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{transaction.description}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{format(parseISO(transaction.date), "dd/MM/yyyy")}</span>
                          {transaction.credit_cards && (
                            <>
                              <span>•</span>
                              <span>{transaction.credit_cards.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="font-semibold text-sm whitespace-nowrap">
                        R$ {Number(transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {transaction.categories && (
                          <span className="text-xs flex items-center gap-1">
                            <span>{transaction.categories.icon}</span>
                            <span className="text-muted-foreground">{transaction.categories.name}</span>
                          </span>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className={cn("h-6 px-2 gap-1 border text-xs", status.className)}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => updateReimbursementStatus.mutate({ id: transaction.id, status: "pending" })}>
                            <Clock className="h-4 w-4 mr-2 text-chart-4" /> Pendente
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateReimbursementStatus.mutate({ id: transaction.id, status: "requested" })}>
                            <Send className="h-4 w-4 mr-2 text-primary" /> Solicitado
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateReimbursementStatus.mutate({ id: transaction.id, status: "reimbursed" })}>
                            <CheckCircle2 className="h-4 w-4 mr-2 text-income" /> Reembolsado
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
