import { describe, it, expect } from "vitest";
import {
  filterPureExpenses,
  filterPureIncome,
  isForecastExpense,
  isMonthlyExpense,
  isMonthlyExpenseRefund,
  isMonthlyIncome,
  isSettledExpense,
  matchesExpenseView,
  type ExpenseViewFilter,
  type TransactionFlags,
} from "@/lib/transactionFilters";

/**
 * Helper que cria uma transação base com o tipo dado e demais flags
 * em estado neutro (false / 'completed'), pra ficar fácil sobrescrever
 * só o atributo sob teste.
 */
const tx = (
  type: "expense" | "income",
  overrides: Partial<{
    is_corporate_expense: boolean | null;
    is_refund: boolean | null;
    is_reimbursable: boolean | null;
    is_reimbursement: boolean | null;
    is_card_payment: boolean | null;
    is_provisional: boolean | null;
    status: string | null;
  }> = {},
) => ({
  type,
  is_corporate_expense: false,
  is_refund: false,
  is_reimbursable: false,
  is_reimbursement: false,
  is_card_payment: false,
  is_provisional: false,
  status: "completed",
  ...overrides,
});

describe("isMonthlyExpense", () => {
  it("retorna true para expense comum, status='completed', sem flags", () => {
    expect(isMonthlyExpense(tx("expense"))).toBe(true);
  });

  it("retorna false se is_card_payment=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_card_payment: true }))).toBe(false);
  });

  it("retorna false se is_corporate_expense=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_corporate_expense: true }))).toBe(false);
  });

  it("retorna false se is_reimbursable=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_reimbursable: true }))).toBe(false);
  });

  it("retorna false se is_refund=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_refund: true }))).toBe(false);
  });

  it("retorna false se is_provisional=true", () => {
    expect(isMonthlyExpense(tx("expense", { is_provisional: true }))).toBe(false);
  });

  it("retorna false se status='pending'", () => {
    expect(isMonthlyExpense(tx("expense", { status: "pending" }))).toBe(false);
  });

  it("retorna true se status for diferente de 'pending' (ex: 'completed')", () => {
    expect(isMonthlyExpense(tx("expense", { status: "completed" }))).toBe(true);
  });

  it("retorna true se status for diferente de 'pending' (ex: 'failed')", () => {
    // Comportamento atual do helper: o único status excluído é 'pending'.
    expect(isMonthlyExpense(tx("expense", { status: "failed" }))).toBe(true);
  });

  it("retorna false se type='income'", () => {
    expect(isMonthlyExpense(tx("income"))).toBe(false);
  });
});

describe("isMonthlyIncome", () => {
  it("retorna true para income, completed, sem flags", () => {
    expect(isMonthlyIncome(tx("income"))).toBe(true);
  });

  it("retorna false para income com is_card_payment=true", () => {
    expect(isMonthlyIncome(tx("income", { is_card_payment: true }))).toBe(false);
  });

  it("retorna false para income com is_corporate_expense=true", () => {
    expect(isMonthlyIncome(tx("income", { is_corporate_expense: true }))).toBe(false);
  });

  it("retorna false para income com is_refund=true", () => {
    expect(isMonthlyIncome(tx("income", { is_refund: true }))).toBe(false);
  });

  it("retorna false para income com status='pending'", () => {
    expect(isMonthlyIncome(tx("income", { status: "pending" }))).toBe(false);
  });

  it("retorna false para expense", () => {
    expect(isMonthlyIncome(tx("expense"))).toBe(false);
  });
});

