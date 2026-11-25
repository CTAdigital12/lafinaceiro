/**
 * Lê uma consulta do PostgREST até o fim, em páginas.
 *
 * O PostgREST corta a resposta no teto de linhas do projeto (o padrão do
 * Supabase é 1000) **sem devolver erro**: a lista volta truncada com cara de
 * completa. Foi assim que a soma do saldo saiu errada e GRAVADA como
 * `initial_balance` (auditoria C2), e que a revisão do extrato deixaria de ver
 * lançamentos já existentes, importando-os de novo.
 *
 * Fica fora de qualquer hook e não importa o cliente do Supabase, para ser
 * testável sem ele: quem chama monta a consulta e só repassa o intervalo.
 *
 * A consulta PRECISA ter ordenação estável (`.order("id")`). Sem ORDER BY o
 * Postgres não garante a mesma ordem entre páginas, e a paginação repete e
 * pula linhas em silêncio — o mesmo defeito que ela existe para evitar.
 */

/** Tamanho de página. Fica abaixo de qualquer teto usual do PostgREST. */
export const PAGE_SIZE = 500;

/**
 * Trava de segurança contra laço infinito caso a paginação se comporte de
 * forma inesperada. 200k lançamentos é ordens de grandeza acima de finanças
 * pessoais — se alguém chegar lá, é melhor falhar alto do que seguir com dado
 * incompleto.
 */
export const MAX_ROWS = 200_000;

/**
 * @param page monta a consulta para as linhas `from..to` (inclusivo, como o
 *   `.range()` do supabase-js).
 * @throws o erro da consulta, em vez de devolver o que já tinha lido.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];

  for (;;) {
    const from = rows.length;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const chunk = data ?? [];
    if (chunk.length === 0) break;
    rows.push(...chunk);

    // Avança pelo que REALMENTE veio, não por PAGE_SIZE: se o projeto tiver um
    // teto de linhas menor que PAGE_SIZE, avançar pelo tamanho pedido pularia
    // registros. Parar só em página vazia custa uma requisição a mais e é
    // correto sob qualquer teto.
    if (rows.length > MAX_ROWS) {
      throw new Error(
        "Volume de lançamentos acima do previsto. A leitura foi interrompida " +
          "para não seguir com dados incompletos.",
      );
    }
  }

  return rows;
}

/**
 * Lê até `limit` linhas, em páginas — para quem pede um TETO e não "tudo".
 *
 * Pedir `.range(0, 9999)` numa consulta só NÃO traz 10.000 linhas: o PostgREST
 * corta no teto do projeto (1000) e devolve sem erro. Era o que o
 * `useTransactions` fazia para os Relatórios, e o Fluxo de Caixa de nov/2026
 * mostrava acumulado de R$ 7.895 no lugar de R$ 4.257 — os lançamentos antes de
 * 22/03 ficavam de fora, e com eles as parcelas de cartão compradas antes e
 * vencidas de junho a setembro.
 *
 * Com `limit` menor que a página (a lista de Transações, 20 linhas), é uma
 * requisição só, como antes. A consulta precisa de ordenação estável (ver
 * `fetchAllRows`).
 */
export async function fetchRowsUpTo<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  limit: number,
): Promise<T[]> {
  const rows: T[] = [];

  while (rows.length < limit) {
    const from = rows.length;
    const to = Math.min(from + PAGE_SIZE, limit) - 1;
    const { data, error } = await page(from, to);
    if (error) throw error;

    const chunk = data ?? [];
    if (chunk.length === 0) break;
    // Avança pelo que veio, não pelo pedido: sob um teto menor que PAGE_SIZE,
    // avançar pelo tamanho pedido pularia linhas.
    rows.push(...chunk);
  }

  return rows;
}
