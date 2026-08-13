import { describe, it, expect } from "vitest";
import {
  invoiceDelta,
  countsTowardInvoice,
  sumInvoice,
} from "@/lib/invoiceTotal";

/** Linha completa e não provisória, que é o caso que conta na fatura. */
const row = (over: Record<string, unknown>) => ({
  amount: 100,
  type: "expense",
  is_refund: false,
  is_card_payment: false,
  status: "completed",
  is_provisional: false,
  ...over,
});

describe("invoiceDelta", () => {
  it("despesa soma", () => {
    expect(invoiceDelta(row({ amount: 250 }))).toBe(250);
  });

  it("pagamento de fatura abate", () => {
    expect(
      invoiceDelta(row({ type: "income", is_card_payment: true, amount: 400 })),
    ).toBe(-400);
  });

  it("estorno lançado como despesa abate", () => {
    expect(invoiceDelta(row({ is_refund: true, amount: 80 }))).toBe(-80);
  });

  // O A10 em uma linha: é assim que o SpreadsheetReconciliationModal grava
  // TODO estorno de conciliação, e o TypeScript antigo devolvia 0 aqui
  // enquanto o SQL devolvia -80.
  it("estorno lançado como RECEITA também abate", () => {
    expect(
      invoiceDelta(row({ type: "income", is_refund: true, amount: 80 })),
    ).toBe(-80);
  });

  it("receita comum que não é estorno nem pagamento não mexe na fatura", () => {
    expect(invoiceDelta(row({ type: "income", amount: 500 }))).toBe(0);
  });

  it("pagamento vence sobre estorno quando os dois flags vêm marcados", () => {
    // Espelha a ordem do CASE do SQL: is_card_payment é a primeira cláusula.
    expect(
      invoiceDelta(
        row({ type: "income", is_card_payment: true, is_refund: true, amount: 90 }),
      ),
    ).toBe(-90);
  });

  it("amount que não é número vira zero em vez de NaN", () => {
    expect(invoiceDelta(row({ amount: "abc" }))).toBe(0);
    expect(invoiceDelta(row({ amount: null }))).toBe(0);
  });

  it("amount em string, como o PostgREST devolve numeric, é somado", () => {
    expect(invoiceDelta(row({ amount: "123.45" }))).toBe(123.45);
  });
});

describe("countsTowardInvoice", () => {
  it("pendente fica de fora — é parcela futura, conta no limite, não na fatura", () => {
    expect(countsTowardInvoice(row({ status: "pending" }))).toBe(false);
  });

  it("provisória fica de fora", () => {
    expect(countsTowardInvoice(row({ is_provisional: true }))).toBe(false);
  });

  it("completa e não provisória entra", () => {
    expect(countsTowardInvoice(row({}))).toBe(true);
  });
});

describe("sumInvoice", () => {
  it("soma despesas, abate pagamento e estorno de qualquer type", () => {
    const total = sumInvoice([
      row({ amount: 1000 }),
      row({ amount: 500 }),
      row({ type: "income", is_refund: true, amount: 200 }),
      row({ type: "income", is_card_payment: true, amount: 300 }),
    ]);

    expect(total).toBe(1000);
  });

  it("ignora pendente e provisória", () => {
    const total = sumInvoice([
      row({ amount: 100 }),
      row({ amount: 999, status: "pending" }),
      row({ amount: 999, is_provisional: true }),
    ]);

    expect(total).toBe(100);
  });

  it("o mesmo conjunto dá o mesmo total nas duas formas de estorno", () => {
    // A regressão do A10: estes dois conjuntos descrevem o MESMO fato
    // financeiro e antes davam 900 e 1000 conforme a forma do estorno.
    const comoDespesa = sumInvoice([
      row({ amount: 1000 }),
      row({ type: "expense", is_refund: true, amount: 100 }),
    ]);
    const comoReceita = sumInvoice([
      row({ amount: 1000 }),
      row({ type: "income", is_refund: true, amount: 100 }),
    ]);

    expect(comoDespesa).toBe(900);
    expect(comoReceita).toBe(900);
  });

  it("piso em zero espelha o GREATEST(0, …) do SQL", () => {
    const total = sumInvoice([
      row({ amount: 100 }),
      row({ type: "income", is_card_payment: true, amount: 400 }),
    ]);

    // Saldo credor de 300 aparece como 0 — paridade deliberada com o SQL,
    // registrada como achado M2.
    expect(total).toBe(0);
  });

  it("lista vazia é zero", () => {
    expect(sumInvoice([])).toBe(0);
  });
});
