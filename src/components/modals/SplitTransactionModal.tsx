import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, SplitSquareHorizontal, Layers, Undo2, ReceiptText, Briefcase, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { useCategories } from "@/hooks/useCategories";
import { useRecurringRules } from "@/hooks/useRecurringRules";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import {
  useRecurringProvisionals,
  useSplitGroup,
  useSplittableInstallments,
  useTransactionSplit,
} from "@/hooks/useTransactionSplit";
import { CurrencyInput } from "@/components/ui/currency-input";
import { round2, sumParts, validateParts, type SplitPart } from "@/lib/splitTransaction";
import type { Transaction } from "@/hooks/useTransactions";
import { cn } from "@/lib/utils";

interface SplitTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Id da transação a dividir. O modal busca o registro completo sozinho,
   *  para poder ser aberto tanto da lista de Transações quanto do modal de
   *  itens da fatura (que carrega apenas um subconjunto dos campos). */
  transactionId: string | null;
}

interface PartForm {
  key: string;
  /** Presente apenas quando a parte já existe no banco (divisão em edição). */
  id?: string;
  amount: number | undefined;
  categoryId: string;
  label: string;
  isReimbursable: boolean;
  isCorporate: boolean;
  /** Recorrência que esta parte quita ("" = nenhuma). */
  recurringRuleId: string;
  /** Parte já reembolsada: valor e flags não podem mais mudar. */
  locked: boolean;
  reimbursementStatus: string | null;
}

/** Radix Select não aceita item com value vazio, então "sem recorrência" tem
 *  o seu próprio valor sentinela. */
const NO_RULE = "none";

let partKeySeq = 0;
const newKey = () => `part-${partKeySeq++}`;

const emptyPart = (): PartForm => ({
  key: newKey(),
  amount: undefined,
  categoryId: "",
  label: "",
  isReimbursable: false,
  isCorporate: false,
  recurringRuleId: "",
  locked: false,
  reimbursementStatus: null,
});

