import { useState, useEffect } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Category, useCategories } from "@/hooks/useCategories";
import { supabase } from "@/integrations/supabase/client";

interface DeleteCategoryModalProps {
  category: Category | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteCategoryModal({
  category,
  isOpen,
  onClose,
  onConfirm,
}: DeleteCategoryModalProps) {
  const { expenseCategories, moveTransactionsToCategory, deleteCategory } = useCategories();
  const [transactionCount, setTransactionCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [subcategoryIds, setSubcategoryIds] = useState<string[]>([]);

  // Get subcategories of the category being deleted (if it's a parent)
  const getSubcategoryIds = (categoryId: string): string[] => {
    return expenseCategories
      .filter((c) => c.parent_id === categoryId)
      .map((c) => c.id);
  };

  // Fetch transaction count when modal opens
  useEffect(() => {
    if (isOpen && category) {
      setIsLoading(true);
      setTargetCategoryId("");
      
      const subcatIds = getSubcategoryIds(category.id);
      setSubcategoryIds(subcatIds);
      
      const categoryIds = [category.id, ...subcatIds];
      
      supabase
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .in("category_id", categoryIds)
        .then(({ count, error }) => {
          if (error) {
            console.error("Error fetching transaction count:", error);
            setTransactionCount(0);
          } else {
            setTransactionCount(count || 0);
          }
          setIsLoading(false);
        });
    }
  }, [isOpen, category, expenseCategories]);

  // Filter out the category being deleted and its subcategories from available targets
  const availableCategories = expenseCategories.filter((c) => {
    if (!category) return true;
    // Exclude the category being deleted
    if (c.id === category.id) return false;
    // Exclude subcategories of the category being deleted
    if (subcategoryIds.includes(c.id)) return false;
    // Exclude categories that have the deleted category as parent
    if (c.parent_id === category.id) return false;
    return true;
  });

  // Group available categories for the select
  const groupedCategories = (() => {
    const parents = availableCategories.filter((c) => !c.parent_id);
    const children = availableCategories.filter((c) => c.parent_id);

    const groups: { parent: Category | null; children: Category[] }[] = [];

    parents.forEach((parent) => {
      const subs = children.filter((c) => c.parent_id === parent.id);
      if (subs.length > 0) {
        groups.push({ parent, children: subs });
      } else {
        groups.push({ parent: null, children: [parent] });
      }
    });

    // Add orphan children
    const groupedChildIds = groups.flatMap((g) => g.children.map((c) => c.id));
    const orphans = children.filter((c) => !groupedChildIds.includes(c.id));
    if (orphans.length > 0) {
      groups.push({ parent: null, children: orphans });
    }

    return groups;
  })();

  const handleConfirmDelete = async () => {
    if (!category) return;
    
    setIsDeleting(true);
    
    try {
      const hasTransactions = transactionCount && transactionCount > 0;
      
      if (hasTransactions && targetCategoryId) {
        // Move transactions first
        const categoryIds = [category.id, ...subcategoryIds];
        await moveTransactionsToCategory.mutateAsync({
          fromCategoryIds: categoryIds,
          toCategoryId: targetCategoryId,
        });
      }
      
      // Delete subcategories first (if any)
      for (const subId of subcategoryIds) {
        await deleteCategory.mutateAsync(subId);
      }
      
      // Delete the main category
      await deleteCategory.mutateAsync(category.id);
      
      onConfirm();
      onClose();
    } catch (error) {
      console.error("Error deleting category:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const hasTransactions = transactionCount && transactionCount > 0;
  const canDelete = !hasTransactions || (hasTransactions && targetCategoryId);
  const isParentCategory = subcategoryIds.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Excluir categoria "{category?.name}"
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {hasTransactions ? (
              <div className="space-y-4">
                <DialogDescription className="text-foreground">
                  Esta categoria possui{" "}
                  <span className="font-semibold text-destructive">
                    {transactionCount} transaç{transactionCount === 1 ? "ão" : "ões"}
                  </span>{" "}
                  associada{transactionCount === 1 ? "" : "s"}.
                  {isParentCategory && (
                    <span className="block mt-2 text-amber-600 dark:text-amber-500">
                      ⚠️ As {subcategoryIds.length} subcategoria{subcategoryIds.length === 1 ? "" : "s"} também ser{subcategoryIds.length === 1 ? "á" : "ão"} excluída{subcategoryIds.length === 1 ? "" : "s"}.
                    </span>
                  )}
                </DialogDescription>

                <div className="space-y-2">
                  <Label>
                    Para excluir, mova as transações para outra categoria:
                  </Label>
                  <Select
                    value={targetCategoryId}
                    onValueChange={setTargetCategoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria..." />
                    </SelectTrigger>
                    <SelectContent>
                      {groupedCategories.map((group, index) =>
                        group.parent ? (
                          <SelectGroup key={group.parent.id}>
                            <SelectLabel className="flex items-center gap-1">
                              {group.parent.icon} {group.parent.name}
                            </SelectLabel>
                            {group.children.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id} className="pl-6">
                                {cat.icon} {cat.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ) : (
                          group.children.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.icon} {cat.name}
                            </SelectItem>
                          ))
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <DialogDescription>
                {isParentCategory ? (
                  <>
                    Tem certeza que deseja excluir esta categoria? 
                    <span className="block mt-2 text-amber-600 dark:text-amber-500">
                      ⚠️ As {subcategoryIds.length} subcategoria{subcategoryIds.length === 1 ? "" : "s"} também ser{subcategoryIds.length === 1 ? "á" : "ão"} excluída{subcategoryIds.length === 1 ? "" : "s"}.
                    </span>
                    Esta ação não pode ser desfeita.
                  </>
                ) : (
                  "Tem certeza que deseja excluir esta categoria? Esta ação não pode ser desfeita."
                )}
              </DialogDescription>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={!canDelete || isLoading || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Excluindo...
              </>
            ) : hasTransactions ? (
              "Mover e Excluir"
            ) : (
              "Excluir"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
