import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * O ciclo da fatura não pode incluir o PAGAMENTO da fatura.
 *
 * `paySplitInvoice` grava o débito bancário como `type='expense'` com
 * `credit_card_id` preenchido e `is_card_payment=true`. O filtro do hook era
 * `type.eq.expense,is_refund.eq.true`, que deixa esse débito passar — e ele era
 * somado em `personalTotal` como se fosse compra. Medido no ciclo de 07/2026:
 * 25.317,06 no app contra 17.705,70 na fatura do Itaú, diferença igual ao
 * pagamento de 7.611,36.
 *
 * O mock encadeável registra cada chamada; as asserções são sobre a CONSULTA,
 * porque é lá que a exclusão precisa acontecer (filtrar depois não resolveria:
 * a linha ainda entraria em `transactions`, usada pela lista de itens).
 */
const chamadas = vi.hoisted(() => [] as Array<{ metodo: string; args: unknown[] }>);
const linhas = vi.hoisted(() => ({
  atual: [] as Record<string, unknown>[],
  /** Os lançamentos de reembolso que a segunda consulta (por id) devolve. */
  pagamentos: [] as Record<string, unknown>[],
}));

const queryBuilderMock = vi.hoisted(() => {
  const builder: Record<string, unknown> = {};
  for (const m of ["eq", "or", "not", "is", "in", "gte", "lte"]) {
    builder[m] = (...args: unknown[]) => {
      chamadas.push({ metodo: m, args });
      return builder;
    };
  }
  builder.select = (...args: unknown[]) => {
    chamadas.push({ metodo: "select", args });
    return builder;
  };
  // `order` encerra a cadeia das transações.
  builder.order = (...args: unknown[]) => {
    chamadas.push({ metodo: "order", args });
    return Promise.resolve({ data: linhas.atual, error: null });
  };
  // `maybeSingle` encerra a cadeia do ciclo (credit_card_invoices).
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  // A busca dos lançamentos de reembolso termina em `.in(...)` e é aguardada
  // direto — o builder precisa ser "thenable" para ela.
  builder.then = (resolve: (v: unknown) => void) =>
    resolve({ data: linhas.pagamentos, error: null });
  return builder;
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => queryBuilderMock },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

import { useInvoiceTransactions } from "@/hooks/useInvoiceTransactions";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const compra = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  description: "SUPER BEAL",
  amount: 100,
  date: "2026-07-20",
  due_date: "2026-08-15",
  is_corporate_expense: false,
  is_reimbursable: false,
  is_refund: false,
  is_card_payment: false,
  status: "completed",
  reimbursement_status: null,
  split_group_id: null,
  categories: null,
  ...over,
});

beforeEach(() => {
  chamadas.length = 0;
  linhas.atual = [];
  linhas.pagamentos = [];
});

