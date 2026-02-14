import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Pencil, ChevronDown, Check } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TransactionModal } from "@/components/modals/TransactionModal";
import { Transaction } from "@/hooks/useTransactions";

interface TransactionDisplay {
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
  transactions: TransactionDisplay[];
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
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryListOpen, setCategoryListOpen] = useState(false);

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

  const handleEditTransaction = (transaction: TransactionDisplay) => {
    // Convert to full Transaction type for the modal
    setEditingTransaction({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      type: transaction.type as "income" | "expense",
      category_id: transaction.category_id || null,
      account_id: null,
      credit_card_id: null,
      status: "completed",
      is_corporate_expense: false,
      is_reimbursable: false,
      is_refund: false,
      is_card_payment: false,
      reimbursement_status: null,
      user_id: "",
      created_at: "",
      updated_at: "",
      due_date: null,
      installment_number: null,
      total_installments: null,
      installment_group_id: null,
      refunded_transaction_id: null,
      imported_at: null,
    });
    setIsModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setEditingTransaction(null);
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
      
      <Popover open={categoryListOpen} onOpenChange={setCategoryListOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 flex-1 justify-center min-w-0 px-2 hover:bg-muted/50 rounded-lg py-1 transition-colors">
            <span 
              className="w-3 h-3 rounded-full shrink-0" 
              style={{ backgroundColor: categoryColor }}
            />
            <span className="font-semibold text-foreground truncate">{categoryName}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="center">
          <ScrollArea className="h-[300px]">
            <div className="py-1">
              {allCategories.map((cat) => (
                <button
                  key={cat.name}
                  className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => {
                    if (onCategoryChange) {
                      onCategoryChange(cat);
                    }
                    setCategoryListOpen(false);
                  }}
                >
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm text-foreground truncate flex-1">
                    {cat.name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    R$ {cat.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                  {cat.name === categoryName && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      
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
              className="flex items-center justify-between py-3 border-b border-border last:border-0 gap-2 cursor-pointer hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors"
              onClick={() => handleEditTransaction(transaction)}
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
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditTransaction(transaction);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
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

      <TransactionModal
        open={isModalOpen}
        onOpenChange={handleModalClose}
        transaction={editingTransaction}
      />
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