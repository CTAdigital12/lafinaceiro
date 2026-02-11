import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle,
  Search,
  RotateCcw,
  Briefcase,
  CreditCard,
  Download,
  FileDown,
  PenLine,
  BarChart3,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InvoiceDiscrepancyReport } from "./InvoiceDiscrepancyReport";
import { InvoiceBreakdownCard } from "./InvoiceBreakdownCard";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  due_date: string | null;
  status: string;
  is_refund: boolean;
  is_corporate_expense: boolean;
  credit_card_id: string;
  imported_at?: string | null;
  is_card_payment?: boolean | null;
  reimbursement_status?: string | null;
  category?: { name: string; icon: string } | null;
}

interface ReconciliationDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  cardName: string;
  bankInvoice: number;
  transactionsTotal: number;
  difference: number;
  transactions: Transaction[];
}

function formatCurrency(value: number) {
  return `R$ ${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function ReconciliationDetailModal({
  open,
  onOpenChange,
  cardId,
  cardName,
  bankInvoice,
  transactionsTotal,
  difference,
  transactions,
}: ReconciliationDetailModalProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const cardTransactions = useMemo(() => {
    return transactions
      .filter((t) => t.credit_card_id === cardId && !t.is_card_payment)
      .filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (typeFilter === "refund" && !t.is_refund) return false;
        if (typeFilter === "corporate" && !t.is_corporate_expense) return false;
        if (typeFilter === "personal" && (t.is_refund || t.is_corporate_expense)) return false;
        if (typeFilter === "imported" && !t.imported_at) return false;
        if (typeFilter === "manual" && t.imported_at) return false;
        if (search) {
          const searchLower = search.toLowerCase();
          return t.description.toLowerCase().includes(searchLower);
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, cardId, search, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const allCardTx = transactions.filter((t) => t.credit_card_id === cardId && !t.is_card_payment);
    const completed = allCardTx.filter((t) => t.status === "completed" && !t.is_refund);
    const pending = allCardTx.filter((t) => t.status === "pending");
    const refunds = allCardTx.filter((t) => t.is_refund);
    const corporate = completed.filter((t) => t.is_corporate_expense);
    const corporateReimbursed = corporate.filter((t) => t.reimbursement_status === 'reimbursed');
    const imported = completed.filter((t) => t.imported_at);
    const manual = completed.filter((t) => !t.imported_at);

    return {
      completedTotal: completed.reduce((s, t) => s + Number(t.amount), 0),
      pendingTotal: pending.reduce((s, t) => s + Number(t.amount), 0),
      refundTotal: refunds.reduce((s, t) => s + Number(t.amount), 0),
      corporateTotal: corporate.reduce((s, t) => s + Number(t.amount), 0),
      corporateReimbursedTotal: corporateReimbursed.reduce((s, t) => s + Number(t.amount), 0),
      completedCount: completed.length,
      pendingCount: pending.length,
      refundCount: refunds.length,
      importedCount: imported.length,
      manualCount: manual.length,
    };
  }, [transactions, cardId]);

  const exportCSV = () => {
    const headers = ["Data", "Descrição", "Valor", "Status", "Tipo"];
    const rows = cardTransactions.map((t) => [
      format(new Date(t.date), "dd/MM/yyyy"),
      t.description,
      t.is_refund ? `-${t.amount}` : t.amount.toString(),
      t.status === "completed" ? "Concluído" : "Pendente",
      t.is_refund ? "Estorno" : t.is_corporate_expense ? "Empresa" : "Pessoal",
    ]);

    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `reconciliacao-${cardName.toLowerCase().replace(/\s+/g, "-")}.csv`;
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Detalhes da Reconciliação - {cardName}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Fatura Banco</p>
            <p className="text-lg font-bold">{formatCurrency(bankInvoice)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Lançamentos</p>
            <p className="text-lg font-bold">{formatCurrency(transactionsTotal)}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Diferença</p>
            <p className={cn(
              "text-lg font-bold",
              Math.abs(difference) > 0.01 ? "text-chart-4" : "text-income"
            )}>
              {difference >= 0 ? "+" : "-"}{formatCurrency(difference)}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="flex items-center gap-1 mt-1">
              {Math.abs(difference) > 0.01 ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-chart-4" />
                  <span className="text-sm text-chart-4 font-medium">Divergente</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 text-income" />
                  <span className="text-sm text-income font-medium">Conciliado</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats Breakdown */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <FileDown className="h-3 w-3 text-primary" />
            {stats.importedCount} importadas
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <PenLine className="h-3 w-3" />
            {stats.manualCount} manuais
          </Badge>
          {stats.pendingCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-primary" />
              {stats.pendingCount} pendentes ({formatCurrency(stats.pendingTotal)})
            </Badge>
          )}
          {stats.refundCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <RotateCcw className="h-3 w-3 text-income" />
              {stats.refundCount} estornos (-{formatCurrency(stats.refundTotal)})
            </Badge>
          )}
          {stats.corporateTotal > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Briefcase className="h-3 w-3" />
              Empresa: {formatCurrency(stats.corporateTotal)}
            </Badge>
          )}
          {stats.corporateReimbursedTotal > 0 && (
            <Badge variant="secondary" className="gap-1 bg-income/10 text-income">
              <CheckCircle className="h-3 w-3" />
              Reembolsado: {formatCurrency(stats.corporateReimbursedTotal)}
            </Badge>
          )}
          {stats.corporateTotal > 0 && stats.corporateTotal - stats.corporateReimbursedTotal > 0 && (
            <Badge variant="secondary" className="gap-1 bg-chart-4/10 text-chart-4">
              <Clock className="h-3 w-3" />
              Pendente: {formatCurrency(stats.corporateTotal - stats.corporateReimbursedTotal)}
            </Badge>
          )}
        </div>

        {/* Tabs for Transactions and Breakdown */}
        <Tabs defaultValue="transactions" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="transactions">Transações</TabsTrigger>
            <TabsTrigger value="discrepancy" className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              Divergência
            </TabsTrigger>
            <TabsTrigger value="breakdown">Como Foi Calculado</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="flex-1 flex flex-col min-h-0 space-y-3 mt-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar transações..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="completed">Concluídos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Tipos</SelectItem>
                  <SelectItem value="personal">Pessoal</SelectItem>
                  <SelectItem value="corporate">Empresa</SelectItem>
                  <SelectItem value="refund">Estornos</SelectItem>
                  <SelectItem value="imported">Importadas</SelectItem>
                  <SelectItem value="manual">Manuais</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={exportCSV} title="Exportar CSV">
                <Download className="h-4 w-4" />
              </Button>
            </div>

            {/* Transactions Table */}
            <ScrollArea className="flex-1 min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cardTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma transação encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    cardTransactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(t.date), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {t.category?.icon && (
                              <span className="text-sm">{t.category.icon}</span>
                            )}
                            <span className={cn(t.is_refund && "text-income")}>
                              {t.description}
                            </span>
                            {t.is_refund && (
                              <Badge variant="secondary" className="text-xs bg-income/10 text-income">
                                <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                                Estorno
                              </Badge>
                            )}
                            {t.is_corporate_expense && !t.is_refund && (
                              <Badge variant="secondary" className="text-xs">
                                <Briefcase className="h-2.5 w-2.5 mr-0.5" />
                                Empresa
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              t.imported_at ? "border-primary/30" : "border-muted-foreground/30"
                            )}
                          >
                            {t.imported_at ? (
                              <><FileDown className="h-2.5 w-2.5 mr-1" />Importada</>
                            ) : (
                              <><PenLine className="h-2.5 w-2.5 mr-1" />Manual</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs",
                              t.status === "completed"
                                ? "bg-income/10 text-income"
                                : "bg-primary/10 text-primary"
                            )}
                          >
                            {t.status === "completed" ? "Concluído" : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <span className={cn(
                            "font-medium",
                            t.is_refund ? "text-income" : "text-expense"
                          )}>
                            {t.is_refund ? "-" : ""}{formatCurrency(Number(t.amount))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Analysis */}
            {Math.abs(difference) > 0.01 && (
              <div className="bg-chart-4/10 rounded-lg p-4 text-sm space-y-2">
                <div className="flex items-center gap-2 font-medium text-chart-4">
                  <AlertTriangle className="h-4 w-4" />
                  Análise da Divergência
                </div>
                <p className="text-muted-foreground">
                  {difference > 0 ? (
                    <>
                      O banco mostra <strong className="text-foreground">{formatCurrency(difference)}</strong> a mais 
                      que os lançamentos registrados. Possíveis causas:
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        <li>Transações ainda não lançadas no sistema</li>
                        <li>Compras parceladas com parcelas pendentes de registro</li>
                        <li>Taxas ou encargos não registrados</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      Os lançamentos mostram <strong className="text-foreground">{formatCurrency(Math.abs(difference))}</strong> a mais 
                      que a fatura do banco. Possíveis causas:
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        <li>Transações duplicadas no sistema</li>
                        <li>Estornos não registrados</li>
                        <li>Pagamentos parciais já efetuados</li>
                      </ul>
                    </>
                  )}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="discrepancy" className="flex-1 min-h-0 mt-3 overflow-hidden">
            <ScrollArea className="h-[calc(90vh-320px)]">
              <div className="pr-4">
                <InvoiceDiscrepancyReport
                  transactions={transactions}
                  cardId={cardId}
                  cardName={cardName}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="breakdown" className="flex-1 min-h-0 mt-3">
            <ScrollArea className="h-full">
              <InvoiceBreakdownCard
                transactions={transactions}
                bankInvoice={bankInvoice}
                cardId={cardId}
              />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
