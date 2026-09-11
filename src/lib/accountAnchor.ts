/**
 * As duas metades do saldo de uma conta, que precisam ser inversas uma da outra.
 *
 * O modelo é `saldo = initial_balance + lançamentos realizados`. Isso tem um
 * lado de LEITURA (o que a tela mostra) e um lado de ESCRITA (que âncora gravar
 * para que a tela passe a mostrar o valor que a pessoa digitou). Os dois viviam
 * soltos — o de leitura embutido no `useAccounts`, o de escrita embutido no
 * `handleSubmit` do `AccountModal` — e nada prendia um ao outro.
 *
 * Estão aqui juntos de propósito, no mesmo espírito de `getCompetenceDate` e
 * `competenceRangeFilter` em `reportUtils.ts`: duas formas da mesma regra que
 * só valem se concordarem. O teste que importa é o da volta —
 * `computedBalance(anchorInitialBalance(S, net), net) === S` — porque é ele
 * que garante que reancorar uma conta faz a tela mostrar exatamente o que foi
 * digitado, para qualquer histórico de lançamentos.
 *
 * Sobre a coluna `current_balance`: ela NÃO participa deste cálculo. Era a
 * fonte de verdade do desenho antigo, e em março/2026 duas migrations
 * (`20260311154145` e `20260311160249`) derivaram `initial_balance` dela, de
 * uma vez, com `initial_balance = current_balance - soma(realizados)`. Dali em
 * diante ela deixou de ter função: era escrita a cada edição de conta e lida
 * por ninguém — exceto, por engano, pelo seletor de conta do `PayInvoiceModal`,
 * que mostrava um retrato congelado na última edição (achado M9, PR #99; na
 * conta real a diferença já era de R$ 1.471,27). Por isso o formulário passou a
 * gravar `initial_balance` diretamente, e `current_balance` saiu do tipo
 * `Account` para que ninguém volte a alcançá-la sem querer.
 */

/**
 * Lado da LEITURA: o saldo que a tela mostra.
 *
 * @param initialBalance âncora gravada na conta.
 * @param txNet soma líquida dos lançamentos realizados (receitas positivas,
 *   despesas negativas), até hoje.
 */
export function computedBalance(initialBalance: number, txNet: number): number {
  return Number(initialBalance ?? 0) + (txNet || 0);
}

/**
 * Lado da ESCRITA: a âncora que faz o saldo exibido virar `saldoDesejado`.
 *
 * Vale para os dois caminhos do formulário. Conta nova é o caso em que
 * `txNet` é 0 — não há lançamento nenhum ainda —, então a âncora é o próprio
 * valor digitado. Não existe fórmula separada para criação.
 *
 * @param saldoDesejado o que a pessoa digitou no campo de saldo.
 * @param txNet soma líquida dos lançamentos realizados da conta.
 */
export function anchorInitialBalance(saldoDesejado: number, txNet: number): number {
  return Number(saldoDesejado ?? 0) - (txNet || 0);
}
