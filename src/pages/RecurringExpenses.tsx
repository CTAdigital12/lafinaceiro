import { useState } from "react";
import { Plus, Edit, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { useRecurringRules, RecurringRule } from "@/hooks/useRecurringRules";
import { RecurringRuleModal } from "@/components/modals/RecurringRuleModal";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function RecurringExpenses() {
  const { rules, isLoading, createRule, updateRule, deleteRule, toggleRule } = useRecurringRules();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleSave = (data: Parameters<typeof createRule.mutate>[0]) => {
    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, ...data });
    } else {
      createRule.mutate(data);
    }
    setEditingRule(null);
  };

  const handleEdit = (rule: RecurringRule) => {
    setEditingRule(rule);
    setIsModalOpen(true);
  };

  const handleNew = () => {
    setEditingRule(null);
    setIsModalOpen(true);
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteRule.mutate(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recorrências</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie despesas e receitas que se repetem todo mês
          </p>
        </div>
        <Button onClick={handleNew} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nova
        </Button>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhuma recorrência cadastrada</p>
          <p className="text-sm">Crie regras para gerar previsões automáticas todo mês.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-4 p-4 rounded-lg border bg-card transition-opacity ${
                !rule.active ? "opacity-50" : ""
              }`}
            >
              {/* Category Icon */}
              <div className="text-2xl flex-shrink-0">
                {rule.categories?.icon || "📦"}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground truncate">{rule.description}</span>
                  <Badge variant={rule.type === "income" ? "default" : "secondary"} className="text-[10px]">
                    {rule.type === "income" ? "Receita" : "Despesa"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <span>{rule.categories?.name || "Sem categoria"}</span>
                  <span>•</span>
                  <span>Dia {rule.day_of_month}</span>
                  {rule.credit_cards && (
                    <>
                      <span>•</span>
                      <span>{rule.credit_cards.name} •••• {rule.credit_cards.last_digits}</span>
                    </>
                  )}
                  {rule.accounts && (
                    <>
                      <span>•</span>
                      <span>{rule.accounts.name}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div className={`font-semibold text-sm whitespace-nowrap ${
                rule.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
              }`}>
                {formatCurrency(rule.estimated_amount)}
              </div>

              {/* Toggle */}
              <Switch
                checked={rule.active}
                onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, active: checked })}
              />

              {/* Actions */}
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(rule)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(rule.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <RecurringRuleModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        editingRule={editingRule}
        onSave={handleSave}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir recorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As transações provisórias já geradas não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
