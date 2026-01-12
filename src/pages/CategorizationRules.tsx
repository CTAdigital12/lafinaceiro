import { useState } from "react";
import {
  Search,
  Edit,
  Trash2,
  Loader2,
  BookMarked,
  Building2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useCategorizationRules, CategorizationRule } from "@/hooks/useCategorizationRules";
import { useCategories } from "@/hooks/useCategories";
import { CategorySelector } from "@/components/CategorySelector";

export default function CategorizationRules() {
  const { rules, isLoading, updateRule, deleteRule, applyRulesToUncategorized, isApplyingRules } = useCategorizationRules();
  const { categories } = useCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  
  // Edit form state
  const [editKeyword, setEditKeyword] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editIsCorporate, setEditIsCorporate] = useState(false);

  const filteredRules = rules.filter((rule) => {
    const category = categories.find((c) => c.id === rule.category_id);
    const categoryName = category?.name || "";
    return (
      rule.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
      categoryName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleEditClick = (rule: CategorizationRule) => {
    setEditingRule(rule);
    setEditKeyword(rule.keyword);
    setEditCategoryId(rule.category_id);
    setEditIsCorporate(rule.is_corporate);
  };

  const handleEditSave = async () => {
    if (!editingRule) return;
    
    await updateRule.mutateAsync({
      id: editingRule.id,
      keyword: editKeyword,
      category_id: editCategoryId,
      is_corporate: editIsCorporate,
    });
    
    setEditingRule(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteRuleId) return;
    await deleteRule.mutateAsync(deleteRuleId);
    setDeleteRuleId(null);
  };

  const getCategoryInfo = (categoryId: string | null) => {
    if (!categoryId) return null;
    return categories.find((c) => c.id === categoryId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookMarked className="h-6 w-6" />
          Regras de Categorização
        </h1>
        <p className="text-muted-foreground">
          Gerencie as regras automáticas para categorizar suas transações
        </p>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por palavra-chave ou categoria..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <Button 
          onClick={() => applyRulesToUncategorized()} 
          disabled={isApplyingRules || rules.length === 0}
          className="gap-2"
        >
          {isApplyingRules ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Aplicando...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Aplicar Regras
            </>
          )}
        </Button>
      </div>

      {/* Rules Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Palavra-chave</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-center">Corporativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  {searchQuery
                    ? "Nenhuma regra encontrada com esse filtro"
                    : "Nenhuma regra de categorização criada ainda"}
                </TableCell>
              </TableRow>
            ) : (
              filteredRules.map((rule) => {
                const category = getCategoryInfo(rule.category_id);
                return (
                  <TableRow key={rule.id}>
                    <TableCell className="font-mono font-medium">
                      {rule.keyword}
                    </TableCell>
                    <TableCell>
                      {category ? (
                        <div className="flex items-center gap-2">
                          <span>{category.icon}</span>
                          <span>{category.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Sem categoria</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {rule.is_corporate ? (
                        <Badge variant="default" className="gap-1">
                          <Building2 className="h-3 w-3" />
                          Sim
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditClick(rule)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteRuleId(rule.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        {filteredRules.length} regra{filteredRules.length !== 1 ? "s" : ""} encontrada{filteredRules.length !== 1 ? "s" : ""}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Regra</DialogTitle>
            <DialogDescription>
              Altere as configurações desta regra de categorização
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="keyword">Texto de Identificação</Label>
              <Input
                id="keyword"
                value={editKeyword}
                onChange={(e) => setEditKeyword(e.target.value.toUpperCase())}
                placeholder="Ex: NEFELE, COPEL, UBER"
              />
              <p className="text-xs text-muted-foreground">
                Transações contendo este texto serão categorizadas automaticamente
              </p>
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <CategorySelector
                value={editCategoryId}
                onSelect={setEditCategoryId}
                type="expense"
                currentCategory={editCategoryId ? categories.find(c => c.id === editCategoryId) : null}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="corporate" className="cursor-pointer">
                  Despesa Corporativa
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marcar transações como reembolsáveis
                </p>
              </div>
              <Switch
                id="corporate"
                checked={editIsCorporate}
                onCheckedChange={setEditIsCorporate}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRule(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEditSave} disabled={!editKeyword.trim()}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={(open) => !open && setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Regra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta regra de categorização? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