export function SplitTransactionModal({
  open,
  onOpenChange,
  transactionId,
}: SplitTransactionModalProps) {
  const { user } = useAuth();
  const fmt = useFormatCurrency();
  const { incomeCategories, expenseCategories, categories: allCategories } = useCategories();
  const { rules } = useRecurringRules();
  const { splitTransaction, unsplitTransaction, updateSplitParts } = useTransactionSplit();

  const [parts, setParts] = useState<PartForm[]>([]);
  const [applyToInstallments, setApplyToInstallments] = useState(false);
  const [deleteProvisionals, setDeleteProvisionals] = useState(true);
  const [showUnsplitConfirm, setShowUnsplitConfirm] = useState(false);

  const { data: transaction, isLoading: isLoadingTransaction } = useQuery({
    queryKey: ["transaction-to-split", transactionId],
    queryFn: async () => {
      if (!transactionId) return null;
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .maybeSingle();
      if (error) throw error;
      return data as Transaction | null;
    },
    enabled: !!user && !!transactionId && open,
  });

  const isSplit = !!transaction?.split_group_id;
  const { parts: existingParts, isLoading: isLoadingParts } = useSplitGroup(
    open && isSplit ? transaction!.split_group_id : null,
  );

  // Só a parte primária carrega o installment_group_id, então esta consulta
  // devolve as parcelas irmãs mesmo quando a divisão já existe.
  const { siblings } = useSplittableInstallments(
    transaction ?? null,
    open && !!transaction?.installment_group_id,
  );

  /**
   * Grupo que nasceu de "quitar previstos com um pagamento": as partes são
   * lançamentos REAIS, não linhas sintéticas da divisão. Desfazer não apaga
   * nada nesse caso (ver a migration 20260825150000), e o aviso precisa dizer
   * a verdade. As duas provas são as mesmas que a RPC usa.
   */
  const isSettleGroup = existingParts.some(
    (p) => p.split_origin === "settle" || (!!p.split_parent_id && !!p.installment_group_id),
  );

  /** Valor total a ratear: o da transação, ou a soma das partes ao editar. */
  const totalAmount = useMemo(() => {
    if (isSplit) return sumParts(existingParts.map((p) => ({ amount: Number(p.amount) })));
    return round2(Number(transaction?.amount ?? 0));
  }, [isSplit, existingParts, transaction?.amount]);

  const categories = transaction?.type === "income" ? incomeCategories : expenseCategories;

  // Monta o formulário: partes existentes (edição) ou duas partes novas, a
  // primeira já com a categoria/flags atuais e o valor cheio.
  //
  // A inicialização é feita UMA vez por transação/divisão (initKey). Sem isso,
  // um refetch em background (foco da janela, invalidação de outra tela)
  // reescreveria o que o usuário acabou de digitar.
  const initKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !transaction) return;

    const initKey = isSplit
      ? `split:${transaction.split_group_id}:${existingParts.length}`
      : `new:${transaction.id}`;
    if (initKeyRef.current === initKey) return;

    if (isSplit) {
      if (existingParts.length === 0) return;
      initKeyRef.current = initKey;
      setParts(
        existingParts.map((p) => ({
          key: p.id,
          id: p.id,
          amount: round2(Number(p.amount)),
          categoryId: p.category_id ?? "",
          label: "",
          isReimbursable: p.is_reimbursable,
          isCorporate: p.is_corporate_expense,
          recurringRuleId: p.recurring_rule_id ?? "",
          locked:
            p.reimbursement_status === "reimbursed" ||
            !!p.reimbursement_payment_id ||
            !!p.reimbursement_income_id,
          reimbursementStatus: p.reimbursement_status ?? null,
        })),
      );
      setApplyToInstallments(false);
      return;
    }

    initKeyRef.current = initKey;
    setParts([
      {
        ...emptyPart(),
        amount: round2(Number(transaction.amount)),
        categoryId: transaction.category_id ?? "",
        isReimbursable: transaction.is_reimbursable,
        isCorporate: transaction.is_corporate_expense,
        recurringRuleId: transaction.recurring_rule_id ?? "",
      },
      emptyPart(),
    ]);
    setApplyToInstallments(!!transaction.installment_group_id);
  }, [open, transaction, isSplit, existingParts]);

  useEffect(() => {
    if (!open) {
      initKeyRef.current = null;
      setParts([]);
      setDeleteProvisionals(true);
      setShowUnsplitConfirm(false);
    }
  }, [open]);

  const numericParts: SplitPart[] = parts.map((p) => ({
    amount: round2(p.amount ?? 0),
    category_id: p.categoryId || null,
    label: p.label.trim() || null,
    is_reimbursable: p.isReimbursable,
    is_corporate_expense: p.isCorporate,
    recurring_rule_id: p.recurringRuleId || null,
  }));

  const allocated = sumParts(numericParts);
  const remaining = round2(totalAmount - allocated);
  const validationError = validateParts(numericParts, totalAmount);

  const selectedRuleIds = useMemo(
    () => new Set(parts.map((p) => p.recurringRuleId).filter(Boolean)),
    [parts],
  );

  /** Regras do mesmo tipo da transação. Inativas só aparecem se já estiverem
   *  escolhidas — senão o Select mostraria um valor sem rótulo. */
  const ruleOptions = useMemo(
    () =>
      rules.filter(
        (r) => r.type === transaction?.type && (r.active || selectedRuleIds.has(r.id)),
      ),
    [rules, transaction?.type, selectedRuleIds],
  );

  const { provisionals, isLoading: loadingProvisionals } = useRecurringProvisionals(
    transaction?.date,
    open && ruleOptions.length > 0,
  );

  /**
   * Previsões que este rateio passa a quitar: a provisória que o gerador criou
   * para a regra escolhida, no mesmo mês. Ela precisa sair, senão o mês soma a
   * previsão E a parte que a substitui. As próprias partes ficam de fora — ao
   * dividir uma provisória, ela não é a previsão "sobrando".
   */
  const replacedProvisionals = useMemo(() => {
    const ownIds = new Set<string>([
      ...(transaction ? [transaction.id] : []),
      ...existingParts.map((p) => p.id),
    ]);
    const found = new Map<string, (typeof provisionals)[number]>();

    for (const ruleId of selectedRuleIds) {
      const match = provisionals.find(
        (pr) => pr.recurring_rule_id === ruleId && !ownIds.has(pr.id),
      );
      if (match) found.set(match.id, match);
    }
    return [...found.values()];
  }, [selectedRuleIds, provisionals, transaction, existingParts]);

  /**
   * Salvar antes desta consulta responder gravava o rateio SEM apagar a
   * previsão que ele quita: `replacedProvisionals` ainda estaria vazio, o
   * `provisionalIdsToDelete` sairia `undefined`, e o mês passaria a somar a
   * previsão E a parte que a substitui — em silêncio, porque o aviso de
   * exclusão também só aparece depois que a consulta responde.
   *
   * Só trava quando há regra escolhida: sem regra não existe previsão a
   * substituir, e a consulta nem chega a ser habilitada.
   */
  const awaitingProvisionals = loadingProvisionals && selectedRuleIds.size > 0;

  const updatePart = (index: number, changes: Partial<PartForm>) => {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  };

  /** Com exatamente duas partes, a outra absorve o complemento — que é o caso
   *  típico ("R$ 300 são do amigo, o resto é meu"). Com três ou mais, o campo
   *  "Restante" e o botão de atalho fazem esse papel. */
  const handleAmountChange = (index: number, value: number | undefined) => {
    setParts((prev) => {
      const next = prev.map((p, i) => (i === index ? { ...p, amount: value } : p));
      if (next.length === 2) {
        const otherIndex = index === 0 ? 1 : 0;
        if (!next[otherIndex].locked) {
          const complement = round2(totalAmount - (value ?? 0));
          next[otherIndex] = {
            ...next[otherIndex],
            amount: complement > 0 ? complement : undefined,
          };
        }
      }
      return next;
    });
  };

  const fillRemaining = (index: number) => {
    const others = numericParts.reduce((sum, p, i) => (i === index ? sum : sum + p.amount), 0);
    const value = round2(totalAmount - others);
    updatePart(index, { amount: value > 0 ? value : undefined });
  };

  const handleCategoryChange = (index: number, categoryId: string) => {
    const category = allCategories.find((c) => c.id === categoryId);
    updatePart(index, {
      categoryId,
      // Mesmo comportamento do TransactionModal: categoria marcada como
      // reembolsável liga o switch automaticamente.
      ...(category?.is_reimbursable ? { isReimbursable: true } : {}),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || validationError || awaitingProvisionals) return;

    const provisionalIdsToDelete =
      deleteProvisionals && replacedProvisionals.length > 0
        ? replacedProvisionals.map((pr) => pr.id)
        : undefined;

    if (isSplit) {
      await updateSplitParts.mutateAsync({
        updates: parts.map((p, i) => ({
          id: p.id!,
          amount: numericParts[i].amount,
          category_id: numericParts[i].category_id,
          is_reimbursable: numericParts[i].is_reimbursable,
          is_corporate_expense: numericParts[i].is_corporate_expense,
          reimbursement_status: p.reimbursementStatus,
          recurring_rule_id: numericParts[i].recurring_rule_id,
        })),
        provisionalIdsToDelete,
      });
    } else {
      await splitTransaction.mutateAsync({
        transaction,
        parts: numericParts,
        applyToInstallments: applyToInstallments && !!transaction.installment_group_id,
        provisionalIdsToDelete,
      });
    }

    onOpenChange(false);
  };

  const handleUnsplit = async () => {
    if (!transaction) return;
    await unsplitTransaction.mutateAsync(transaction.id);
    setShowUnsplitConfirm(false);
    onOpenChange(false);
  };

  const isPending =
    splitTransaction.isPending || updateSplitParts.isPending || unsplitTransaction.isPending;
  const isLoading = isLoadingTransaction || (isSplit && isLoadingParts);

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isSplit ? "Divisão da Transação" : "Dividir Transação"}
        className="sm:max-w-xl"
      >
        {isLoading || !transaction ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cabeçalho da transação */}
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{transaction.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {transaction.total_installments && transaction.total_installments > 1
                      ? `Parcela ${transaction.installment_number}/${transaction.total_installments} • `
                      : ""}
                    Valor total a dividir
                  </p>
                </div>
                <span className="font-bold shrink-0">{fmt(totalAmount)}</span>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Cada parte vira um lançamento próprio, com a sua categoria. Marque como{" "}
              <strong>reembolsável</strong> a parte que outra pessoa vai te pagar — ela aparece em
              Reembolsos Diversos e sai dos seus totais de despesa.
              {ruleOptions.length > 0 && (
                <>
                  {" "}
                  Se este débito quitou mais de uma previsão do mês, aponte a{" "}
                  <strong>recorrência</strong> de cada parte.
                </>
              )}
            </p>

            {/* Partes */}
            <div className="space-y-3">
              {parts.map((part, index) => (
                <div
                  key={part.key}
                  className={cn(
                    "space-y-3 rounded-lg border border-border p-3",
                    part.locked && "opacity-70",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Parte {index + 1}
                      </Badge>
                      {index === 0 && !isSplit && (
                        <span className="text-xs text-muted-foreground">(lançamento original)</span>
                      )}
                      {part.locked && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                          Reembolsada
                        </Badge>
                      )}
                    </div>
                    {!isSplit && parts.length > 2 && index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setParts((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Valor</Label>
                      <div className="flex gap-2">
                        <CurrencyInput
                          value={part.amount}
                          disabled={part.locked}
                          onValueChange={(value) => handleAmountChange(index, value)}
                        />
                        {parts.length > 2 && !part.locked && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => fillRemaining(index)}
                          >
                            Restante
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Categoria</Label>
                      <CategoryCombobox
                        categories={categories}
                        value={part.categoryId}
                        onChange={(id) => handleCategoryChange(index, id)}
                        disabled={part.locked}
                        placeholder="Sem categoria"
                      />
                    </div>
                  </div>

                  {ruleOptions.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Repeat className="h-3.5 w-3.5" />
                        Quita a recorrência (opcional)
                      </Label>
                      <Select
                        value={part.recurringRuleId || NO_RULE}
                        disabled={part.locked}
                        onValueChange={(value) =>
                          updatePart(index, {
                            recurringRuleId: value === NO_RULE ? "" : value,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Nenhuma" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_RULE}>Nenhuma</SelectItem>
                          {ruleOptions.map((rule) => (
                            <SelectItem key={rule.id} value={rule.id}>
                              {rule.description}
                              {rule.active ? "" : " (inativa)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {!isSplit && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Identificação (opcional)
                      </Label>
                      <Input
                        value={part.label}
                        onChange={(e) => updatePart(index, { label: e.target.value })}
                        placeholder="Ex: João — vira “… - João” na descrição"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Switch
                        checked={part.isReimbursable}
                        disabled={part.locked}
                        onCheckedChange={(v) => updatePart(index, { isReimbursable: v })}
                      />
                      <span className="flex items-center gap-1">
                        <ReceiptText className="h-3.5 w-3.5 text-primary" />
                        Reembolsável
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Switch
                        checked={part.isCorporate}
                        disabled={part.locked}
                        onCheckedChange={(v) => updatePart(index, { isCorporate: v })}
                      />
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        Corporativa
                      </span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {!isSplit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setParts((prev) => [...prev, emptyPart()])}
              >
                <Plus className="h-4 w-4" />
                Adicionar parte
              </Button>
            )}

            <Separator />

            {/* Resumo */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alocado</span>
                <span className="font-medium">{fmt(allocated)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restante</span>
                <span
                  className={cn(
                    "font-medium",
                    remaining === 0 ? "text-income" : "text-expense",
                  )}
                >
                  {fmt(remaining)}
                </span>
              </div>
            </div>

            {validationError && (
              <p className="text-sm text-expense">{validationError}</p>
            )}

            {/* Previsões recorrentes substituídas por este rateio */}
            {replacedProvisionals.length > 0 && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <Checkbox
                  checked={deleteProvisionals}
                  onCheckedChange={(v) => setDeleteProvisionals(v === true)}
                  className="mt-0.5"
                />
                <div className="space-y-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Repeat className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    {replacedProvisionals.length > 1
                      ? "Excluir as previsões que este rateio quita"
                      : "Excluir a previsão que este rateio quita"}
                  </span>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {replacedProvisionals.map((provisional) => (
                      <li key={provisional.id}>
                        {provisional.description} — {fmt(Number(provisional.amount))}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Sem isso o mês soma a previsão <em>e</em> a parte que a substitui.
                  </p>
                </div>
              </label>
            )}

            {/* Parcelas */}
            {!isSplit && !!transaction.installment_group_id && siblings.length > 0 && (
              <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-3 cursor-pointer">
                <Checkbox
                  checked={applyToInstallments}
                  onCheckedChange={(v) => setApplyToInstallments(v === true)}
                  className="mt-0.5"
                />
                <div>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Layers className="h-4 w-4 text-primary" />
                    Aplicar às demais parcelas ({siblings.length})
                  </span>
                  <p className="text-xs text-muted-foreground">
                    O mesmo rateio é repetido, proporcional ao valor de cada parcela. Parcelas em
                    fatura fechada são puladas e avisadas.
                  </p>
                </div>
              </label>
            )}

            {isSplit && (
              <p className="text-xs text-muted-foreground">
                Para mudar o número de partes, desfaça a divisão e divida novamente.
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
              {isSplit ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 text-destructive"
                  onClick={() => setShowUnsplitConfirm(true)}
                  disabled={isPending}
                >
                  <Undo2 className="h-4 w-4" />
                  Desfazer divisão
                </Button>
              ) : (
                <span />
              )}

              <div className="flex gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={isPending || !!validationError || awaitingProvisionals}
                >
                  {isPending || awaitingProvisionals ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SplitSquareHorizontal className="h-4 w-4" />
                  )}
                  {isSplit ? "Salvar divisão" : "Dividir"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </ResponsiveDialog>

      <AlertDialog open={showUnsplitConfirm} onOpenChange={setShowUnsplitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer a divisão?</AlertDialogTitle>
            <AlertDialogDescription>
              {isSettleGroup ? (
                <>
                  Este grupo veio de uma quitação, então os lançamentos são reais: nenhum será
                  excluído. Eles voltam a aparecer separados, cada um com o seu valor, e continuam
                  quitados na data do pagamento. O lançamento do pagamento não é recriado.
                </>
              ) : (
                <>
                  As partes extras serão excluídas e o valor total volta para o lançamento original.
                  As categorias das partes se perdem. Partes já reembolsadas impedem a operação.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnsplit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desfazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
