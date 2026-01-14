import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: string;
}

interface CategoryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  categoryColor: string;
  totalAmount: number;
  transactions: Transaction[];
}

export function CategoryDetailSheet({
  open,
  onOpenChange,
  categoryName,
  categoryColor,
  totalAmount,
  transactions,
}: CategoryDetailSheetProps) {
  const isMobile = useIsMobile();

  const content = (
    <>
      <div className="flex items-center gap-3 mb-6">
        <span 
          className="w-4 h-4 rounded-full shrink-0" 
          style={{ backgroundColor: categoryColor }}
        />
        <div>
          <p className="text-2xl font-bold text-foreground">
            R$ {totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-muted-foreground">
            {transactions.length} {transactions.length === 1 ? "transação" : "transações"}
          </p>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-200px)] md:h-[calc(100vh-180px)]">
        <div className="space-y-1 pr-4">
          {transactions.map((transaction) => (
            <div 
              key={transaction.id}
              className="flex items-center justify-between py-3 border-b border-border last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {transaction.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(transaction.date), "dd MMM yyyy", { locale: ptBR })}
                </p>
              </div>
              <p className={`text-sm font-medium shrink-0 ml-3 ${
                transaction.type === "income" ? "text-income" : "text-expense"
              }`}>
                {transaction.type === "income" ? "+" : "-"} R$ {transaction.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          ))}

          {transactions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma transação encontrada
            </p>
          )}
        </div>
      </ScrollArea>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{categoryName}</DrawerTitle>
            <DrawerDescription>Detalhes das transações</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[450px]">
        <SheetHeader>
          <SheetTitle>{categoryName}</SheetTitle>
          <SheetDescription>Detalhes das transações</SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          {content}
        </div>
      </SheetContent>
    </Sheet>
  );
}
