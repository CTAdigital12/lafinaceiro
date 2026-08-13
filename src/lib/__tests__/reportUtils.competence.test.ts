import { describe, it, expect } from "vitest";
import { getCompetenceDate, competenceRangeFilter } from "@/lib/reportUtils";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * A regra de competência decide em que MÊS uma transação aparece. Ela existe em
 * duas formas — uma em JS (`getCompetenceDate`, para agrupar o que já veio) e
 * uma em SQL (`competenceRangeFilter`, para recortar no banco) — e as duas
 * precisam concordar. Estes testes prendem as duas juntas.
 *
 * O ramo que vive sendo esquecido é o do cartão SEM vencimento: ele não
 * satisfaz "filtra por date" (tem cartão) nem "filtra por due_date" (é nulo), e
 * a transação some de todos os meses.
 */
const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: "t1",
    date: "2026-08-25",
    due_date: null,
    credit_card_id: null,
    amount: 100,
    type: "expense",
    description: "x",
    status: "completed",
  }) as Transaction;

describe("getCompetenceDate", () => {
  it("sem cartão: vale a data da compra", () => {
    expect(getCompetenceDate(tx({}))).toBe("2026-08-25");
  });

  it("com cartão e vencimento: vale o vencimento", () => {
    const t = tx({});
    t.credit_card_id = "card-1";
    t.due_date = "2026-09-15";

    // A compra é de agosto, mas entra na competência de setembro.
    expect(getCompetenceDate(t)).toBe("2026-09-15");
  });

  it("com cartão e SEM vencimento: volta a valer a data da compra", () => {
    const t = tx({});
    t.credit_card_id = "card-1";
    t.due_date = null;

    expect(getCompetenceDate(t)).toBe("2026-08-25");
  });

  it("sem cartão ignora um vencimento preenchido", () => {
    const t = tx({});
    t.due_date = "2026-09-15";

    expect(getCompetenceDate(t)).toBe("2026-08-25");
  });
});

describe("competenceRangeFilter", () => {
  const filtro = competenceRangeFilter("2026-08-01", "2026-08-31");
  const ramos = filtro.split(/,(?=and\()/);

  it("tem um ramo para cada caso que getCompetenceDate distingue", () => {
    // sem cartão · cartão com vencimento · cartão sem vencimento
    expect(ramos).toHaveLength(3);
  });

  it("ramo 1: sem cartão, recorta pela data da compra", () => {
    expect(ramos[0]).toBe(
      "and(credit_card_id.is.null,date.gte.2026-08-01,date.lte.2026-08-31)",
    );
  });

  it("ramo 2: com cartão, recorta pelo vencimento", () => {
    expect(ramos[1]).toBe(
      "and(credit_card_id.not.is.null,due_date.gte.2026-08-01,due_date.lte.2026-08-31)",
    );
  });

  it("ramo 3: com cartão e sem vencimento, volta para a data da compra", () => {
    // Sem este ramo a transação não satisfaz nenhuma condição e desaparece de
    // TODOS os meses — não existe período em que ela apareça.
    expect(ramos[2]).toBe(
      "and(credit_card_id.not.is.null,due_date.is.null,date.gte.2026-08-01,date.lte.2026-08-31)",
    );
  });
});
