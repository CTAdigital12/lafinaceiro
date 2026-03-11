import { useState, useMemo, useCallback } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Plus,
  Trash2,
  PenLine,
  FileSpreadsheet,
  ArrowRightLeft,
  Loader2,
  RotateCcw,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTransactions } from "@/hooks/useTransactions";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  parseSpreadsheetFile,
  reconcileSpreadsheet,
  type SpreadsheetItem,
  type SystemTransaction,
  type ReconciliationResult,
} from "@/lib/spreadsheetReconciliation";
import { parseOFXWithBalance, type OFXTransaction } from "@/lib/ofxParser";

interface AccountReconciliationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  computedBalance: number;
}

function formatCurrency(value: number) {
  return `R$ ${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function AccountReconciliationModal({
  open,
  onOpenChange,
  accountId,
  accountName,
  computedBalance,
}: AccountReconciliationModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { createTransaction, deleteTransaction, updateTransaction } = useTransactions();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SystemTransaction | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [refundItems, setRefundItems] = useState<Set<number>>(new Set());
  const [ignoredKeys, setIgnoredKeys] = useState<Set<string>>(new Set());
  const [syncingBalance, setSyncingBalance] = useState(false);

  const fetchSystemTransactions = useCallback(async (minDate: string, maxDate: string): Promise<SystemTransaction[]> => {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, date, due_date, description, original_description, amount, is_refund, is_corporate_expense, category_id, status")
      .eq("account_id", accountId)
      .gte("date", minDate)
      .lte("date", maxDate);

    if (error) throw error;
    return (data || []) as SystemTransaction[];
  }, [accountId]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setResult(null);
    setBankBalance(null);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      let spreadsheetItems: SpreadsheetItem[] = [];
      let balance: number | null = null;

      if (ext === "ofx") {
        const content = await file.text();
        const ofxResult = parseOFXWithBalance(content);
        balance = ofxResult.balance;
        spreadsheetItems = ofxResult.transactions.map((tx, i) => ({
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          rowIndex: i,
        }));
      } else {
        spreadsheetItems = await parseSpreadsheetFile(file);
      }

      if (spreadsheetItems.length === 0) {
        toast({ title: "Nenhum item encontrado no arquivo", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      // Detect date range
      const dates = spreadsheetItems.map((i) => i.date).sort();
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      const systemTx = await fetchSystemTransactions(minDate, maxDate);
      const reconciliation = reconcileSpreadsheet(spreadsheetItems, systemTx);

      setResult(reconciliation);
      setBankBalance(balance);
    } catch (err: any) {
      toast({ title: "Erro ao processar arquivo", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [fetchSystemTransactions, toast]);

  const getAllSpreadsheetItems = useCallback(() => {
    if (!result) return [];
    return [
      ...(result.matched.map((m) => m.spreadsheet)),
      ...(result.valueDiscrepancies.map((d) => d.spreadsheet)),
      ...(result.onlyInSpreadsheet),
    ];
  }, [result]);

  const getDateRange = useCallback(() => {
    const allItems = getAllSpreadsheetItems();
    if (allItems.length === 0) return { minDate: "", maxDate: "" };
    const dates = allItems.map((i) => i.date).sort();
    return { minDate: dates[0], maxDate: dates[dates.length - 1] };
  }, [getAllSpreadsheetItems]);

  const handleAddTransaction = useCallback(async (item: SpreadsheetItem) => {
    if (!user) return;
    const key = `add-${item.rowIndex}`;
    setProcessingIds((prev) => new Set(prev).add(key));

    try {
      const isRefund = refundItems.has(item.rowIndex);
      await createTransaction.mutateAsync({
        description: item.description,
        amount: item.amount,
        type: isRefund ? "income" : "expense",
        date: item.date,
        account_id: accountId,
        credit_card_id: null,
        category_id: null,
        status: "completed",
        is_corporate_expense: false,
        is_refund: isRefund,
        is_reimbursable: false,
        is_card_payment: false,
        refunded_transaction_id: null,
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
        original_description: item.description,
        silent: true,
      });

      toast({ title: "Transação incluída!" });

      const { minDate, maxDate } = getDateRange();
      const systemTx = await fetchSystemTransactions(minDate, maxDate);
      const allItems = getAllSpreadsheetItems();
      setResult(reconcileSpreadsheet(allItems, systemTx));
    } catch (err: any) {
      toast({ title: "Erro ao incluir", description: err.message, variant: "destructive" });
    } finally {
      setProcessingIds((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [user, createTransaction, accountId, fetchSystemTransactions, getAllSpreadsheetItems, getDateRange, toast, refundItems]);

  const handleDeleteTransaction = useCallback(async (tx: SystemTransaction) => {
    const key = `del-${tx.id}`;
    setProcessingIds((prev) => new Set(prev).add(key));
    try {
      await deleteTransaction.mutateAsync(tx.id);
      toast({ title: "Transação excluída!" });

      const { minDate, maxDate } = getDateRange();
      const systemTx = await fetchSystemTransactions(minDate, maxDate);
      const allItems = getAllSpreadsheetItems();
      setResult(reconcileSpreadsheet(allItems, systemTx));
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setProcessingIds((prev) => { const s = new Set(prev); s.delete(key); return s; });
      setDeleteConfirm(null);
    }
  }, [deleteTransaction, fetchSystemTransactions, getAllSpreadsheetItems, getDateRange, toast]);

  const handleCorrectValue = useCallback(async (item: SpreadsheetItem, tx: SystemTransaction) => {
    const key = `fix-${tx.id}`;
    setProcessingIds((prev) => new Set(prev).add(key));
    try {
      await updateTransaction.mutateAsync({ id: tx.id, amount: item.amount });
      toast({ title: "Valor corrigido!" });

      const { minDate, maxDate } = getDateRange();
      const systemTx = await fetchSystemTransactions(minDate, maxDate);
      const allItems = getAllSpreadsheetItems();
      setResult(reconcileSpreadsheet(allItems, systemTx));
    } catch (err: any) {
      toast({ title: "Erro ao corrigir", description: err.message, variant: "destructive" });
    } finally {
      setProcessingIds((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  }, [updateTransaction, fetchSystemTransactions, getAllSpreadsheetItems, getDateRange, toast]);

  const handleSyncBalance = useCallback(async () => {
    if (bankBalance === null) return;
    setSyncingBalance(true);
    try {
      // Calculate realized_net for this account
      const today = new Date().toISOString().split("T")[0];
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("type, amount, status, is_provisional, date")
        .eq("account_id", accountId)
        .eq("status", "completed")
        .eq("is_provisional", false)
        .lte("date", today);

      if (txError) throw txError;

      let realizedNet = 0;
      for (const tx of txData || []) {
        const sign = tx.type === "income" ? 1 : -1;
        realizedNet += sign * Number(tx.amount);
      }

      const newInitialBalance = bankBalance - realizedNet;

      const { error } = await supabase
        .from("accounts")
        .update({ initial_balance: newInitialBalance })
        .eq("id", accountId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: "Saldo sincronizado com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao sincronizar saldo", description: err.message, variant: "destructive" });
    } finally {
      setSyncingBalance(false);
    }
  }, [bankBalance, accountId, queryClient, toast]);

  const tabCounts = useMemo(() => {
    if (!result) return { all: 0, matched: 0, discrepancies: 0, missing: 0, extra: 0 };
    return {
      all: result.summary.matched + result.summary.discrepancies + result.summary.missing + result.summary.extra,
      matched: result.summary.matched,
      discrepancies: result.summary.discrepancies,
      missing: result.summary.missing,
      extra: result.summary.extra,
    };
  }, [result]);

  const balanceDiff = bankBalance !== null ? bankBalance - computedBalance : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Conciliar Extrato — {accountName}
            </DialogTitle>
          </DialogHeader>

          {!result ? (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">Upload do Extrato Bancário</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Faça upload do arquivo OFX, CSV ou XLSX com os lançamentos do extrato.
                  O sistema vai comparar com as transações registradas e mostrar as diferenças.
                </p>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".ofx,.csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isLoading}
                />
                <Button asChild disabled={isLoading}>
                  <span>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    {isLoading ? "Processando..." : "Selecionar Arquivo"}
                  </span>
                </Button>
              </label>
            </div>
          ) : (
            <>
              {/* Balance comparison */}
              {bankBalance !== null && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Saldo Banco:</span>
                        <span className="font-mono font-semibold">{formatCurrency(bankBalance)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Saldo Sistema:</span>
                        <span className="font-mono font-semibold">{formatCurrency(computedBalance)}</span>
                      </div>
                      {balanceDiff !== null && Math.abs(balanceDiff) > 0.01 && (
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">Diferença:</span>
                          <span className={cn("font-mono font-semibold", balanceDiff > 0 ? "text-income" : "text-expense")}>
                            {balanceDiff > 0 ? "+" : ""}{formatCurrency(balanceDiff)}
                          </span>
                        </div>
                      )}
                    </div>
                    {balanceDiff !== null && Math.abs(balanceDiff) > 0.01 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={handleSyncBalance}
                        disabled={syncingBalance}
                      >
                        {syncingBalance ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Sincronizar Saldo
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-income/10 text-income gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {tabCounts.matched} conciliados
                </Badge>
                {tabCounts.discrepancies > 0 && (
                  <Badge variant="secondary" className="bg-chart-4/10 text-chart-4 gap-1">
                    <ArrowRightLeft className="h-3 w-3" />
                    {tabCounts.discrepancies} divergentes
                  </Badge>
                )}
                {tabCounts.missing > 0 && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
                    <Plus className="h-3 w-3" />
                    {tabCounts.missing} apenas no banco
                  </Badge>
                )}
                {tabCounts.extra > 0 && (
                  <Badge variant="secondary" className="bg-expense/10 text-expense gap-1">
                    <Trash2 className="h-3 w-3" />
                    {tabCounts.extra} apenas no sistema
                  </Badge>
                )}
              </div>

              <Tabs defaultValue="all" className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
                  <TabsTrigger value="all">Todos ({tabCounts.all})</TabsTrigger>
                  <TabsTrigger value="matched">Conciliados ({tabCounts.matched})</TabsTrigger>
                  <TabsTrigger value="discrepancies">Divergentes ({tabCounts.discrepancies})</TabsTrigger>
                  <TabsTrigger value="missing">Apenas Banco ({tabCounts.missing})</TabsTrigger>
                  <TabsTrigger value="extra">Apenas Sistema ({tabCounts.extra})</TabsTrigger>
                </TabsList>

                <ScrollArea className="mt-3 h-[calc(90vh-340px)] min-h-[250px]">
                  {["all", "matched", "discrepancies", "missing", "extra"].map((tab) => (
                    <TabsContent key={tab} value={tab} className="mt-0">
                      <AccountResultTable
                        result={result}
                        filter={tab as any}
                        processingIds={processingIds}
                        onAdd={handleAddTransaction}
                        onDelete={setDeleteConfirm}
                        onCorrect={handleCorrectValue}
                        refundItems={refundItems}
                        onToggleRefund={(rowIndex) => setRefundItems((prev) => {
                          const s = new Set(prev);
                          s.has(rowIndex) ? s.delete(rowIndex) : s.add(rowIndex);
                          return s;
                        })}
                        ignoredKeys={ignoredKeys}
                        onIgnore={(key) => setIgnoredKeys((prev) => new Set(prev).add(key))}
                      />
                    </TabsContent>
                  ))}
                </ScrollArea>
              </Tabs>

              {/* Re-upload */}
              <div className="flex justify-between items-center pt-2 border-t">
                <label className="cursor-pointer">
                  <input type="file" accept=".ofx,.csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                  <Button variant="outline" size="sm" asChild>
                    <span><Upload className="h-3 w-3 mr-1" /> Novo Arquivo</span>
                  </Button>
                </label>
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteConfirm?.description}" — {deleteConfirm && formatCurrency(Number(deleteConfirm.amount))}
              <br />Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDeleteTransaction(deleteConfirm)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Result Table ─────────────────────────────────────────────────────

interface AccountResultTableProps {
  result: ReconciliationResult;
  filter: "all" | "matched" | "discrepancies" | "missing" | "extra";
  processingIds: Set<string>;
  onAdd: (item: SpreadsheetItem) => void;
  onDelete: (tx: SystemTransaction) => void;
  onCorrect: (item: SpreadsheetItem, tx: SystemTransaction) => void;
  refundItems: Set<number>;
  onToggleRefund: (rowIndex: number) => void;
  ignoredKeys: Set<string>;
  onIgnore: (key: string) => void;
}

type RowData = {
  key: string;
  type: "matched" | "discrepancy" | "missing" | "extra";
  date: string;
  description: string;
  spreadsheetAmount?: number;
  systemAmount?: number;
  difference?: number;
  spreadsheetItem?: SpreadsheetItem;
  systemTx?: SystemTransaction;
};

function AccountResultTable({ result, filter, processingIds, onAdd, onDelete, onCorrect, refundItems, onToggleRefund, ignoredKeys, onIgnore }: AccountResultTableProps) {
  const rows = useMemo(() => {
    const all: RowData[] = [];

    if (filter === "all" || filter === "matched") {
      result.matched.forEach((m, i) => all.push({
        key: `m-${i}`,
        type: "matched",
        date: m.spreadsheet.date,
        description: m.spreadsheet.description,
        spreadsheetAmount: m.spreadsheet.amount,
        systemAmount: Number(m.transaction.amount),
        systemTx: m.transaction,
      }));
    }

    if (filter === "all" || filter === "discrepancies") {
      result.valueDiscrepancies.forEach((d, i) => all.push({
        key: `d-${i}`,
        type: "discrepancy",
        date: d.spreadsheet.date,
        description: d.spreadsheet.description,
        spreadsheetAmount: d.spreadsheet.amount,
        systemAmount: Number(d.transaction.amount),
        difference: d.difference,
        spreadsheetItem: d.spreadsheet,
        systemTx: d.transaction,
      }));
    }

    if (filter === "all" || filter === "missing") {
      result.onlyInSpreadsheet.forEach((s, i) => all.push({
        key: `s-${i}`,
        type: "missing",
        date: s.date,
        description: s.description,
        spreadsheetAmount: s.amount,
        spreadsheetItem: s,
      }));
    }

    if (filter === "all" || filter === "extra") {
      result.onlyInSystem.forEach((tx, i) => all.push({
        key: `e-${i}`,
        type: "extra",
        date: tx.date,
        description: tx.description,
        systemAmount: Number(tx.amount),
        systemTx: tx,
      }));
    }

    return all.filter((r) => !ignoredKeys.has(r.key)).sort((a, b) => a.date.localeCompare(b.date));
  }, [result, filter, ignoredKeys]);

  if (rows.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Nenhum item nesta categoria.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">Status</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead className="text-right">Extrato</TableHead>
          <TableHead className="text-right">Sistema</TableHead>
          <TableHead className="text-right w-[100px]">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <StatusBadge type={row.type} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-sm">
              {format(new Date(row.date + "T12:00:00"), "dd/MM/yyyy")}
            </TableCell>
            <TableCell className="text-sm max-w-[250px] truncate">{row.description}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {row.spreadsheetAmount !== undefined ? formatCurrency(row.spreadsheetAmount) : "—"}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {row.systemAmount !== undefined ? formatCurrency(row.systemAmount) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {(row.type === "missing" || row.type === "discrepancy") && row.spreadsheetItem && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 w-7 p-0", refundItems.has(row.spreadsheetItem.rowIndex) && "text-income bg-income/10")}
                    title={refundItems.has(row.spreadsheetItem.rowIndex) ? "Desmarcar extorno" : "Marcar como extorno"}
                    onClick={() => onToggleRefund(row.spreadsheetItem!.rowIndex)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                {row.type === "missing" && row.spreadsheetItem && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary"
                    disabled={processingIds.has(`add-${row.spreadsheetItem.rowIndex}`)}
                    onClick={() => onAdd(row.spreadsheetItem!)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Incluir
                  </Button>
                )}
                {row.type === "extra" && row.systemTx && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    disabled={processingIds.has(`del-${row.systemTx.id}`)}
                    onClick={() => onDelete(row.systemTx!)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Excluir
                  </Button>
                )}
                {row.type === "discrepancy" && row.spreadsheetItem && row.systemTx && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-chart-4"
                      disabled={processingIds.has(`fix-${row.systemTx.id}`)}
                      onClick={() => onCorrect(row.spreadsheetItem!, row.systemTx!)}
                    >
                      <PenLine className="h-3 w-3 mr-1" /> Corrigir
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-primary"
                      disabled={processingIds.has(`add-${row.spreadsheetItem.rowIndex}`)}
                      onClick={() => onAdd(row.spreadsheetItem!)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Incluir
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => onIgnore(row.key)}
                    >
                      <EyeOff className="h-3 w-3 mr-1" /> Ignorar
                    </Button>
                  </>
                )}
                {row.type === "matched" && (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ type }: { type: RowData["type"] }) {
  switch (type) {
    case "matched":
      return <CheckCircle className="h-4 w-4 text-income" />;
    case "discrepancy":
      return <ArrowRightLeft className="h-4 w-4 text-chart-4" />;
    case "missing":
      return <Plus className="h-4 w-4 text-primary" />;
    case "extra":
      return <AlertTriangle className="h-4 w-4 text-expense" />;
  }
}
