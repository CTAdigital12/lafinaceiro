import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CategorySelector } from "@/components/CategorySelector";
import { useTransactions } from "@/hooks/useTransactions";

interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: string;
  category_id?: string;
}

interface CategoryData {
  name: string;
  value: number;
  color: string;
  id?: string;
}

interface CategoryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  categoryColor: string;
  totalAmount: number;
  transactions: Transaction[];
  allCategories?: CategoryData[];
  onCategoryChange?: (category: CategoryData) => void;
  categoryType?: "expense" | "income";
}

export function CategoryDetailSheet({
  open,
  onOpenChange,
  categoryName,
  categoryColor,
  totalAmount,
  transactions,
  allCategories = [],
  onCategoryChange,
  categoryType = "expense",
}: CategoryDetailSheetProps) {
  const isMobile = useIsMobile();
  const { updateTransaction } = useTransactions();
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  const currentIndex = allCategories.findIndex(cat => cat.name === categoryName);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < allCategories.length - 1 && currentIndex >= 0;

  const handlePrev = () => {
    if (canGoPrev && onCategoryChange) {
      onCategoryChange(allCategories[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (canGoNext && onCategoryChange) {
      onCategoryChange(allCategories[currentIndex + 1]);
    }
  };

  const handleCategoryUpdate = async (transactionId: string, newCategoryId: string) => {
    try {
      await updateTransaction.mutateAsync({
        id: transactionId,
        category_id: newCategoryId,
      });
      setEditingTransactionId(null);
    } catch (error) {
      console.error("Erro ao atualizar categoria:", error);
    }
  };

  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrev}
        disabled={!canGoPrev}
        className="h-8 w-8"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <div className="flex items-center gap-2 flex-1 justify-center min-w-0 px-2">
        <span 
          className="w-3 h-3 rounded-full shrink-0" 
          style={{ backgroundColor: categoryColor }}
        />
        <span className="font-semibold text-foreground truncate">{categoryName}</span>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={handleNext}
        disabled={!canGoNext}
        className="h-8 w-8"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  const content = (
    <>
      <div className="flex items-center gap-3 mb-6">
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
              className="flex items-center justify-between py-3 border-b border-border last:border-0 gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {transaction.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(transaction.date), "dd MMM yyyy", { locale: ptBR })}
                </p>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                <p className={`text-sm font-medium ${
                  transaction.type === "income" ? "text-income" : "text-expense"
                }`}>
                  {transaction.type === "income" ? "+" : "-"} R$ {transaction.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
                
                <Popover 
                  open={editingTransactionId === transaction.id}
                  onOpenChange={(open) => setEditingTransactionId(open ? transaction.id : null)}
                >
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-3" align="end">
                    <p className="text-sm font-medium mb-2">Alterar categoria</p>
                    <CategorySelector
                      type={categoryType}
                      value={transaction.category_id || ""}
                      onSelect={(categoryId) => handleCategoryUpdate(transaction.id, categoryId)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
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
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle className="sr-only">{categoryName}</DrawerTitle>
            <DrawerDescription className="sr-only">Detalhes das transações</DrawerDescription>
            {headerContent}
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
        <SheetHeader className="pb-2">
          <SheetTitle className="sr-only">{categoryName}</SheetTitle>
          <SheetDescription className="sr-only">Detalhes das transações</SheetDescription>
          {headerContent}
        </SheetHeader>
        <div className="mt-4">
          {content}
        </div>
      </SheetContent>
    </Sheet>
  );
}
