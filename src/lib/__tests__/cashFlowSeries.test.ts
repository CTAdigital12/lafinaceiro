import { describe, it, expect } from "vitest";
import { buildCashFlowSeries } from "@/lib/cashFlowSeries";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * O achado M2: o Fluxo de Caixa aplicava `Math.max(0, …)` na despesa do mês.
 *
 * A despesa já vem LÍQUIDA (estorno entra subtraindo), então o piso apagava o
 * mês em que os estornos superam as despesas — o saldo mensal, o acumulado e a
 * taxa de poupança ficavam MENORES que o real, porque a devolução simplesmente
 * não era somada.
 *
 * Os dois primeiros testes deste arquivo falham com o piso de volta no lugar.
 */
const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: Math.random().toString(36).slice(2),
    date: "2026-08-10",
    due_date: null,
    credit_card_id: null,
    amount: 100,
    type: "expense",
    description: "x",
    status: "completed",
    is_provisional: false,
    is_refund: false,
    is_card_payment: false,
    is_corporate_expense: false,
    is_reimbursable: false,
    is_reimbursement: false,
    ...over,
  }) as Transaction;

const MESES = ["2026-07", "2026-08"];

describe("buildCashFlowSeries — estorno maior que a despesa (M2)", () => {
  it("mantém a despesa líquida NEGATIVA em vez de zerar", () => {
    const serie = buildCashFlowSeries(
      [
        tx({ date: "2026-08-05", amount: 100 }),
        tx({ date: "2026-08-20", amount: 400, is_refund: true }),
      ],
      MESES,
    );

    const agosto = serie.months[1];
    // 100 de despesa contra 400 de estorno: no líquido entraram 300.
    expect(agosto.netExpense).toBe(-300);
  });

  it("soma a devolução ao saldo do mês, ao acumulado e ao último mês", () => {
    const serie = buildCashFlowSeries(
      [
        tx({ date: "2026-08-05", amount: 100 }),
        tx({ date: "2026-08-20", amount: 400, is_refund: true }),
        tx({ date: "2026-08-01", amount: 1000, type: "income" }),
      ],
      MESES,
    );

    const agosto = serie.months[1];
    // Com o piso, isto dava 1000 — a devolução de 300 sumia do saldo.
    expect(agosto.balance).toBe(1300);
    expect(agosto.cumulativeBalance).toBe(1300);
    expect(serie.periodBalance).toBe(1300);
    expect(serie.lastMonthBalance).toBe(1300);
  });

  it("a taxa de poupança pode passar de 100% no mês de devolução", () => {
    const serie = buildCashFlowSeries(
      [
        tx({ date: "2026-08-20", amount: 300, is_refund: true }),
        tx({ date: "2026-08-01", amount: 1000, type: "income" }),
      ],
      MESES,
    );

    // 1300 guardados sobre 1000 recebidos. Com o piso dava exatamente 100%.
    expect(serie.avgSavingRate).toBe(130);
  });
});

describe("buildCashFlowSeries — comportamento normal preservado", () => {
  it("mês comum: despesa positiva e saldo descontado", () => {
    const serie = buildCashFlowSeries(
      [
        tx({ date: "2026-08-05", amount: 400 }),
        tx({ date: "2026-08-01", amount: 1000, type: "income" }),
      ],
      MESES,
    );

    expect(serie.months[1].netExpense).toBe(400);
    expect(serie.months[1].balance).toBe(600);
    expect(serie.avgSavingRate).toBe(60);
  });

  it("estorno parcial só abate, não vira crédito", () => {
    const serie = buildCashFlowSeries(
      [
        tx({ date: "2026-08-05", amount: 400 }),
        tx({ date: "2026-08-20", amount: 150, is_refund: true }),
      ],
      MESES,
    );

    expect(serie.months[1].netExpense).toBe(250);
  });

  it("acumula de um mês para o outro e conta os positivos", () => {
    const serie = buildCashFlowSeries(
      [
        tx({ date: "2026-07-01", amount: 1000, type: "income" }),
        tx({ date: "2026-07-10", amount: 200 }),
        tx({ date: "2026-08-10", amount: 500 }),
      ],
      MESES,
    );

    expect(serie.months[0].balance).toBe(800);
    expect(serie.months[1].balance).toBe(-500);
    expect(serie.months[1].cumulativeBalance).toBe(300);
    expect(serie.positiveMonths).toBe(1);
    expect(serie.totalMonths).toBe(2);
  });

  it("mês sem nenhum lançamento aparece zerado, não some", () => {
    const serie = buildCashFlowSeries([tx({ date: "2026-08-10", amount: 50 })], MESES);

    expect(serie.months).toHaveLength(2);
    expect(serie.months[0]).toMatchObject({ month: "2026-07", income: 0, netExpense: 0 });
  });

  it("mês sem receita fica fora da média de poupança", () => {
    const serie = buildCashFlowSeries(
      [
        tx({ date: "2026-07-01", amount: 1000, type: "income" }),
        tx({ date: "2026-07-10", amount: 500 }),
        tx({ date: "2026-08-10", amount: 900 }),
      ],
      MESES,
    );

    // Só julho entra: agosto não teve receita e dividiria por zero.
    expect(serie.avgSavingRate).toBe(50);
  });

  it("despesa de cartão cai na competência do vencimento", () => {
    const serie = buildCashFlowSeries(
      [tx({ date: "2026-07-28", due_date: "2026-08-10", credit_card_id: "c1", amount: 250 })],
      MESES,
    );

    expect(serie.months[0].netExpense).toBe(0);
    expect(serie.months[1].netExpense).toBe(250);
  });

  it("provisório, pendente, pagamento de fatura e corporativo ficam de fora", () => {
    const serie = buildCashFlowSeries(
      [
        tx({ date: "2026-08-02", amount: 10, is_provisional: true }),
        tx({ date: "2026-08-03", amount: 20, status: "pending" }),
        tx({ date: "2026-08-04", amount: 30, is_card_payment: true }),
        tx({ date: "2026-08-05", amount: 40, is_corporate_expense: true }),
        tx({ date: "2026-08-06", amount: 50, is_reimbursable: true }),
        tx({ date: "2026-08-07", amount: 7 }),
      ],
      MESES,
    );

    expect(serie.months[1].netExpense).toBe(7);
  });
});
