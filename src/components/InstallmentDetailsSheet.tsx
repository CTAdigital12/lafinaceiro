import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CheckCircle, 
  Circle, 
  Clock, 
  CreditCard, 
  Edit, 
  X,
  Loader2,
  Tag,
  MoreVertical,
  Plus,
  Trash2
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CategorySelector } from "@/components/CategorySelector";
import { EditInstallmentsModal } from "@/components/modals/EditInstallmentsModal";
import { AddInstallmentsModal } from "@/components/modals/AddInstallmentsModal";
import { useInstallmentGroup } from "@/hooks/useInstallmentGroup";
import { cn } from "@/lib/utils";
import { Transaction } from "@/hooks/useTransactions";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface InstallmentDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  onEditTransaction?: (transaction: Transaction) => void;
}

export function InstallmentDetailsSheet({
  open,
  onOpenChange,
  groupId,
  onEditTransaction,
}: InstallmentDetailsSheetProps) {
  const {
    installments,
    isLoading,
    totalAmount,
    paidAmount,
    paidCount,
    remainingAmount,
    progressPercentage,
    currentInstallment,
    installmentValue,
    baseDescription,
    updateCategoryForAll,
    toggleInstallmentStatus,
    deleteSingleInstallment,
    deletePendingInstallments,
    updateAllInstallments,
    addInstallments,
  } = useInstallmentGroup(groupId);

  const fmt = useFormatCurrency();
  const [showCategorySelector, setShowCategorySelector] = useState(false);
  const [showEditAllModal, setShowEditAllModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeletePendingDialog, setShowDeletePendingDialog] = useState(false);
  const [showDeleteSingleDialog, setShowDeleteSingleDialog] = useState<string | null>(null);

  // Get credit card info from first installment
  const creditCard = installments[0]?.credit_cards;
  const category = installments[0]?.categories;
  const totalInstallments = installments[0]?.total_installments || installments.length;
  const pendingCount = installments.filter(i => i.status === "pending").length;
  const lastInstallment = installments[installments.length - 1] || null;

  const handleCategoryUpdate = async (categoryId: string) => {
    await updateCategoryForAll.mutateAsync(categoryId);
    setShowCategorySelector(false);
  };

  const handleToggleStatus = async (id: string, newStatus: "completed" | "pending") => {
    await toggleInstallmentStatus.mutateAsync({ id, newStatus });
  };

  const handleDeleteSingle = async (id: string) => {
    await deleteSingleInstallment.mutateAsync(id);
    setShowDeleteSingleDialog(null);
  };

  const handleDeletePending = async () => {
    await deletePendingInstallments.mutateAsync();
    setShowDeletePendingDialog(false);
  };

  const handleEditAll = async (data: { description?: string; amount?: number; category_id?: string }) => {
    await updateAllInstallments.mutateAsync(data);
  };

  const handleAddInstallments = async (count: number) => {
    await addInstallments.mutateAsync(count);
  };

  const handleEditSingle = (installment: Transaction) => {
    if (onEditTransaction) {
      onEditTransaction(installment);
      onOpenChange(false);
    }
  };

  const formatMonthYear = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(parseISO(dateString), "MMM/yy", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (installments.length === 0) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Detalhes da Compra</SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Nenhuma parcela encontrada</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="p-6 pb-4 border-b border-border">
            <div className="flex items-start justify-between">
              <div className="space-y-1 flex-1 min-w-0">
                <SheetTitle className="text-xl truncate">{baseDescription}</SheetTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {creditCard && (
                    <span className="flex items-center gap-1">
                      <CreditCard className="h-4 w-4" />
                      {creditCard.name} •{creditCard.last_digits}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Header Actions Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => setShowEditAllModal(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Editar Todas as Parcelas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowAddModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Parcelas
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeletePendingDialog(true)}
                    disabled={pendingCount === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remover Pendentes ({pendingCount})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Amounts Summary */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="text-lg font-bold text-foreground">
                  {fmt(totalAmount)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Parcela Mensal</p>
                <p className="text-lg font-bold text-foreground">
                  {fmt(installmentValue)}
                </p>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 p-6">
            {/* Progress Card */}
            <div className="bg-card rounded-xl border border-border p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Progresso</span>
                <span className="text-sm text-muted-foreground">
                  {paidCount}/{totalInstallments} parcelas
                </span>
              </div>
              <Progress value={progressPercentage} className="h-3 mb-3" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Pago</p>
                  <p className="font-medium text-income">
                    {fmt(paidAmount)}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({Math.round(progressPercentage)}%)
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Restante</p>
                  <p className="font-medium text-expense">
                    {fmt(remainingAmount)}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({Math.round(100 - progressPercentage)}%)
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Category Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Categoria</span>
                {!showCategorySelector && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 h-7 text-xs"
                    onClick={() => setShowCategorySelector(true)}
                  >
                    <Edit className="h-3 w-3" />
                    Editar Todas
                  </Button>
                )}
              </div>
              
              {showCategorySelector ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <CategorySelector
                      value={installments[0]?.category_id}
                      type="expense"
                      currentCategory={category}
                      onSelect={handleCategoryUpdate}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowCategorySelector(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  {category ? (
                    <>
                      <span>{category.icon}</span>
                      <span className="text-sm">{category.name}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Sem categoria</span>
                  )}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div>
              <h4 className="text-sm font-medium mb-3">Cronograma de Parcelas</h4>
              <div className="space-y-2">
                {installments.map((installment, index) => {
                  const isPaid = installment.status === "completed";
                  const isCurrent = currentInstallment?.id === installment.id;
                  const isFuture = !isPaid && !isCurrent;

                  return (
                    <div
                      key={installment.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                        isPaid && "bg-muted/30 border-muted",
                        isCurrent && "bg-primary/10 border-primary",
                        isFuture && "bg-card border-border"
                      )}
                    >
                      {/* Status Icon */}
                      <div className="flex-shrink-0">
                        {isPaid ? (
                          <CheckCircle className="h-5 w-5 text-income" />
                        ) : isCurrent ? (
                          <Circle className="h-5 w-5 text-primary fill-primary" />
                        ) : (
                          <Clock className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm",
                            isPaid && "text-muted-foreground",
                            isCurrent && "font-bold text-foreground",
                            isFuture && "text-foreground"
                          )}>
                            Parcela {installment.installment_number || index + 1}/{totalInstallments}
                          </span>
                          {isCurrent && (
                            <Badge variant="default" className="text-xs h-5">
                              Atual
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatMonthYear(installment.due_date)}
                        </p>
                      </div>

                      {/* Amount */}
                      <div className={cn(
                        "text-sm font-medium text-right",
                        isPaid && "text-muted-foreground",
                        isCurrent && "text-foreground",
                        isFuture && "text-muted-foreground"
                      )}>
                        {fmt(Number(installment.amount))}
                      </div>

                      {/* Actions Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {onEditTransaction && (
                            <DropdownMenuItem onClick={() => handleEditSingle(installment)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar Parcela
                            </DropdownMenuItem>
                          )}
                          {isPaid ? (
                            <DropdownMenuItem onClick={() => handleToggleStatus(installment.id, "pending")}>
                              <Clock className="h-4 w-4 mr-2" />
                              Marcar como Pendente
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleToggleStatus(installment.id, "completed")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Marcar como Paga
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => setShowDeleteSingleDialog(installment.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir Parcela
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>

          {/* Footer Actions */}
          <div className="p-4 border-t border-border">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowCategorySelector(true)}
            >
              <Tag className="h-4 w-4" />
              Editar Categoria de Todas
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit All Modal */}
      <EditInstallmentsModal
        open={showEditAllModal}
        onOpenChange={setShowEditAllModal}
        installments={installments}
        baseDescription={baseDescription}
        onSave={handleEditAll}
      />

      {/* Add Installments Modal */}
      <AddInstallmentsModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        currentTotal={totalInstallments}
        lastInstallment={lastInstallment}
        onAdd={handleAddInstallments}
      />

      {/* Delete Pending Confirmation */}
      <AlertDialog open={showDeletePendingDialog} onOpenChange={setShowDeletePendingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Parcelas Pendentes?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover {pendingCount} parcela{pendingCount > 1 ? "s" : ""} pendente{pendingCount > 1 ? "s" : ""}.
              As parcelas já pagas serão mantidas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover {pendingCount} Parcela{pendingCount > 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Single Confirmation */}
      <AlertDialog open={!!showDeleteSingleDialog} onOpenChange={(open) => !open && setShowDeleteSingleDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Parcela?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá excluir apenas esta parcela. As demais parcelas do grupo serão mantidas.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => showDeleteSingleDialog && handleDeleteSingle(showDeleteSingleDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir Parcela
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