describe("isForecastExpense", () => {
  it("retorna true para expense provisória", () => {
    expect(isForecastExpense(tx("expense", { is_provisional: true }))).toBe(true);
  });

  it("retorna true para expense com status='pending'", () => {
    expect(isForecastExpense(tx("expense", { status: "pending" }))).toBe(true);
  });

  it("retorna false para expense comum já efetivada", () => {
    expect(isForecastExpense(tx("expense"))).toBe(false);
  });

  it("retorna false para provisória corporativa/reembolsável/estorno/pgto de fatura", () => {
    expect(isForecastExpense(tx("expense", { is_provisional: true, is_corporate_expense: true }))).toBe(false);
    expect(isForecastExpense(tx("expense", { is_provisional: true, is_reimbursable: true }))).toBe(false);
    expect(isForecastExpense(tx("expense", { is_provisional: true, is_refund: true }))).toBe(false);
    expect(isForecastExpense(tx("expense", { is_provisional: true, is_card_payment: true }))).toBe(false);
  });

  it("retorna false para income provisória", () => {
    expect(isForecastExpense(tx("income", { is_provisional: true }))).toBe(false);
  });

  it("particiona a base com isMonthlyExpense: toda despesa pessoal é paga OU prevista, nunca ambas", () => {
    const casos = [
      tx("expense"),
      tx("expense", { is_provisional: true }),
      tx("expense", { status: "pending" }),
      tx("expense", { is_provisional: true, status: "pending" }),
    ];
    casos.forEach((t) => {
      expect(isMonthlyExpense(t) || isForecastExpense(t)).toBe(true);
      expect(isMonthlyExpense(t) && isForecastExpense(t)).toBe(false);
    });
  });
});

describe("isMonthlyExpenseRefund", () => {
  it("retorna true para expense + is_refund=true + status='completed'", () => {
    expect(isMonthlyExpenseRefund(tx("expense", { is_refund: true }))).toBe(true);
  });

  it("retorna false para expense + is_refund=true + is_corporate_expense=true", () => {
    expect(
      isMonthlyExpenseRefund(
        tx("expense", { is_refund: true, is_corporate_expense: true }),
      ),
    ).toBe(false);
  });

  it("retorna false para expense + is_refund=true + is_reimbursable=true", () => {
    expect(
      isMonthlyExpenseRefund(
        tx("expense", { is_refund: true, is_reimbursable: true }),
      ),
    ).toBe(false);
  });

  it("retorna false para expense + is_refund=true + is_provisional=true", () => {
    expect(
      isMonthlyExpenseRefund(
        tx("expense", { is_refund: true, is_provisional: true }),
      ),
    ).toBe(false);
  });

  it("retorna false para income + is_refund=true (refund de receita não conta)", () => {
    expect(isMonthlyExpenseRefund(tx("income", { is_refund: true }))).toBe(false);
  });

  it("retorna false para expense + is_refund=false", () => {
    expect(isMonthlyExpenseRefund(tx("expense", { is_refund: false }))).toBe(false);
  });
});

describe("isSettledExpense (base compartilhada)", () => {
  it("aceita despesa efetivada e recusa as três exclusões de sempre", () => {
    expect(isSettledExpense(tx("expense"))).toBe(true);
    expect(isSettledExpense(tx("expense", { is_card_payment: true }))).toBe(false);
    expect(isSettledExpense(tx("expense", { is_provisional: true }))).toBe(false);
    expect(isSettledExpense(tx("expense", { status: "pending" }))).toBe(false);
  });

  it("não olha estorno nem recorte — quem chama decide", () => {
    expect(isSettledExpense(tx("expense", { is_refund: true }))).toBe(true);
    expect(isSettledExpense(tx("expense", { is_corporate_expense: true }))).toBe(true);
    expect(isSettledExpense(tx("expense", { is_reimbursable: true }))).toBe(true);
  });

  it("recusa receita", () => {
    expect(isSettledExpense(tx("income"))).toBe(false);
  });
});

describe("estorno de pagamento de fatura (a cópia que divergia — M17)", () => {
  /**
   * O pagamento de fatura NUNCA é contado como despesa (é transferência
   * interna). Um estorno dele, se contasse, subtrairia do mês uma despesa que
   * o mês não tem — e a despesa sairia MENOR que a real.
   *
   * Este teste FALHA com a versão anterior de `isMonthlyExpenseRefund`, que
   * não olhava `is_card_payment` (conferido revertendo a função antes de
   * entregar).
   */
  const estornoDeFatura = tx("expense", { is_refund: true, is_card_payment: true });

  it("não conta como estorno do mês", () => {
    expect(isMonthlyExpenseRefund(estornoDeFatura)).toBe(false);
  });

  it("não conta como despesa do mês nem entra nos relatórios", () => {
    expect(isMonthlyExpense(estornoDeFatura)).toBe(false);
    expect(filterPureExpenses([estornoDeFatura])).toEqual([]);
  });
});

