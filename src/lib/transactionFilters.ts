/**
 * A regra ÚNICA de quais lançamentos entram nas contas do mês.
 *
 * Esta é a casa da regra. Antes ela também morava, escrita de novo, em
 * `reportUtils.filterPureExpenses`/`filterPureIncome` e nos dois callbacks do
 * Dashboard — três cópias que precisavam concordar e não concordavam (achado
 * M17). As cópias viraram chamadas daqui; o que sobrou em `reportUtils` é
 * competência e soma, não seleção.
 *
 * A forma do parâmetro é a MÍNIMA que as funções leem, e não `Transaction`,
 * para que telas com um recorte próprio reusem a regra em vez de reescrevê-la.
 */
export type TransactionFlags = {
  type: string;
  is_corporate_expense?: boolean | null;
  is_refund?: boolean | null;
  is_reimbursable?: boolean | null;
  is_reimbursement?: boolean | null;
  is_card_payment?: boolean | null;
  is_provisional?: boolean | null;
  status?: string | null;
  credit_card_id?: string | null;
};

/**
 * Estorno de compra no cartão gravado como RECEITA (`type='income'` +
 * `is_refund=true`).
 *
 * É a forma canônica que a importação da fatura (`InvoiceReviewModal`) e a
 * Conciliação de Faturas (`SpreadsheetReconciliationModal`) gravam todo
 * crédito, e a fatura já o subtrai (`invoiceTotal.ts` olha `is_refund` antes
 * de `type`). Os relatórios de despesa, não: `isSettledExpense` exigia
 * `type='expense'`, então esse estorno não abatia a categoria nem o mês — e
 * também não era receita (`isMonthlyIncome` recusa `is_refund`). Ficava
 * invisível, e a compra estornada continuava pesando como gasto.
 *
 * Só no CARTÃO, de propósito. Na conta a mesma forma NÃO quer dizer estorno:
 * a conciliação de conta (`AccountReconciliationModal`) grava como
 * receita+estorno TODA entrada do extrato por padrão — salário e PIX recebido
 * inclusive. Abater isso da despesa seria inventar economia. No cartão, um
 * crédito só pode ser estorno ou pagamento de fatura, e pagamento tem
 * `is_card_payment` (excluído em `isSettledExpense`).
 */
export function isCardIncomeRefund(t: TransactionFlags): boolean {
  return t.type === 'income' && t.is_refund === true && !!t.credit_card_id;
}

/**
 * Base de toda despesa que já aconteceu: efetivada (não provisória, não
 * pendente) e que não é transferência interna (pagamento de fatura).
 *
 * Inclui o estorno de cartão gravado como receita (`isCardIncomeRefund`):
 * ele é lado-despesa, só que com sinal trocado, e as camadas acima já o
 * separam pelo `is_refund`.
 *
 * NÃO decide sobre estorno nem sobre o recorte (pessoal / corporativa /
 * reembolsável) — isso é de quem chama. Existe para que as camadas acima
 * herdem as três exclusões em vez de repeti-las, que foi exatamente como as
 * cópias divergiram.
 */
export function isSettledExpense(t: TransactionFlags): boolean {
  return (
    (t.type === 'expense' || isCardIncomeRefund(t)) &&
    !t.is_card_payment &&
    !t.is_provisional &&
    t.status !== 'pending'
  );
}

/**
 * Despesa pessoal efetivada, ESTORNO INCLUÍDO — o conjunto que os relatórios
 * somam pelo líquido (estorno entra subtraindo, ver `calcNetExpense`).
 *
 * `isMonthlyExpense` e `isMonthlyExpenseRefund` são as duas metades disto,
 * partidas por `is_refund`: toda despesa desta base é uma ou a outra, nunca as
 * duas (invariante coberto por teste).
 */
export function isPersonalExpense(t: TransactionFlags): boolean {
  return isSettledExpense(t) && !t.is_corporate_expense && !t.is_reimbursable;
}

export function isMonthlyExpense(t: TransactionFlags): boolean {
  return isPersonalExpense(t) && !t.is_refund;
}

// Despesa "prevista": ainda não efetivada (provisória ou pendente), mas que
// consome orçamento no Planejamento. Complemento de isMonthlyExpense dentro
// da mesma base (pessoal, não-estorno, não-pagamento-de-fatura): toda despesa
// dessa base é paga OU prevista, nunca ambas.
export function isForecastExpense(t: TransactionFlags): boolean {
  return (
    t.type === 'expense' &&
    !t.is_corporate_expense &&
    !t.is_refund &&
    !t.is_reimbursable &&
    !t.is_card_payment &&
    (Boolean(t.is_provisional) || t.status === 'pending')
  );
}

/**
 * Estorno de despesa pessoal — subtrai da despesa do mês.
 *
 * O `!is_card_payment` chegou aqui no M17 e MUDA COMPORTAMENTO: esta cópia era
 * a única das três que aceitava estorno de pagamento de fatura. Como o próprio
 * pagamento nunca é contado (transferência interna), estornar um que nunca
 * entrou subtraía do mês uma despesa que ele não tinha — a despesa do mês saía
 * MENOR que a real. As outras duas cópias (Dashboard e `filterPureExpenses`)
 * já excluíam; é esta que estava incompleta, não elas.
 */
export function isMonthlyExpenseRefund(t: TransactionFlags): boolean {
  return isPersonalExpense(t) && t.is_refund === true;
}

export function isMonthlyIncome(t: TransactionFlags): boolean {
  return (
    t.type === 'income' &&
    !t.is_corporate_expense &&
    !t.is_refund &&
    !t.is_card_payment &&
    !t.is_reimbursement &&
    !t.is_provisional &&
    t.status !== 'pending'
  );
}

/**
 * Versões em lista, para quem filtra um array inteiro. Genéricas na transação
 * para devolver o MESMO tipo que receberam — `Transaction` entra, `Transaction`
 * sai, com todos os campos que o chamador precisa depois.
 *
 * Vieram de `reportUtils`, onde repetiam estas mesmas condições à mão.
 */
/**
 * O recorte que os chips do Dashboard oferecem: pessoal, da empresa,
 * reembolsável. É seleção por FLAG, como o resto deste módulo, e mora aqui
 * porque estava escrito duas vezes — igual, palavra por palavra — dentro de
 * `filterTransactionsByView` e `filterRefundsByView`.
 *
 * Duas cópias idênticas é o estado anterior a todo defeito desta família neste
 * repositório: uma ganha exclusão, a outra não, e as duas metades passam a
 * discordar em silêncio. Aqui elas não têm como divergir.
 *
 * NÃO decide sobre estorno nem sobre a base (`isSettledExpense`): compõe-se
 * com elas, não as substitui.
 */
export type ExpenseViewFilter = 'personal' | 'corporate' | 'reimbursable';

export function matchesExpenseView(
  t: TransactionFlags,
  filters: readonly ExpenseViewFilter[],
): boolean {
  const isPersonal = !t.is_corporate_expense && !t.is_reimbursable;

  return (
    (filters.includes('personal') && isPersonal) ||
    (filters.includes('corporate') && !!t.is_corporate_expense) ||
    (filters.includes('reimbursable') && !!t.is_reimbursable)
  );
}

export function filterPureExpenses<T extends TransactionFlags>(transactions: T[]): T[] {
  return transactions.filter(isPersonalExpense);
}

export function filterPureIncome<T extends TransactionFlags>(transactions: T[]): T[] {
  return transactions.filter(isMonthlyIncome);
}
