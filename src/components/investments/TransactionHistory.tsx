import { format } from "date-fns";
import { Link as LinkIcon, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InvestmentTransaction, InvestmentAsset } from "@/hooks/useInvestments";
import { cn } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import { SortableHead } from "@/components/ui/sortable-header";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { formatDateBR } from "@/lib/dateUtils";

type InvestmentTx = InvestmentTransaction & { asset: InvestmentAsset };

interface TransactionHistoryProps {
  transactions: InvestmentTx[];
  onEdit: (tx: InvestmentTx) => void;
  onDelete: (tx: InvestmentTx) => void;
}

function RowActionsMenu({
  tx,
  onEdit,
  onDelete,
  size = "default",
}: {
  tx: InvestmentTx;
  onEdit: (tx: InvestmentTx) => void;
  onDelete: (tx: InvestmentTx) => void;
  size?: "default" | "sm";
}) {
  const triggerClass = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(triggerClass, "flex-shrink-0")}
          aria-label="Ações"
        >
          <MoreVertical className={iconClass} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} collisionPadding={16} className="w-40">
        <DropdownMenuItem onClick={() => onEdit(tx)}>
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(tx)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TYPE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venda / Resgate",
  dividend: "Dividendo",
};

const TYPE_COLORS: Record<string, string> = {
  buy: "bg-blue-500/10 text-blue-500",
  sell: "bg-red-500/10 text-red-500",
  dividend: "bg-emerald-500/10 text-emerald-500",
};

/**
 * Badge mostrado quando a operação está vinculada a uma `transactions` na
 * conta corrente (via `linked_transaction_id`). Aplica-se a compras com
 * despesa e a vendas/resgates com receita.
 */
function LinkedBadge() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="font-medium text-xs gap-1 bg-blue-500/5 text-blue-500/90 border-blue-500/30"
            aria-label="Vinculada a uma transação na conta corrente"
          >
            <LinkIcon className="h-3 w-3" aria-hidden />
            vinculado
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          Esta operação está vinculada a uma transação na conta corrente.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function TransactionHistory({ transactions, onEdit, onDelete }: TransactionHistoryProps) {
  const formatCurrency = useFormatCurrency();

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(value);

  const { query, setQuery, sort, toggleSort, items: processed } = useListSearchSort(transactions, {
    searchAccessors: [
      (t) => t.asset?.ticker,
      (t) => t.asset?.name,
      (t) => TYPE_LABELS[t.type],
    ],
    sortAccessors: {
      date: (t) => new Date(t.date),
      type: (t) => TYPE_LABELS[t.type] ?? t.type,
      ticker: (t) => t.asset?.ticker ?? "",
      quantity: (t) => Number(t.quantity),
      price: (t) => Number(t.unit_price),
      total: (t) => Number(t.total_value),
      profit: (t) => Number(t.realized_profit ?? 0),
    },
    initialSort: { field: "date", direction: "desc" },
  });
  const visible = processed.slice(0, 50);

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-lg">Extrato de Movimentações</CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Nenhuma movimentação registrada.</p>
          </div>
        ) : (
          <>
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Buscar por ativo ou tipo..."
              className="mb-3 max-w-xs"
            />
            {visible.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma movimentação corresponde à busca.</p>
            ) : (
              <>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead field="date" label="Data" activeField={sort.field} direction={sort.direction} onSort={toggleSort} />
                    <SortableHead field="type" label="Tipo" activeField={sort.field} direction={sort.direction} onSort={toggleSort} />
                    <SortableHead field="ticker" label="Ativo" activeField={sort.field} direction={sort.direction} onSort={toggleSort} />
                    <SortableHead field="quantity" label="Qtd" activeField={sort.field} direction={sort.direction} onSort={toggleSort} className="text-right" align="right" />
                    <SortableHead field="price" label="Preço" activeField={sort.field} direction={sort.direction} onSort={toggleSort} className="text-right" align="right" />
                    <SortableHead field="total" label="Total" activeField={sort.field} direction={sort.direction} onSort={toggleSort} className="text-right" align="right" />
                    <SortableHead field="profit" label="Lucro" activeField={sort.field} direction={sort.direction} onSort={toggleSort} className="text-right" align="right" />
                    <TableHead className="w-[48px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        {formatDateBR(tx.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={cn("font-medium", TYPE_COLORS[tx.type])}>
                            {TYPE_LABELS[tx.type]}
                          </Badge>
                          {tx.linked_transaction_id && <LinkedBadge />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{tx.asset?.ticker || "—"}</span>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(tx.quantity)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(tx.unit_price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(tx.total_value)}</TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        tx.realized_profit && tx.realized_profit > 0 ? "text-emerald-500" :
                        tx.realized_profit && tx.realized_profit < 0 ? "text-red-500" : ""
                      )}>
                        {tx.realized_profit ? formatCurrency(tx.realized_profit) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActionsMenu tx={tx} onEdit={onEdit} onDelete={onDelete} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {visible.map((tx) => (
                <div key={tx.id} className="border border-border/50 rounded-lg p-3 bg-background/50">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <Badge variant="outline" className={cn("font-medium text-xs", TYPE_COLORS[tx.type])}>
                        {TYPE_LABELS[tx.type]}
                      </Badge>
                      {tx.linked_transaction_id && <LinkedBadge />}
                      <span className="font-medium truncate">{tx.asset?.ticker || "—"}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateBR(tx.date)}
                      </span>
                      <RowActionsMenu tx={tx} onEdit={onEdit} onDelete={onDelete} size="sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Qtd × Preço</p>
                      <p>{formatNumber(tx.quantity)} × {formatCurrency(tx.unit_price)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-medium">{formatCurrency(tx.total_value)}</p>
                    </div>
                  </div>
                  {tx.realized_profit && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Lucro</span>
                      <span className={cn(
                        "font-medium",
                        tx.realized_profit > 0 ? "text-emerald-500" : "text-red-500"
                      )}>
                        {formatCurrency(tx.realized_profit)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
              </>
            )}
            {processed.length > 50 && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Mostrando 50 de {processed.length} movimentações — use a busca para refinar.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
