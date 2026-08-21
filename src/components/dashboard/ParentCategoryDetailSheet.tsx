import { useState } from "react";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Pencil, ChevronDown, ChevronUp, Check } from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TransactionModal } from "@/components/modals/TransactionModal";
import { Transaction } from "@/hooks/useTransactions";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { Currency } from "@/components/ui/currency";
import { formatYmd } from "@/lib/dateUtils";

interface TransactionDisplay {
  id: string;
  description: string;
  amount: number;
  date: string;
  type: string;
  category_id?: string;
}

interface SubcategoryData {
  id: string;
  name: string;
  value: number;
  color: string;
  icon?: string | null;
  transactions: TransactionDisplay[];
}

interface ParentCategoryData {
  id: string;
  name: string;
  value: number;
  color: string;
  icon?: string | null;
}

interface ParentCategoryDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentCategory: ParentCategoryData | null;
  subcategories: SubcategoryData[];
  directTransactions: TransactionDisplay[];
  allParentCategories: ParentCategoryData[];
  onParentCategoryChange: (category: ParentCategoryData) => void;
  categoryType: "expense" | "income";
}

export function ParentCategoryDetailSheet({
  open,
  onOpenChange,
  parentCategory,
  subcategories,
  directTransactions,
  allParentCategories,
  onParentCategoryChange,
  categoryType,
}: ParentCategoryDetailSheetProps) {
  const isMobile = useIsMobile();
  const fmt = useFormatCurrency();
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  const [categoryListOpen, setCategoryListOpen] = useState(false);

  if (!parentCategory) return null;

  const currentIndex = allParentCategories.findIndex(cat => cat.id === parentCategory.id);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < allParentCategories.length - 1 && currentIndex >= 0;

  const handlePrev = () => {
    if (canGoPrev) {
      setExpandedSubcategories(new Set());
      onParentCategoryChange(allParentCategories[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      setExpandedSubcategories(new Set());
      onParentCategoryChange(allParentCategories[currentIndex + 1]);
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
      is_provisional: false,
      recurring_rule_id: null,
      project_id: null,
      // Campos que entraram depois (reembolso, divisão, dígitos do cartão).
      // Este objeto é um `Transaction` sintético montado só para abrir o
      // modal de edição — os valores neutros abaixo refletem "não se aplica",
      // e o modal recarrega o lançamento real pelo id.
      is_reimbursement: false,
      reimbursement_payment_id: null,
      reimbursement_income_id: null,
      split_group_id: null,
      split_parent_id: null,
      card_last_digits: null,
    });
    setIsModalOpen(true);
  };

  const handleModalClose = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setEditingTransaction(null);
    }
  };

  const toggleSubcategory = (subcategoryId: string) => {
    setExpandedSubcategories(prev => {
      const next = new Set(prev);
      if (next.has(subcategoryId)) {
        next.delete(subcategoryId);
      } else {
        next.add(subcategoryId);
      }
      return next;
    });
  };

  const totalTransactions = subcategories.reduce((sum, sub) => sum + sub.transactions.length, 0) + directTransactions.length;

  const renderTransaction = (transaction: TransactionDisplay) => (
    <div 
      key={transaction.id}
      className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0 gap-2 pl-6 cursor-pointer hover:bg-muted/50 rounded-lg pr-2 transition-colors"
      onClick={() => handleEditTransaction(transaction)}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">
          {transaction.description}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatYmd(transaction.date, "dd MMM yyyy", { locale: ptBR })}
        </p>
      </div>
      
      <div className="flex items-center gap-2 shrink-0">
        <p className={`text-sm font-medium whitespace-nowrap tabular-nums ${
          transaction.type === "income" ? "text-income" : "text-expense"
        }`}>
          {transaction.type === "income" ? "+" : "-"} {fmt(transaction.amount)}
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
  );

  const categoryTrigger = (
    <button 
      className="flex items-center gap-2 flex-1 justify-center min-w-0 px-2 hover:bg-muted/50 rounded-lg py-1 transition-colors"
      onClick={() => isMobile && setCategoryListOpen(!categoryListOpen)}
    >
      <span 
        className="w-3 h-3 rounded-full shrink-0" 
        style={{ backgroundColor: parentCategory.color }}
      />
      <span className="font-semibold text-foreground truncate">
        {parentCategory.icon} {parentCategory.name}
      </span>
      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
  );

  const categoryList = (
    <ScrollArea className="h-[250px]">
      <div className="py-1">
        {allParentCategories.map((cat) => (
          <button
            key={cat.id}
            className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
            onClick={() => {
              setExpandedSubcategories(new Set());
              onParentCategoryChange(cat);
              setCategoryListOpen(false);
            }}
          >
            <span 
              className="w-2.5 h-2.5 rounded-full shrink-0" 
              style={{ backgroundColor: cat.color }}
            />
            <span className="text-sm text-foreground truncate flex-1">
              {cat.icon} {cat.name}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {fmt(cat.value)}
            </span>
            {cat.id === parentCategory.id && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  );

  const headerContent = (
    <div className="flex flex-col w-full">
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
        
        {isMobile ? (
          categoryTrigger
        ) : (
          <Popover open={categoryListOpen} onOpenChange={setCategoryListOpen}>
            <PopoverTrigger asChild>
              {categoryTrigger}
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="center">
              {categoryList}
            </PopoverContent>
          </Popover>
        )}
        
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
      {isMobile && categoryListOpen && (
        <div className="border rounded-lg mt-2 bg-popover text-popover-foreground shadow-md">
          {categoryList}
        </div>
      )}
    </div>
  );

  const content = (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex items-center gap-3 mb-6">
        <div>
          <Currency value={parentCategory.value} className="text-2xl font-bold text-foreground block" />
          <p className="text-sm text-muted-foreground">
            {totalTransactions} {totalTransactions === 1 ? "transação" : "transações"}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2 pr-4">
          {/* Subcategories */}
          {subcategories.map((subcategory) => (
            <Collapsible
              key={subcategory.id}
              open={expandedSubcategories.has(subcategory.id)}
              onOpenChange={() => toggleSubcategory(subcategory.id)}
            >
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full py-3 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: subcategory.color }}
                    />
                    <span className="text-sm font-medium text-foreground truncate">
                      {subcategory.icon} {subcategory.name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({subcategory.transactions.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-medium whitespace-nowrap tabular-nums ${
                      categoryType === "income" ? "text-income" : "text-expense"
                    }`}>
                      {fmt(subcategory.value)}
                    </span>
                    {expandedSubcategories.has(subcategory.id) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 mb-2">
                  {subcategory.transactions.map(renderTransaction)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}

          {/* Direct transactions (transactions in parent category without subcategory) */}
          {directTransactions.length > 0 && (
            <Collapsible
              open={expandedSubcategories.has("direct")}
              onOpenChange={() => toggleSubcategory("direct")}
            >
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full py-3 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: parentCategory.color }}
                    />
                    <span className="text-sm font-medium text-foreground truncate">
                      Outros ({parentCategory.name})
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({directTransactions.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-medium whitespace-nowrap tabular-nums ${
                      categoryType === "income" ? "text-income" : "text-expense"
                    }`}>
                      {fmt(directTransactions.reduce((sum, t) => sum + t.amount, 0))}
                    </span>
                    {expandedSubcategories.has("direct") ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 mb-2">
                  {directTransactions.map(renderTransaction)}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {subcategories.length === 0 && directTransactions.length === 0 && (
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
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerHeader className="text-left pb-2 shrink-0">
            <DrawerTitle className="sr-only">{parentCategory.name}</DrawerTitle>
            <DrawerDescription className="sr-only">Detalhes das subcategorias e transações</DrawerDescription>
            {headerContent}
          </DrawerHeader>
          <div className="flex-1 min-h-0 px-4 pb-6 flex flex-col" data-vaul-no-drag>
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[480px] flex flex-col">
        <SheetHeader className="pb-2 shrink-0">
          <SheetTitle className="sr-only">{parentCategory.name}</SheetTitle>
          <SheetDescription className="sr-only">Detalhes das subcategorias e transações</SheetDescription>
          {headerContent}
        </SheetHeader>
        <div className="flex-1 min-h-0 mt-4 flex flex-col">
          {content}
        </div>
      </SheetContent>
    </Sheet>
  );
}