describe("filterPureExpenses / filterPureIncome (vindas de reportUtils)", () => {
  it("filterPureExpenses mantém o estorno pessoal, que os relatórios somam pelo líquido", () => {
    const comum = tx("expense");
    const estorno = tx("expense", { is_refund: true });
    expect(filterPureExpenses([comum, estorno])).toEqual([comum, estorno]);
  });

  it("filterPureExpenses descarta corporativa, reembolsável, provisória, pendente e pgto de fatura", () => {
    const descartadas = [
      tx("expense", { is_corporate_expense: true }),
      tx("expense", { is_reimbursable: true }),
      tx("expense", { is_provisional: true }),
      tx("expense", { status: "pending" }),
      tx("expense", { is_card_payment: true }),
      tx("income"),
    ];
    expect(filterPureExpenses(descartadas)).toEqual([]);
  });

  it("filterPureIncome concorda com isMonthlyIncome lançamento a lançamento", () => {
    const casos = [
      tx("income"),
      tx("income", { is_refund: true }),
      tx("income", { is_card_payment: true }),
      tx("income", { is_reimbursement: true }),
      tx("income", { is_corporate_expense: true }),
      tx("income", { is_provisional: true }),
      tx("income", { status: "pending" }),
      tx("expense"),
    ];
    expect(filterPureIncome(casos)).toEqual(casos.filter(isMonthlyIncome));
  });

  it("preserva os campos da transação que recebeu (genérica, não achata o tipo)", () => {
    const [t] = filterPureExpenses([{ ...tx("expense"), id: "abc", amount: 10 }]);
    expect(t.id).toBe("abc");
  });

  /**
   * O invariante que substitui a cópia: o conjunto dos relatórios é
   * EXATAMENTE a união das duas metades que o Dashboard e o resumo usam. Se
   * alguém mexer numa das três funções sem mexer nas outras, isto quebra.
   */
  it("filterPureExpenses = isMonthlyExpense ∪ isMonthlyExpenseRefund, e as metades não se cruzam", () => {
    const universo = [
      tx("expense"),
      tx("expense", { is_refund: true }),
      tx("expense", { is_card_payment: true }),
      tx("expense", { is_refund: true, is_card_payment: true }),
      tx("expense", { is_corporate_expense: true }),
      tx("expense", { is_refund: true, is_corporate_expense: true }),
      tx("expense", { is_reimbursable: true }),
      tx("expense", { is_refund: true, is_reimbursable: true }),
      tx("expense", { is_provisional: true }),
      tx("expense", { is_refund: true, is_provisional: true }),
      tx("expense", { status: "pending" }),
      tx("expense", { is_refund: true, status: "pending" }),
      tx("income"),
      tx("income", { is_refund: true }),
    ];

    expect(filterPureExpenses(universo)).toEqual(
      universo.filter((t) => isMonthlyExpense(t) || isMonthlyExpenseRefund(t)),
    );
    universo.forEach((t) => {
      expect(isMonthlyExpense(t) && isMonthlyExpenseRefund(t)).toBe(false);
    });
  });
});

/**
 * O recorte dos chips do Dashboard.
 *
 * Estava escrito DUAS vezes dentro do `Dashboard.tsx`, palavra por palavra, em
 * `filterTransactionsByView` e `filterRefundsByView` — as duas metades da mesma
 * regra, partidas por `is_refund`. Duas cópias idênticas é o estado anterior a
 * todo defeito desta família aqui: uma ganha exclusão, a outra não.
 *
 * A equivalência com os callbacks antigos foi provada por um andaime temporário
 * sobre 49.152 combinações (2 tipos × 3 status × 4^5 flags × 8 recortes), duas
 * comparações cada, zero divergências. O andaime foi apagado; o que fica é o
 * comportamento que importa.
 */
