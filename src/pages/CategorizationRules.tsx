import { useState } from "react";
import {
  Search,
  Edit,
  Trash2,
  Loader2,
  BookMarked,
  Building2,
  Wand2,
  CheckSquare,
  Square,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  const { 
    rules, 
    isLoading, 
    updateRule, 
    deleteRule, 
    previewRulesApplication,
    isLoadingPreview,
    applyRulesToUncategorized, 
    isApplyingRules 
  } = useCategorizationRules();
  const { categories } = useCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingRule, setEditingRule] = useState<CategorizationRule | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewData, setPreviewData] = useState<{ ruleId: string; keyword: string; categoryId: string | null; count: number; transactionIds: string[] }[]>([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  
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

  const handleApplyRulesClick = async () => {
    const preview = await previewRulesApplication();
    setPreviewData(preview);
    // Select all rules by default
    setSelectedRuleIds(new Set(preview.map((p) => p.ruleId)));
    setShowPreviewDialog(true);
  };

  const handleConfirmApply = async () => {
    // Get transaction IDs from selected rules only
    const selectedTransactionIds = previewData
      .filter((p) => selectedRuleIds.has(p.ruleId))
      .flatMap((p) => p.transactionIds);
    
    setShowPreviewDialog(false);
    await applyRulesToUncategorized(selectedTransactionIds);
  };

  const toggleRuleSelection = (ruleId: string) => {
    setSelectedRuleIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(ruleId)) {
        newSet.delete(ruleId);
      } else {
        newSet.add(ruleId);
      }
      return newSet;
    });
  };

  const toggleAllRules = () => {
    if (selectedRuleIds.size === previewData.length) {
      setSelectedRuleIds(new Set());
    } else {
      setSelectedRuleIds(new Set(previewData.map((p) => p.ruleId)));
    }
  };

  const selectedTransactionsCount = previewData
    .filter((p) => selectedRuleIds.has(p.ruleId))
    .reduce((sum, p) => sum + p.count, 0);

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
          onClick={handleApplyRulesClick} 
          disabled={isLoadingPreview || isApplyingRules || rules.length === 0}
          className="gap-2"
        >
          {isLoadingPreview ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando...
            </>
          ) : isApplyingRules ? (
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

      {/* Rules Table - Desktop */}
      <div className="hidden md:block rounded-lg border border-border bg-card">
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
                          <span>{category.fullName || category.name}</span>
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

      {/* Rules Cards - Mobile */}
      <div className="md:hidden space-y-2">
        {filteredRules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground rounded-lg border border-border bg-card">
            {searchQuery
              ? "Nenhuma regra encontrada com esse filtro"
              : "Nenhuma regra de categorização criada ainda"}
          </div>
        ) : (
          filteredRules.map((rule) => {
            const category = getCategoryInfo(rule.category_id);
            return (
              <div key={rule.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-medium text-sm truncate">{rule.keyword}</p>
                    {category ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <span>{category.icon}</span>
                        <span className="truncate">{category.fullName || category.name}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">Sem categoria</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEditClick(rule)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteRuleId(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {rule.is_corporate && (
                  <Badge variant="default" className="gap-1 text-xs">
                    <Building2 className="h-3 w-3" />
                    Corporativa
                  </Badge>
                )}
              </div>
            );
          })
        )}
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

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Prévia da Aplicação de Regras
            </DialogTitle>
            <DialogDescription>
              {selectedTransactionsCount > 0 
                ? `${selectedTransactionsCount} transação(ões) selecionada(s) para categorizar`
                : "Selecione as regras que deseja aplicar"}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {previewData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma transação sem categoria corresponde às regras existentes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Select All Header */}
                <div 
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 cursor-pointer border-b border-border pb-3"
                  onClick={toggleAllRules}
                >
                  <Checkbox 
                    checked={selectedRuleIds.size === previewData.length}
                    onCheckedChange={() => toggleAllRules()}
                  />
                  <span className="text-sm font-medium">
                    {selectedRuleIds.size === previewData.length ? "Desmarcar todas" : "Selecionar todas"}
                  </span>
                  <Badge variant="outline" className="ml-auto">
                    {selectedRuleIds.size}/{previewData.length}
                  </Badge>
                </div>

                {/* Rules List */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {previewData.map((item) => {
                    const category = getCategoryInfo(item.categoryId);
                    const isSelected = selectedRuleIds.has(item.ruleId);
                    return (
                      <div 
                        key={item.ruleId} 
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected 
                            ? "bg-primary/5 border-primary/30" 
                            : "bg-muted/50 border-border hover:bg-muted/70"
                        }`}
                        onClick={() => toggleRuleSelection(item.ruleId)}
                      >
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleRuleSelection(item.ruleId)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-medium truncate">
                            {item.keyword}
                          </p>
                          {category && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <span>{category.icon}</span>
                              <span>{category.fullName || category.name}</span>
                            </p>
                          )}
                        </div>
                        <Badge variant={isSelected ? "default" : "secondary"} className="shrink-0">
                          {item.count} transação{item.count !== 1 ? "ões" : ""}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmApply} 
              disabled={selectedTransactionsCount === 0}
              className="gap-2"
            >
              <Wand2 className="h-4 w-4" />
              Aplicar {selectedTransactionsCount > 0 && `(${selectedTransactionsCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
