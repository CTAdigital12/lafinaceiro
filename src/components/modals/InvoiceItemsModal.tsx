import { useState, useMemo, useEffect } from "react";
import { Building2, User, Check, RefreshCw, SplitSquareHorizontal } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { ptBR } from "date-fns/locale";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { ListSortButtons } from "@/components/ui/list-sort-buttons";
import { SplitTransactionModal } from "@/components/modals/SplitTransactionModal";
import { cn } from "@/lib/utils";
import type { InvoiceTransaction } from "@/hooks/useInvoiceTransactions";
import { formatYmd } from "@/lib/dateUtils";

interface InvoiceItemsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: InvoiceTransaction[];
  selectedItems: string[];
  onConfirm: (selectedIds: string[]) => void;
}

export function InvoiceItemsModal({
  open,
  onOpenChange,
  transactions,
  selectedItems,
  onConfirm,
}: InvoiceItemsModalProps) {
  const formatCurrency = useFormatCurrency();
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedItems));
  const [splitTransactionId, setSplitTransactionId] = useState<string | null>(null);

  // Reset selection when modal opens
  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedItems));
    }
  }, [open, selectedItems]);

  const toggleItem = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((t) => t.id)));
    }
  };

  const { corporateSelected, reimbursableSelected, personalSelected, myTotalSelected, totalSelected } = useMemo(() => {
    const selectedTxs = transactions.filter((t) => selected.has(t.id));
    const corporate = selectedTxs
      .filter((t) => t.is_corporate_expense && !t.is_refund)
      .reduce((sum, t) => sum + t.amount, 0);
    const reimbursable = selectedTxs
      .filter((t) => t.is_reimbursable && !t.is_corporate_expense && !t.is_refund)
      .reduce((sum, t) => sum + t.amount, 0);
    const personal = selectedTxs
      .filter((t) => !t.is_corporate_expense && !t.is_reimbursable && !t.is_refund)
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      corporateSelected: corporate,
      reimbursableSelected: reimbursable,
      personalSelected: personal,
      myTotalSelected: reimbursable + personal,
      totalSelected: corporate + reimbursable + personal,
    };
  }, [transactions, selected]);

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onOpenChange(false);
  };

  // Busca + ordenação globais; as 3 seções derivam da lista já processada.
  const { query, setQuery, sort, toggleSort, items: filteredTx } = useListSearchSort(transactions, {
    searchAccessors: [(t) => t.description, (t) => t.category_name],
    sortAccessors: {
      date: (t) => new Date(t.date),
      description: (t) => t.description,
      amount: (t) => Number(t.amount),
    },
    initialSort: { field: "date", direction: "desc" },
  });

  // Separate transactions by type (3 categories now)
  const corporateTransactions = filteredTx.filter((t) => t.is_corporate_expense);
  const reimbursableTransactions = filteredTx.filter((t) => t.is_reimbursable && !t.is_corporate_expense);
  const personalTransactions = filteredTx.filter((t) => !t.is_corporate_expense && !t.is_reimbursable);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="📋 Revisar Itens da Fatura"
      className="sm:max-w-lg"
    >

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Marque os itens que serão incluídos no pagamento de hoje:
          </p>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selected.size === transactions.length ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selected.size} de {transactions.length} selecionados
            </span>
          </div>

          {transactions.length > 0 && (
            <div className="flex flex-col gap-2">
              <ListSearchInput value={query} onChange={setQuery} placeholder="Buscar por descrição ou categoria..." />
              <ListSortButtons
                options={[
                  { key: "date", label: "Data" },
                  { key: "description", label: "Descrição" },
                  { key: "amount", label: "Valor" },
                ]}
                activeField={sort.field}
                direction={sort.direction}
                onSort={toggleSort}
              />
            </div>
          )}

          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {filteredTx.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">Nenhum item corresponde à busca.</p>
              )}
              {/* Corporate Transactions */}
              {corporateTransactions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Gastos Corporativos
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {corporateTransactions.length}
                    </Badge>
                  </h4>
                  <div className="space-y-1">
                    {corporateTransactions.map((tx) => (
                      <TransactionItem
                        key={tx.id}
                        transaction={tx}
                        isSelected={selected.has(tx.id)}
                        onToggle={() => toggleItem(tx.id)}
                        onSplit={() => setSplitTransactionId(tx.id)}
                        typeIcon="corporate"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Reimbursable Transactions */}
              {reimbursableTransactions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    Compras Reembolsáveis
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {reimbursableTransactions.length}
                    </Badge>
                  </h4>
                  <div className="space-y-1">
                    {reimbursableTransactions.map((tx) => (
                      <TransactionItem
                        key={tx.id}
                        transaction={tx}
                        isSelected={selected.has(tx.id)}
                        onToggle={() => toggleItem(tx.id)}
                        onSplit={() => setSplitTransactionId(tx.id)}
                        typeIcon="reimbursable"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Personal Transactions */}
              {personalTransactions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Gastos Pessoais
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {personalTransactions.length}
                    </Badge>
                  </h4>
                  <div className="space-y-1">
                    {personalTransactions.map((tx) => (
                      <TransactionItem
                        key={tx.id}
                        transaction={tx}
                        isSelected={selected.has(tx.id)}
                        onToggle={() => toggleItem(tx.id)}
                        onSplit={() => setSplitTransactionId(tx.id)}
                        typeIcon="personal"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <Separator />

          {/* Summary */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Corporativo
              </span>
              <span className="font-medium">{formatCurrency(corporateSelected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Reembolsáveis
              </span>
              <span className="font-medium">{formatCurrency(reimbursableSelected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> Pessoais
              </span>
              <span className="font-medium">{formatCurrency(personalSelected)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="font-medium">💰 Meu Total a Pagar</span>
              <span className="font-bold text-primary">{formatCurrency(myTotalSelected)}</span>
            </div>
            <p className="text-xs text-muted-foreground">(Reembolsáveis + Pessoais)</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="h-4 w-4 mr-2" />
            Aplicar Seleção
          </Button>
        </div>

        {/* Dividir um item da fatura entre categorias (parte reembolsável de
            um gasto compartilhado, por exemplo) sem sair da revisão. */}
        <SplitTransactionModal
          open={!!splitTransactionId}
          onOpenChange={(isOpen) => !isOpen && setSplitTransactionId(null)}
          transactionId={splitTransactionId}
        />
    </ResponsiveDialog>
  );
}

function TransactionItem({
  transaction,
  isSelected,
  onToggle,
  onSplit,
  typeIcon,
}: {
  transaction: InvoiceTransaction;
  isSelected: boolean;
  onToggle: () => void;
  onSplit: () => void;
  typeIcon: "corporate" | "reimbursable" | "personal";
}) {
  const formatCurrency = useFormatCurrency();
  const icons = {
    corporate: <Building2 className="h-3 w-3 text-muted-foreground" />,
    reimbursable: <RefreshCw className="h-3 w-3 text-amber-500" />,
    personal: <User className="h-3 w-3 text-primary" />,
  };

  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
      onClick={onToggle}
    >
      <Checkbox checked={isSelected} onCheckedChange={onToggle} />
      <div className="flex items-center gap-1.5">
        {icons[typeIcon]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{transaction.description}</p>
        <p className="text-xs text-muted-foreground">
          {formatYmd(transaction.date, "dd/MM", { locale: ptBR })}
          {transaction.category_icon && ` • ${transaction.category_icon}`}
          {transaction.category_name && ` ${transaction.category_name}`}
        </p>
      </div>
      <span
        className={`text-sm font-medium ${
          transaction.is_refund ? "text-green-600" : ""
        }`}
      >
        {transaction.is_refund ? "-" : ""}
        {formatCurrency(transaction.amount)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        title={transaction.split_group_id ? "Ver / editar divisão" : "Dividir em categorias"}
        onClick={(e) => {
          e.stopPropagation();
          onSplit();
        }}
      >
        <SplitSquareHorizontal
          className={cn(
            "h-3.5 w-3.5",
            transaction.split_group_id ? "text-violet-600" : "text-muted-foreground",
          )}
        />
      </Button>
    </div>
  );
}
