import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";
import { prorateParts, type SplitPart } from "@/lib/splitTransaction";
import type { Transaction } from "./useTransactions";

/**
 * Divisão de uma transação em várias categorias (rateio).
 *
 * O trabalho pesado está nas RPCs `split_transaction` / `unsplit_transaction`
 * (migration 20260727120000): cada parte vira uma transação irmã de verdade,
 * com a sua própria categoria e as suas próprias flags, e a soma das partes é
 * sempre igual ao valor original. Com isso o dashboard, a fatura, os
 * orçamentos e os relatórios continuam somando certo sem nenhuma alteração —
 * e a parte marcada como reembolsável entra em Reembolsos Diversos pelo fluxo
 * normal.
 *
 * Parcelamentos: a RPC divide UMA transação. Quando o usuário pede para
 * aplicar às demais parcelas, iteramos aqui, rateando as partes na proporção
 * do valor de cada parcela — parcelas em fatura fechada (ou já divididas) são
 * puladas e reportadas no toast, em vez de abortar a operação inteira.
 */

/** Referência estável para os defaults das queries: um `= []` inline devolveria
 *  um array novo a cada render e re-dispararia efeitos que dependem dele. */
const EMPTY_PARTS: Transaction[] = [];
const EMPTY_SIBLINGS: { id: string; amount: number; installment_number: number | null; description: string; due_date: string | null }[] = [];
const EMPTY_PROVISIONALS: RecurringProvisional[] = [];

export interface SplitTransactionInput {
  transaction: Pick<Transaction, "id" | "amount" | "credit_card_id" | "installment_group_id">;
  parts: SplitPart[];
  /** Repetir o mesmo rateio nas demais parcelas do grupo. */
  applyToInstallments?: boolean;
  /**
   * Previsões recorrentes que este rateio substitui, para apagar junto. Sem
   * isso o mês contaria o gasto duas vezes (a previsão e a parte que a quita).
   */
  provisionalIdsToDelete?: string[];
}

/** Previsão gerada por uma regra recorrente, ainda não realizada. */
export interface RecurringProvisional {
  id: string;
  recurring_rule_id: string;
  description: string;
  amount: number;
  date: string;
}

/**
 * Previsões recorrentes do mês de `refDate`. O modal de divisão usa isto para
 * avisar que a parte vinculada a uma recorrência tem uma provisória sobrando
 * no mesmo mês — a que o gerador criou antes do pagamento entrar.
 */
export function useRecurringProvisionals(refDate: string | null | undefined, enabled = true) {
  const { user } = useAuth();
  const month = refDate ? refDate.slice(0, 7) : null;

  const { data: provisionals = EMPTY_PROVISIONALS, isLoading } = useQuery({
    queryKey: ["recurring-provisionals", user?.id, month],
    queryFn: async () => {
      if (!month || !user?.id) return [];
      const [year, monthNumber] = month.split("-").map(Number);
      const start = `${month}-01`;
      const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from("transactions")
        .select("id, recurring_rule_id, description, amount, date")
        .eq("user_id", user.id)
        .eq("is_provisional", true)
        .not("recurring_rule_id", "is", null)
        .gte("date", start)
        .lte("date", end);

      if (error) throw error;
      return (data ?? []) as RecurringProvisional[];
    },
    enabled: !!user && !!month && enabled,
  });

  return { provisionals, isLoading };
}