describe("matchesExpenseView", () => {
  const despesa = (flags: Partial<TransactionFlags> = {}): TransactionFlags => ({
    type: "expense",
    status: "completed",
    ...flags,
  });

  const pessoal = despesa();
  const daEmpresa = despesa({ is_corporate_expense: true });
  const reembolsavel = despesa({ is_reimbursable: true });

  it("sem nenhum chip marcado, nada passa", () => {
    expect(matchesExpenseView(pessoal, [])).toBe(false);
    expect(matchesExpenseView(daEmpresa, [])).toBe(false);
    expect(matchesExpenseView(reembolsavel, [])).toBe(false);
  });

  it("'personal' é o que não é da empresa NEM reembolsável", () => {
    expect(matchesExpenseView(pessoal, ["personal"])).toBe(true);
    expect(matchesExpenseView(daEmpresa, ["personal"])).toBe(false);
    expect(matchesExpenseView(reembolsavel, ["personal"])).toBe(false);
  });

  it("cada chip seleciona a sua flag", () => {
    expect(matchesExpenseView(daEmpresa, ["corporate"])).toBe(true);
    expect(matchesExpenseView(reembolsavel, ["reimbursable"])).toBe(true);
    expect(matchesExpenseView(pessoal, ["corporate"])).toBe(false);
    expect(matchesExpenseView(pessoal, ["reimbursable"])).toBe(false);
  });

  it("os chips somam, não se excluem", () => {
    const todos: ExpenseViewFilter[] = ["personal", "corporate", "reimbursable"];
    expect(matchesExpenseView(pessoal, todos)).toBe(true);
    expect(matchesExpenseView(daEmpresa, todos)).toBe(true);
    expect(matchesExpenseView(reembolsavel, todos)).toBe(true);
  });

  // Uma despesa marcada como da empresa E reembolsável existe no banco; ela
  // não pode sumir quando só um dos dois chips está ligado.
  it("lançamento com as duas flags aparece em qualquer um dos dois chips", () => {
    const ambas = despesa({ is_corporate_expense: true, is_reimbursable: true });

    expect(matchesExpenseView(ambas, ["corporate"])).toBe(true);
    expect(matchesExpenseView(ambas, ["reimbursable"])).toBe(true);
    expect(matchesExpenseView(ambas, ["personal"])).toBe(false);
  });

  // As flags chegam do PostgREST como null quando nunca foram gravadas.
  it("trata null e undefined como 'não marcado', devolvendo sempre boolean", () => {
    const nulas = despesa({ is_corporate_expense: null, is_reimbursable: null });

    expect(matchesExpenseView(nulas, ["personal"])).toBe(true);
    expect(matchesExpenseView(nulas, ["corporate"])).toBe(false);
    expect(matchesExpenseView(nulas, ["reimbursable"])).toBe(false);
  });

  // O recorte NÃO decide sobre estorno nem sobre a base: quem compõe é a tela.
  // É isso que permite as duas metades do Dashboard usarem a mesma função.
  it("ignora is_refund — a metade é escolhida por quem chama", () => {
    const estorno = despesa({ is_refund: true });

    expect(matchesExpenseView(estorno, ["personal"])).toBe(true);
    expect(matchesExpenseView(pessoal, ["personal"])).toBe(true);
  });

  it("as duas metades do Dashboard são disjuntas e cobrem a base inteira", () => {
    const filtros: ExpenseViewFilter[] = ["personal", "corporate", "reimbursable"];
    const metadeDespesas = (t: TransactionFlags) =>
      isSettledExpense(t) && !t.is_refund && matchesExpenseView(t, filtros);
    const metadeEstornos = (t: TransactionFlags) =>
      isSettledExpense(t) && !!t.is_refund && matchesExpenseView(t, filtros);

    for (const t of [pessoal, daEmpresa, reembolsavel, despesa({ is_refund: true })]) {
      expect(metadeDespesas(t) && metadeEstornos(t)).toBe(false);
      expect(metadeDespesas(t) || metadeEstornos(t)).toBe(isSettledExpense(t));
    }
  });
});
