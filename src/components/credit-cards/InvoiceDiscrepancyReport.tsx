import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-header";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Briefcase,
  User,
  FileDown,
  PenLine,
  RotateCcw,
  CreditCard,
  Download,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  category?: { name: string; icon: string } | null;
}

interface InvoiceDiscrepancyReportProps {
  transactions: Transaction[];
  cardId: string;
  cardName: string;
}

import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { formatDateBR } from "@/lib/dateUtils";

export function InvoiceDiscrepancyReport({
  transactions,
  cardId,
  cardName,
}: InvoiceDiscrepancyReportProps) {
  const fmt = useFormatCurrency();
  const formatCurrency = (value: number) => fmt(Math.abs(value));
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const analysis = useMemo(() => {
    const cardTx = transactions.filter((t) => t.credit_card_id === cardId);
    
    // Separate payments from expenses
    const payments = cardTx.filter((t) => t.is_card_payment === true);
    const expenses = cardTx.filter((t) => t.is_card_payment !== true);
    
    // Completed expenses
    const completedExpenses = expenses.filter((t) => t.status === "completed");
    const normalExpenses = completedExpenses.filter((t) => !t.is_refund);
    const refunds = completedExpenses.filter((t) => t.is_refund);
    
    // Gross totals (before refunds)
    const grossTotal = normalExpenses.reduce((s, t) => s + Number(t.amount), 0);
    const refundTotal = refunds.reduce((s, t) => s + Number(t.amount), 0);
    const netTotal = grossTotal - refundTotal;
    
    // Corporate breakdown
    const corporateGross = normalExpenses
      .filter((t) => t.is_corporate_expense)
      .reduce((s, t) => s + Number(t.amount), 0);
    const corporateRefunds = refunds
      .filter((t) => t.is_corporate_expense)
      .reduce((s, t) => s + Number(t.amount), 0);
    const corporateNet = corporateGross - corporateRefunds;
    
    // Personal breakdown
    const personalGross = normalExpenses
      .filter((t) => !t.is_corporate_expense)
      .reduce((s, t) => s + Number(t.amount), 0);
    const personalRefunds = refunds
      .filter((t) => !t.is_corporate_expense)
      .reduce((s, t) => s + Number(t.amount), 0);
    const personalNet = personalGross - personalRefunds;
    
    // Payments breakdown
    const corporatePayments = payments
      .filter((t) => t.is_corporate_expense)
      .reduce((s, t) => s + Number(t.amount), 0);
    const personalPayments = payments
      .filter((t) => !t.is_corporate_expense)
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalPayments = corporatePayments + personalPayments;
    
    // Differences
    const corporateDiff = corporatePayments - corporateNet;
    const personalDiff = personalPayments - personalNet;
    const totalDiff = totalPayments - netTotal;
    
    return {
      // Gross values
      grossTotal,
      grossCount: normalExpenses.length,
      refundTotal,
      refundCount: refunds.length,
      netTotal,
      
      // Corporate
      corporateGross,
      corporateRefunds,
      corporateNet,
      corporatePayments,
      corporateDiff,
      corporateExpenseCount: normalExpenses.filter((t) => t.is_corporate_expense).length,
      
      // Personal
      personalGross,
      personalRefunds,
      personalNet,
      personalPayments,
      personalDiff,
      personalExpenseCount: normalExpenses.filter((t) => !t.is_corporate_expense).length,
      
      // Payments
      totalPayments,
      paymentCount: payments.length,
      
      // Total difference
      totalDiff,
      
      // Raw data
      expenses: normalExpenses,
      refunds,
      payments,
    };
  }, [transactions, cardId]);

  const baseExpenses = useMemo(() => {
    return analysis.expenses.filter((t) => {
      if (typeFilter === "corporate" && !t.is_corporate_expense) return false;
      if (typeFilter === "personal" && t.is_corporate_expense) return false;
      if (typeFilter === "imported" && !t.imported_at) return false;
      if (typeFilter === "manual" && t.imported_at) return false;
      if (search) {
        return t.description.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [analysis.expenses, search, typeFilter]);

  // Ordenação sobre a lista já filtrada (busca + tipo). Default mantém Valor desc.
  const { sort, toggleSort, items: filteredExpenses } = useListSearchSort(baseExpenses, {
    sortAccessors: {
      date: (t) => new Date(t.date),
      description: (t) => t.description,
      amount: (t) => Number(t.amount),
    },
    initialSort: { field: "amount", direction: "desc" },
  });

  const exportCSV = () => {
    const headers = ["Data", "Descrição", "Valor", "Tipo", "Origem"];
    const rows = [
      ...analysis.expenses.map((t) => [
        formatDateBR(t.date),
        t.description,
        t.amount.toString(),
        t.is_corporate_expense ? "Corporativo" : "Pessoal",
        t.imported_at ? "Importada" : "Manual",
      ]),
      ...analysis.refunds.map((t) => [
        formatDateBR(t.date),
        `[ESTORNO] ${t.description}`,
        `-${t.amount}`,
        t.is_corporate_expense ? "Corporativo" : "Pessoal",
        t.imported_at ? "Importada" : "Manual",
      ]),
    ];

    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-divergencia-${cardName.toLowerCase().replace(/\s+/g, "-")}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Resumo Geral */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Comparativo: Despesas vs Pagamentos
          </CardTitle>
          <CardDescription>
            Análise detalhada das transações registradas versus pagamentos realizados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Despesas */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Despesas Brutas (sistema)</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {analysis.grossCount} trans
                </Badge>
                <span className="font-mono font-medium">{formatCurrency(analysis.grossTotal)}</span>
              </div>
            </div>
            {analysis.refundCount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" />
                  Estornos (deduzidos)
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {analysis.refundCount} trans
                  </Badge>
                  <span className="font-mono font-medium text-income">-{formatCurrency(analysis.refundTotal)}</span>
                </div>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between items-center text-sm font-medium">
              <span>Total Líquido (sistema)</span>
              <span className="font-mono">{formatCurrency(analysis.netTotal)}</span>
            </div>
          </div>

          {/* Pagamentos */}
          <div className="space-y-2 pt-2 border-t">
            <div className="text-sm text-muted-foreground">Pagamentos Realizados</div>
            <div className="flex justify-between items-center text-sm pl-4">
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3" />
                Corporativo
              </span>
              <span className="font-mono">{formatCurrency(analysis.corporatePayments)}</span>
            </div>
            <div className="flex justify-between items-center text-sm pl-4">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Pessoal
              </span>
              <span className="font-mono">{formatCurrency(analysis.personalPayments)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center text-sm font-medium">
              <span>Total Pagamentos</span>
              <span className="font-mono">{formatCurrency(analysis.totalPayments)}</span>
            </div>
          </div>

          {/* Diferença Total */}
          <div className={cn(
            "rounded-lg p-3 flex justify-between items-center",
            Math.abs(analysis.totalDiff) > 0.01 ? "bg-chart-4/10" : "bg-income/10"
          )}>
            <span className="font-medium flex items-center gap-2">
              {Math.abs(analysis.totalDiff) > 0.01 ? (
                <AlertTriangle className="h-4 w-4 text-chart-4" />
              ) : (
                <CheckCircle className="h-4 w-4 text-income" />
              )}
              DIFERENÇA (Pagamentos - Sistema)
            </span>
            <span className={cn(
              "font-mono font-bold text-lg",
              Math.abs(analysis.totalDiff) > 0.01 ? "text-chart-4" : "text-income"
            )}>
              {analysis.totalDiff >= 0 ? "+" : "-"}{formatCurrency(analysis.totalDiff)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Detalhamento por Tipo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalhamento por Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Corporativo */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium">
                <Briefcase className="h-4 w-4" />
                Corporativo
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Despesas brutas</span>
                  <span className="font-mono">{formatCurrency(analysis.corporateGross)}</span>
                </div>
                {analysis.corporateRefunds > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estornos</span>
                    <span className="font-mono text-income">-{formatCurrency(analysis.corporateRefunds)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t pt-1.5">
                  <span>Líquido corporativo</span>
                  <span className="font-mono">{formatCurrency(analysis.corporateNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pagamento empresa</span>
                  <span className="font-mono">{formatCurrency(analysis.corporatePayments)}</span>
                </div>
                <div className={cn(
                  "flex justify-between items-center pt-1.5 border-t",
                  Math.abs(analysis.corporateDiff) > 0.01 && analysis.corporateDiff < 0 ? "text-chart-4" : "text-income"
                )}>
                  <span className="flex items-center gap-1">
                    {analysis.corporateDiff >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    Diferença
                  </span>
                  <span className="font-mono font-medium">
                    {analysis.corporateDiff >= 0 ? "+" : ""}{formatCurrency(analysis.corporateDiff)}
                  </span>
                </div>
              </div>
            </div>

            {/* Pessoal */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 font-medium">
                <User className="h-4 w-4" />
                Pessoal
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Despesas brutas</span>
                  <span className="font-mono">{formatCurrency(analysis.personalGross)}</span>
                </div>
                {analysis.personalRefunds > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estornos</span>
                    <span className="font-mono text-income">-{formatCurrency(analysis.personalRefunds)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium border-t pt-1.5">
                  <span>Líquido pessoal</span>
                  <span className="font-mono">{formatCurrency(analysis.personalNet)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pagamento pessoal</span>
                  <span className="font-mono">{formatCurrency(analysis.personalPayments)}</span>
                </div>
                <div className={cn(
                  "flex justify-between items-center pt-1.5 border-t",
                  Math.abs(analysis.personalDiff) > 0.01 ? "text-chart-4" : "text-income"
                )}>
                  <span className="flex items-center gap-1">
                    {analysis.personalDiff >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    Diferença
                  </span>
                  <span className="font-mono font-medium">
                    {analysis.personalDiff >= 0 ? "+" : ""}{formatCurrency(analysis.personalDiff)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Soma das diferenças */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg flex justify-between items-center">
            <span className="text-sm font-medium">Soma das Diferenças</span>
            <span className={cn(
              "font-mono font-bold",
              Math.abs(analysis.totalDiff) > 0.01 ? "text-chart-4" : "text-income"
            )}>
              {analysis.totalDiff >= 0 ? "+" : ""}{formatCurrency(analysis.totalDiff)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Investigação */}
      {Math.abs(analysis.totalDiff) > 0.01 && (
        <Card className="border-chart-4/30 bg-chart-4/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-chart-4">
              <AlertTriangle className="h-4 w-4" />
              Investigação da Diferença
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {analysis.totalDiff > 0 ? (
              <>
                <p>
                  Os pagamentos ({formatCurrency(analysis.totalPayments)}) estão <strong>{formatCurrency(analysis.totalDiff)}</strong> maiores
                  que as despesas registradas ({formatCurrency(analysis.netTotal)}). Isso significa:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Há <strong className="text-foreground">{formatCurrency(Math.abs(analysis.totalDiff))}</strong> em despesas faltando no sistema</li>
                  <li>Ou transações foram mal categorizadas (pessoal vs corporativo)</li>
                  <li>Ou os valores de pagamento estão incorretos</li>
                </ul>
                {analysis.personalDiff > 0 && (
                  <div className="p-2 bg-background rounded border">
                    <span className="font-medium">💡 Foco da investigação:</span> O pagamento pessoal 
                    ({formatCurrency(analysis.personalPayments)}) está {formatCurrency(analysis.personalDiff)} maior 
                    que as despesas pessoais líquidas ({formatCurrency(analysis.personalNet)}).
                  </div>
                )}
              </>
            ) : (
              <>
                <p>
                  As despesas ({formatCurrency(analysis.netTotal)}) estão <strong>{formatCurrency(Math.abs(analysis.totalDiff))}</strong> maiores
                  que os pagamentos ({formatCurrency(analysis.totalPayments)}). Isso significa:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Há despesas que ainda não foram pagas</li>
                  <li>Ou pagamentos não foram registrados</li>
                  <li>Ou valores de pagamento estão incorretos</li>
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lista de Despesas */}
      <Collapsible open={expensesOpen} onOpenChange={setExpensesOpen}>
        <Card>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <CardTitle className="text-base flex items-center gap-2">
                  {expensesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Lista de Despesas ({analysis.grossCount} transações)
                </CardTitle>
                <Badge variant="secondary">{formatCurrency(analysis.grossTotal)}</Badge>
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="personal">Pessoal</SelectItem>
                    <SelectItem value="corporate">Corporativo</SelectItem>
                    <SelectItem value="imported">Importadas</SelectItem>
                    <SelectItem value="manual">Manuais</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={exportCSV} title="Exportar CSV">
                  <Download className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead field="date" label="Data" activeField={sort.field} direction={sort.direction} onSort={toggleSort} />
                      <SortableHead field="description" label="Descrição" activeField={sort.field} direction={sort.direction} onSort={toggleSort} />
                      <TableHead>Tipo</TableHead>
                      <TableHead>Origem</TableHead>
                      <SortableHead field="amount" label="Valor" activeField={sort.field} direction={sort.direction} onSort={toggleSort} className="text-right" align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhuma despesa encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredExpenses.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDateBR(t.date)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {t.category?.icon && <span className="text-sm">{t.category.icon}</span>}
                              <span className="truncate max-w-[200px]">{t.description}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {t.is_corporate_expense ? (
                                <><Briefcase className="h-2.5 w-2.5 mr-1" />Empresa</>
                              ) : (
                                <><User className="h-2.5 w-2.5 mr-1" />Pessoal</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {t.imported_at ? (
                                <><FileDown className="h-2.5 w-2.5 mr-1" />Imp</>
                              ) : (
                                <><PenLine className="h-2.5 w-2.5 mr-1" />Man</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-expense">
                            {formatCurrency(Number(t.amount))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Lista de Pagamentos */}
      <Collapsible open={paymentsOpen} onOpenChange={setPaymentsOpen}>
        <Card>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <CardTitle className="text-base flex items-center gap-2">
                  {paymentsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Pagamentos Realizados ({analysis.paymentCount} transações)
                </CardTitle>
                <Badge variant="secondary">{formatCurrency(analysis.totalPayments)}</Badge>
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhum pagamento registrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      analysis.payments.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDateBR(t.date)}
                          </TableCell>
                          <TableCell>{t.description}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {t.is_corporate_expense ? (
                                <><Briefcase className="h-2.5 w-2.5 mr-1" />Empresa</>
                              ) : (
                                <><User className="h-2.5 w-2.5 mr-1" />Pessoal</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-income">
                            {formatCurrency(Number(t.amount))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Resumo Final */}
      {analysis.refundCount > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-income" />
              Estornos ({analysis.refundCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[150px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.refunds.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateBR(t.date)}
                      </TableCell>
                      <TableCell>{t.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {t.is_corporate_expense ? "Empresa" : "Pessoal"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-income">
                        -{formatCurrency(Number(t.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
