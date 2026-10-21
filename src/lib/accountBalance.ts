import { supabase } from "@/integrations/supabase/client";
import { todayYmd } from "@/lib/dateUtils";
import { fetchAllRows } from "@/lib/fetchAllRows";

/**
 * Saldo realizado por conta.
 *
 * Regra do app: `saldo = initial_balance + Σ(transações realizadas)`, onde
 * "realizada" é `status = 'completed'`, `is_provisional = false` e
 * `date <= hoje`.
 *
 * Esta soma vivia copiada em três lugares (useAccounts, AccountModal,
 * AccountReconciliationModal) e os três tinham o mesmo defeito (auditoria C2):
 * buscavam as transações sem paginar. O PostgREST corta a resposta no limite
 * de linhas do projeto (o padrão do Supabase é 1000) **sem devolver erro**, e a
 * soma saía truncada. Uma quarta cópia, no "Sincronizar" da revisão do extrato
 * (AccountReviewModal), escapou daquela passada e só veio para cá em out/2026.
 *
 * No `useAccounts` isso só exibia saldo errado. Em `AccountModal` e no
 * "Sincronizar saldo" da conciliação era pior: eles calculam
 * `initial_balance = saldoDesejado − somaRealizada` e **gravam** o resultado —
 * uma soma truncada virava um `initial_balance` errado persistido, e a partir
 * daí todo saldo do app ficava errado, inclusive depois de corrigir o bug.
 *
 * Aqui a busca é paginada até o fim (`fetchAllRows`), com ordenação estável.
 */

/**
 * Soma líquida das transações realizadas, agrupada por `account_id`.
 *
 * @param accountId quando informado, restringe a uma única conta.
 * @returns mapa `account_id -> net` (receitas positivas, despesas negativas).
 */
export async function fetchRealizedNetByAccount(
  accountId?: string,
): Promise<Record<string, number>> {
  // todayYmd() e não `toISOString()`: o corte precisa ser o "hoje" do usuário.
  // Em UTC-3, depois das 21h o toISOString já aponta para amanhã e lançamentos
  // futuros entravam no saldo realizado.
  const today = todayYmd();
  const netByAccount: Record<string, number> = {};

  const rows = await fetchAllRows((from, to) => {
    let query = supabase
      .from("transactions")
      .select("account_id, type, amount")
      .eq("status", "completed")
      .eq("is_provisional", false)
      .lte("date", today)
      .not("account_id", "is", null);

    if (accountId) {
      query = query.eq("account_id", accountId);
    }

    return query.order("id", { ascending: true }).range(from, to);
  });

  for (const row of rows) {
    if (!row.account_id) continue;
    const sign = row.type === "income" ? 1 : -1;
    netByAccount[row.account_id] =
      (netByAccount[row.account_id] || 0) + sign * Number(row.amount);
  }

  return netByAccount;
}

/** Mesma soma, para uma conta só. Retorna 0 quando não há lançamentos. */
export async function fetchRealizedNetForAccount(accountId: string): Promise<number> {
  const map = await fetchRealizedNetByAccount(accountId);
  return map[accountId] || 0;
}
