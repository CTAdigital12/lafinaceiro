import { useState, useMemo } from "react";
import { Building2, User, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { InvoiceTransaction } from "@/hooks/useInvoiceTransactions";

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
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedItems));

  // Reset selection when modal opens
  useState(() => {
    if (open) {
      setSelected(new Set(selectedItems));
    }
  });

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

  const { corporateSelected, personalSelected, totalSelected } = useMemo(() => {
    const selectedTxs = transactions.filter((t) => selected.has(t.id));
    const corporate = selectedTxs
      .filter((t) => t.is_corporate_expense && !t.is_refund)
      .reduce((sum, t) => sum + t.amount, 0);
    const personal = selectedTxs
      .filter((t) => !t.is_corporate_expense && !t.is_refund)
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      corporateSelected: corporate,
      personalSelected: personal,
      totalSelected: corporate + personal,
    };
  }, [transactions, selected]);

  const handleConfirm = () => {
    onConfirm(Array.from(selected));
    onOpenChange(false);
  };

  // Separate transactions by type
  const corporateTransactions = transactions.filter((t) => t.is_corporate_expense);
  const personalTransactions = transactions.filter((t) => !t.is_corporate_expense);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📋 Revisar Itens da Fatura
          </DialogTitle>
        </DialogHeader>

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

          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-4">
              {/* Corporate Transactions */}
              {corporateTransactions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Gastos Corporativos
                  </h4>
                  <div className="space-y-1">
                    {corporateTransactions.map((tx) => (
                      <TransactionItem
                        key={tx.id}
                        transaction={tx}
                        isSelected={selected.has(tx.id)}
                        onToggle={() => toggleItem(tx.id)}
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
                  </h4>
                  <div className="space-y-1">
                    {personalTransactions.map((tx) => (
                      <TransactionItem
                        key={tx.id}
                        transaction={tx}
                        isSelected={selected.has(tx.id)}
                        onToggle={() => toggleItem(tx.id)}
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
              <span className="text-muted-foreground">Corporativo Selecionado</span>
              <span className="font-medium">{formatCurrency(corporateSelected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pessoal Selecionado</span>
              <span className="font-medium">{formatCurrency(personalSelected)}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="font-medium">Total Selecionado</span>
              <span className="font-bold text-primary">{formatCurrency(totalSelected)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="h-4 w-4 mr-2" />
            Aplicar Seleção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransactionItem({
  transaction,
  isSelected,
  onToggle,
}: {
  transaction: InvoiceTransaction;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
      onClick={onToggle}
    >
      <Checkbox checked={isSelected} onCheckedChange={onToggle} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{transaction.description}</p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(transaction.date), "dd/MM", { locale: ptBR })}
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
    </div>
  );
}
