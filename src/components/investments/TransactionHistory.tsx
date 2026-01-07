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
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

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
        )}
      </CardContent>
    </Card>
  );
}
