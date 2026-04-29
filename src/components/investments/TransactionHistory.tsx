import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { InvestmentTransaction, InvestmentAsset } from "@/hooks/useInvestments";
import { cn } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface TransactionHistoryProps {
  transactions: (InvestmentTransaction & { asset: InvestmentAsset })[];
}

const TYPE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venda",
  dividend: "Dividendo",
};

const TYPE_COLORS: Record<string, string> = {
  buy: "bg-blue-500/10 text-blue-500",
  sell: "bg-red-500/10 text-red-500",
  dividend: "bg-emerald-500/10 text-emerald-500",
};

export function TransactionHistory({ transactions }: TransactionHistoryProps) {
  const formatCurrency = useFormatCurrency();

  const formatNumber = (value: number) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(value);

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
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 50).map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        {format(new Date(tx.date), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("font-medium", TYPE_COLORS[tx.type])}>
                          {TYPE_LABELS[tx.type]}
                        </Badge>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {transactions.slice(0, 50).map((tx) => (
                <div key={tx.id} className="border border-border/50 rounded-lg p-3 bg-background/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("font-medium text-xs", TYPE_COLORS[tx.type])}>
                        {TYPE_LABELS[tx.type]}
                      </Badge>
                      <span className="font-medium">{tx.asset?.ticker || "—"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(tx.date), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
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
      </CardContent>
    </Card>
  );
}
