import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * Quitar VÁRIOS lançamentos previstos com UM débito real (ex.: um PIX que
 * pagou duas parcelas do mês).
 *
 * O trabalho está na RPC `settle_transactions_with_payment` (migration
 * 20260824170000): os previstos viram as partes de uma divisão — conservando
 * id, categoria, parcelamento e recorrência — e o lançamento do pagamento é
 * apagado, porque o grupo passa a ocupar o lugar dele. Assim o parcelamento
 * não encolhe e a conciliação continua casando 1:1 com a linha do extrato,
 * que `collapseSplitGroups` reconstrói somando as partes.
 *
 * Única coluna que a quitação PREENCHE: previsto sem categoria herda a do
 * pagamento (20260828120000), que de outro modo morreria nesse delete.
 */

/** Janela de datas para listar previstos candidatos, em dias. */
const DATE_WINDOW_DAYS = 60;

export interface SettleCandidate {
  id: string;
  description: string;
  amount: number;
  date: string;
  due_date: string | null;
  status: string;
  is_provisional: boolean;
  installment_number: number | null;
  total_installments: number | null;
  account_id: string | null;
  categories?: { name: string } | null;
  accounts?: { name: string } | null;
}

const EMPTY_CANDIDATES: SettleCandidate[] = [];

function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Lançamentos previstos (pendentes ou provisórios) FORA DE CARTÃO, do mesmo
 * tipo do pagamento e dentro de ±60 dias dele, que ainda podem ser quitados.
 *
 * Os filtros espelham as travas da RPC, para o formulário não oferecer opção
 * que o banco vai recusar: nada de cartão (fatura tem o seu próprio fluxo),
 * nada já dividido, e nunca o próprio pagamento.
 *
 * NÃO filtra pela conta do pagamento, de propósito. A RPC reatribui
 * `account_id = <conta do pagamento>` nos alvos, ou seja, a operação é "este
 * débito pagou estes previstos, onde quer que estivessem previstos" — prever
 * no banco A e pagar pelo B é caso legítimo. Filtrar também sumiria com as
 * provisórias de recorrência cuja regra não tem conta (`account_id` nulo).
 * Por isso a conta de cada candidata é EXIBIDA na lista: a diferença fica
 * visível em vez de escondida. O texto da tela dizia "nesta conta" e mentia.
 */
export function useSettleCandidates(
  payment: { id: string; type: string; date: string } | null,
  enabled = true,
) {
  const { user } = useAuth();

  const { data: candidates = EMPTY_CANDIDATES, isLoading } = useQuery({
    queryKey: ["settle-candidates", user?.id, payment?.id, payment?.date],
    queryFn: async () => {
      if (!payment || !user?.id) return [];

      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, description, amount, date, due_date, status, is_provisional, installment_number, total_installments, account_id, categories (name), accounts (name)",
        )
        .eq("user_id", user.id)
        .eq("type", payment.type)
        .is("credit_card_id", null)
        .is("split_group_id", null)
        .eq("is_card_payment", false)
        .neq("id", payment.id)
        .or("status.eq.pending,is_provisional.eq.true")
        .gte("date", shiftIsoDate(payment.date, -DATE_WINDOW_DAYS))
        .lte("date", shiftIsoDate(payment.date, DATE_WINDOW_DAYS))
        .order("date", { ascending: true });

      if (error) throw error;
      return (data ?? []) as SettleCandidate[];
    },
    enabled: !!user && !!payment && enabled,
  });

  return { candidates, isLoading };
}

export function useSettleWithPayment() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const settleWithPayment = useMutation({
    mutationFn: async ({
      paymentId,
      targetIds,
    }: {
      paymentId: string;
      targetIds: string[];
    }) => {
      const { error } = await supabase.rpc("settle_transactions_with_payment", {
        p_payment_id: paymentId,
        p_target_ids: targetIds,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["settle-candidates"] });
      qc.invalidateQueries({ queryKey: ["installment-group"] });
      qc.invalidateQueries({ queryKey: ["pending-installments"] });
      qc.invalidateQueries({ queryKey: ["recurring-provisionals"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["reimbursements"] });
      toast({
        title: "Previstos quitados!",
        description: "Eles viraram as partes deste pagamento.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao quitar previstos", description: e.message, variant: "destructive" }),
  });

  return { settleWithPayment };
}