describe("useInvoiceTransactions — pagamento de fatura", () => {
  it("exclui o pagamento na CONSULTA, não depois", async () => {
    linhas.atual = [compra()];

    const { result } = renderHook(
      () => useInvoiceTransactions({ creditCardId: "card-1", month: 8, year: 2026 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    const exclusao = chamadas.find(
      (c) => c.metodo === "not" && c.args[0] === "is_card_payment",
    );
    expect(exclusao).toBeDefined();
    // `not.is.true` e não `eq.false`: a coluna é anulável e lançamento antigo
    // tem NULL, que `eq.false` descartaria junto.
    expect(exclusao!.args.slice(1)).toEqual(["is", true]);
  });

  it("segue trazendo estorno gravado como receita (A10 não pode regredir)", async () => {
    const filtroTipo = () =>
      chamadas.find((c) => c.metodo === "or" && c.args[0] === "type.eq.expense,is_refund.eq.true");

    renderHook(
      () => useInvoiceTransactions({ creditCardId: "card-1", month: 8, year: 2026 }),
      { wrapper },
    );
    await waitFor(() => expect(filtroTipo()).toBeDefined());
  });

  it("não conta o pagamento em personalTotal se ele escapar da consulta", async () => {
    // Defesa em profundidade: mesmo que a consulta mude, o débito bancário
    // (type='expense', is_card_payment=true) não pode virar compra pessoal.
    linhas.atual = [
      compra(),
      compra({
        id: "pag",
        description: "FATURA PAGA PERSON MULTI",
        amount: 7611.36,
        is_card_payment: true,
      }),
    ];

    const { result } = renderHook(
      () => useInvoiceTransactions({ creditCardId: "card-1", month: 8, year: 2026 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.transactions).toHaveLength(2));

    expect(result.current.personalTotal).toBe(100);
    expect(result.current.myTotalToPay).toBe(100);
    expect(result.current.transactionsTotal).toBe(100);
  });
});

/**
 * Reembolsada por PIX continua na fatura do ciclo.
 *
 * Só o espelho de `mark_reimbursed` abate o cartão. O caso real: três
 * corporativas do Itaú (vencimento 15/09/2026) devolvidas pela empresa num PIX
 * de 753,58 que caiu na conta. O banco cobrou a fatura cheia; o app mostrava
 * o ciclo 753,58 abaixo, porque tirava toda reembolsada da soma.
 */
describe("useInvoiceTransactions — origem do reembolso", () => {
  const corporativa = (id: string, amount: number, over: Record<string, unknown> = {}) =>
    compra({
      id,
      amount,
      due_date: "2026-09-15",
      is_corporate_expense: true,
      reimbursement_status: "reimbursed",
      ...over,
    });

  const renderCiclo = () =>
    renderHook(() => useInvoiceTransactions({ creditCardId: "itau", month: 9, year: 2026 }), {
      wrapper,
    });

  it("devolvida por PIX segue no total e no que você pagou, não no corporativo", async () => {
    const pix = { reimbursement_income_id: "pix-raizhe" };
    linhas.atual = [
      compra({ id: "pessoal", amount: 1000, due_date: "2026-09-15" }),
      corporativa("apple", 93.9, pix),
      corporativa("barbuto", 573.1, pix),
      corporativa("santo-grao", 86.58, pix),
    ];

    const { result } = renderCiclo();
    await waitFor(() => expect(result.current.transactions).toHaveLength(4));

    expect(result.current.transactionsTotal).toBeCloseTo(1753.58, 2);
    expect(result.current.reimbursedOutsideTotal).toBeCloseTo(753.58, 2);
    expect(result.current.myTotalToPay).toBeCloseTo(1753.58, 2);
    // Não volta para o corporativo: o PayInvoiceModal criaria espelho para ele.
    expect(result.current.corporateTotal).toBe(0);
  });

  it("abatida por espelho na fatura continua fora do total", async () => {
    linhas.atual = [
      compra({ id: "pessoal", amount: 1000, due_date: "2026-09-15" }),
      corporativa("apple", 93.9, { reimbursement_payment_id: "espelho" }),
    ];
    linhas.pagamentos = [{ id: "espelho", is_card_payment: true }];

    const { result } = renderCiclo();
    await waitFor(() => expect(result.current.transactions).toHaveLength(2));

    expect(result.current.transactionsTotal).toBe(1000);
    expect(result.current.reimbursedOutsideTotal).toBe(0);
    // O espelho foi buscado por id — é ele que prova o caminho do cartão.
    expect(chamadas).toContainEqual({ metodo: "in", args: ["id", ["espelho"]] });
  });

  it("receita criada na conta (sem cartão) também segue no total", async () => {
    linhas.atual = [
      compra({ id: "pessoal", amount: 1000, due_date: "2026-09-15" }),
      corporativa("apple", 93.9, { reimbursement_payment_id: "receita-criada" }),
    ];
    linhas.pagamentos = [{ id: "receita-criada", is_card_payment: false }];

    const { result } = renderCiclo();
    await waitFor(() => expect(result.current.transactions).toHaveLength(2));

    expect(result.current.transactionsTotal).toBeCloseTo(1093.9, 2);
    expect(result.current.reimbursedOutsideTotal).toBeCloseTo(93.9, 2);
  });

  it("PIX vinculado não precisa da segunda consulta", async () => {
    linhas.atual = [corporativa("apple", 93.9, { reimbursement_income_id: "pix-raizhe" })];

    const { result } = renderCiclo();
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    expect(chamadas.some((c) => c.metodo === "in")).toBe(false);
  });
});