/** Partes de uma transação já dividida, na ordem de criação. */
export function useSplitGroup(splitGroupId: string | null) {
  const { user } = useAuth();

  const { data: parts = EMPTY_PARTS, isLoading } = useQuery({
    queryKey: ["split-group", splitGroupId],
    queryFn: async () => {
      if (!splitGroupId) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select(`*, categories (id, name, icon, color)`)
        .eq("split_group_id", splitGroupId)
        .order("split_parent_id", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!user && !!splitGroupId,
  });

  return { parts, isLoading };
}

/**
 * Demais parcelas do mesmo parcelamento que ainda podem receber a divisão
 * (não divididas e diferentes da própria transação aberta).
 */
export function useSplittableInstallments(
  transaction: Pick<Transaction, "id" | "installment_group_id"> | null,
  enabled = true,
) {
  const { user } = useAuth();
  const groupId = transaction?.installment_group_id ?? null;

  const { data: siblings = EMPTY_SIBLINGS, isLoading } = useQuery({
    queryKey: ["splittable-installments", groupId, transaction?.id],
    queryFn: async () => {
      if (!groupId || !transaction) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount, installment_number, description, due_date")
        .eq("installment_group_id", groupId)
        .neq("id", transaction.id)
        .is("split_group_id", null)
        .order("installment_number", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && !!groupId && enabled,
  });

  return { siblings, isLoading };
}

export function useTransactionSplit() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transaction-to-split"] });
    qc.invalidateQueries({ queryKey: ["split-group"] });
    qc.invalidateQueries({ queryKey: ["splittable-installments"] });
    qc.invalidateQueries({ queryKey: ["recurring-provisionals"] });
    qc.invalidateQueries({ queryKey: ["installment-group"] });
    qc.invalidateQueries({ queryKey: ["invoice-transactions"] });
    qc.invalidateQueries({ queryKey: ["credit-card-transactions-reconciliation"] });
    qc.invalidateQueries({ queryKey: ["credit_cards"] });
    qc.invalidateQueries({ queryKey: ["reimbursements"] });
    qc.invalidateQueries({ queryKey: ["corporate-expenses"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const splitTransaction = useMutation({
    mutationFn: async ({
      transaction,
      parts,
      applyToInstallments,
      provisionalIdsToDelete,
    }: SplitTransactionInput) => {
      const { error } = await supabase.rpc("split_transaction", {
        p_transaction_id: transaction.id,
        p_parts: parts as unknown as Json,
      });
      if (error) throw new Error(error.message);

      let installmentsSplit = 0;
      const failures: string[] = [];

      if (applyToInstallments && transaction.installment_group_id) {
        const { data: siblings, error: siblingsError } = await supabase
          .from("transactions")
          .select("id, amount, installment_number")
          .eq("installment_group_id", transaction.installment_group_id)
          .neq("id", transaction.id)
          .is("split_group_id", null)
          .order("installment_number", { ascending: true });

        if (siblingsError) throw new Error(siblingsError.message);

        for (const sibling of siblings ?? []) {
          const siblingParts = prorateParts(
            parts,
            Number(transaction.amount),
            Number(sibling.amount),
          );
          const { error: siblingError } = await supabase.rpc("split_transaction", {
            p_transaction_id: sibling.id,
            p_parts: siblingParts as unknown as Json,
          });

          if (siblingError) {
            failures.push(`Parcela ${sibling.installment_number ?? "?"}: ${siblingError.message}`);
          } else {
            installmentsSplit++;
          }
        }
      }

      // Só depois da divisão dar certo: a previsão é o registro que sobra, e
      // apagá-la antes deixaria o mês sem nada se a RPC recusasse o rateio. O
      // filtro `is_provisional` é uma trava — um id defasado no formulário não
      // pode apagar um lançamento real.
      let provisionalsDeleted = 0;
      if (provisionalIdsToDelete && provisionalIdsToDelete.length > 0) {
        const { data: deleted, error: deleteError } = await supabase
          .from("transactions")
          .delete()
          .in("id", provisionalIdsToDelete)
          .eq("is_provisional", true)
          .select("id");

        if (deleteError) {
          failures.push(`Previsões não excluídas: ${deleteError.message}`);
        } else {
          provisionalsDeleted = deleted?.length ?? 0;
        }
      }

      return { installmentsSplit, failures, provisionalsDeleted };
    },
    onSuccess: ({ installmentsSplit, failures, provisionalsDeleted }) => {
      invalidate();

      if (failures.length > 0) {
        toast({
          title: `Divisão aplicada com ${failures.length} pendência(s)`,
          description: failures.join(" • "),
          variant: "destructive",
        });
        return;
      }

      const details = [
        installmentsSplit > 0
          ? `O mesmo rateio foi aplicado a mais ${installmentsSplit} parcela(s).`
          : null,
        provisionalsDeleted > 0
          ? `${provisionalsDeleted} previsão(ões) recorrente(s) excluída(s).`
          : null,
      ].filter(Boolean);

      toast({
        title: "Transação dividida!",
        description: details.length > 0 ? details.join(" ") : undefined,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao dividir transação", description: e.message, variant: "destructive" }),
  });

  const unsplitTransaction = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase.rpc("unsplit_transaction", {
        p_transaction_id: transactionId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Divisão desfeita", description: "O valor voltou para a transação original." });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao desfazer divisão", description: e.message, variant: "destructive" }),
  });

  /**
   * Ajusta uma divisão já existente: atualiza valor/categoria/flags de cada
   * parte. Não passa pela RPC porque não cria nem apaga linhas — a soma já foi
   * validada no formulário.
   *
   * Partes já reembolsadas conservam o reimbursement_status: mexer nele aqui
   * deixaria o lançamento espelho (mark_reimbursed) órfão.
   */
  const updateSplitParts = useMutation({
    mutationFn: async ({
      updates,
      provisionalIdsToDelete,
    }: {
      updates: {
        id: string;
        amount: number;
        category_id: string | null;
        is_reimbursable: boolean;
        is_corporate_expense: boolean;
        reimbursement_status: string | null;
        recurring_rule_id: string | null;
      }[];
      /** Mesmo papel que em `splitTransaction`: a previsão que a parte passou
       *  a quitar sai junto, senão o mês conta o gasto duas vezes. */
      provisionalIdsToDelete?: string[];
    }) => {
      for (const part of updates) {
        const { error } = await supabase
          .from("transactions")
          .update({
            amount: part.amount,
            category_id: part.category_id,
            is_reimbursable: part.is_reimbursable,
            is_corporate_expense: part.is_corporate_expense,
            recurring_rule_id: part.recurring_rule_id,
            reimbursement_status:
              part.reimbursement_status === "reimbursed"
                ? "reimbursed"
                : part.is_reimbursable || part.is_corporate_expense
                  ? (part.reimbursement_status ?? "pending")
                  : null,
          })
          .eq("id", part.id);
        if (error) throw new Error(error.message);
      }

      if (provisionalIdsToDelete && provisionalIdsToDelete.length > 0) {
        const { error } = await supabase
          .from("transactions")
          .delete()
          .in("id", provisionalIdsToDelete)
          .eq("is_provisional", true);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Divisão atualizada!" });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao atualizar divisão", description: e.message, variant: "destructive" }),
  });

  return { splitTransaction, unsplitTransaction, updateSplitParts };
}
