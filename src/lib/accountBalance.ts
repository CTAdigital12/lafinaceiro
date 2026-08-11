import { supabase } from "@/integrations/supabase/client";
import { todayYmd } from "@/lib/dateUtils";

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
 * soma saía truncada.
 *
 * No `useAccounts` isso só exibia saldo errado. Em `AccountModal` e no
 * "Sincronizar saldo" da conciliação era pior: eles calculam
 * `initial_balance = saldoDesejado − somaRealizada` e **gravam** o resultado —
 * uma soma truncada virava um `initial_balance` errado persistido, e a partir
 * daí todo saldo do app ficava errado, inclusive depois de corrigir o bug.
 *
 * Aqui a busca é paginada até o fim, com ordenação estável.
 */

/** Tamanho de página do fetch. Fica abaixo de qualquer teto usual do PostgREST. */
const PAGE_SIZE = 500;

/**
 * Trava de segurança: impede laço infinito caso a paginação se comporte de
 * forma inesperada. 200k lançamentos é ordens de grandeza acima de finanças
 * pessoais — se alguém chegar lá, é melhor falhar alto do que somar errado.
 */
const MAX_ROWS = 200_000;

interface RealizedRow {
  account_id: string | null;
  type: string;
  amount: number | string;
}

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

  let from = 0;

  for (;;) {
    let query = supabase
      .from("transactions")
      .select("account_id, type, amount")
      .eq("status", "completed")
      .eq("is_provisional", false)
      .lte("date", today)
      .not("account_id", "is", null)
      // Ordenação estável é obrigatória: sem ORDER BY o Postgres não garante a
      // mesma ordem entre páginas, e a paginação passaria a repetir e pular
      // linhas silenciosamente.
      .order("id", { ascending: true });

    if (accountId) {
      query = query.eq("account_id", accountId);
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as RealizedRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.account_id) continue;
      const sign = row.type === "income" ? 1 : -1;
      netByAccount[row.account_id] =
        (netByAccount[row.account_id] || 0) + sign * Number(row.amount);
    }

    // Avança pelo que REALMENTE veio, não por PAGE_SIZE: se o projeto tiver um
    // teto de linhas menor que PAGE_SIZE, avançar pelo tamanho pedido pularia
    // registros. Parar só em página vazia custa uma requisição a mais e é
    // correto sob qualquer teto.
    from += rows.length;

    if (from > MAX_ROWS) {
      throw new Error(
        "Volume de transações acima do previsto para o cálculo de saldo. " +
          "Nenhum valor foi gravado.",
      );
    }
  }

  return netByAccount;
}

/** Mesma soma, para uma conta só. Retorna 0 quando não há lançamentos. */
export async function fetchRealizedNetForAccount(accountId: string): Promise<number> {
  const map = await fetchRealizedNetByAccount(accountId);
  return map[accountId] || 0;
}
