import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Os filtros avançados da tela de Transações passaram a ser aplicados na
 * CONSULTA, não sobre o resultado já paginado. Estes testes afirmam que cada
 * filtro vira a condição certa no banco — é o que garante que filtrar por uma
 * categoria encontre o lançamento na linha 300, e não só nas 20 carregadas.
 *
 * O construtor de query do Supabase é substituído por um duplo encadeável que
 * registra cada chamada; as asserções são sobre essas chamadas.
 */
const chamadas = vi.hoisted(() => [] as Array<{ metodo: string; args: unknown[] }>);

const queryBuilderMock = vi.hoisted(() => {
  const builder: Record<string, unknown> = {};
  const metodos = [
    "select", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "or",
    "ilike", "order",
  ];
  for (const m of metodos) {
    builder[m] = (...args: unknown[]) => {
      chamadas.push({ metodo: m, args });
      return builder;
    };
  }
  // `range` encerra a cadeia: é o que o hook aguarda.
  builder.range = (...args: unknown[]) => {
    chamadas.push({ metodo: "range", args });
    return Promise.resolve({ data: [], error: null, count: 0 });
  };
  return builder;
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => queryBuilderMock, rpc: vi.fn() },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/contexts/DateContext", () => ({
  useDate: () => ({ month: 8, year: 2026 }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useCreditCardInvoiceSync", () => ({
  useCreditCardInvoiceSync: () => ({ syncInvoiceForCard: vi.fn() }),
}));

import { useTransactions, type TransactionQueryFilters } from "@/hooks/useTransactions";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

/** Roda o hook com os filtros dados e devolve as chamadas feitas à query. */
async function consultarCom(advancedFilters: TransactionQueryFilters) {
  chamadas.length = 0;
  renderHook(() => useTransactions(undefined, undefined, { advancedFilters }), {
    wrapper,
  });
  await waitFor(() =>
    expect(chamadas.some((c) => c.metodo === "range")).toBe(true),
  );
  return chamadas;
}

/** Houve uma chamada `metodo(...args)`? */
const chamou = (
  cs: Array<{ metodo: string; args: unknown[] }>,
  metodo: string,
  ...args: unknown[]
) => cs.some((c) => c.metodo === metodo && JSON.stringify(c.args) === JSON.stringify(args));

beforeEach(() => {
  chamadas.length = 0;
});

describe("useTransactions — filtros avançados na consulta (A7)", () => {
  it("filtra categoria com IN, e não no cliente", async () => {
    const cs = await consultarCom({ categoryIds: ["cat-1", "cat-2"] });

    expect(chamou(cs, "in", "category_id", ["cat-1", "cat-2"])).toBe(true);
  });

  it("aplica tipo, conta, cartão e status como igualdade", async () => {
    const cs = await consultarCom({
      type: "expense",
      accountId: "acc-1",
      creditCardId: "card-1",
      status: "pending",
    });

    expect(chamou(cs, "eq", "type", "expense")).toBe(true);
    expect(chamou(cs, "eq", "account_id", "acc-1")).toBe(true);
    expect(chamou(cs, "eq", "credit_card_id", "card-1")).toBe(true);
    expect(chamou(cs, "eq", "status", "pending")).toBe(true);
  });

  it("ignora os filtros em 'all' e os vazios", async () => {
    const cs = await consultarCom({
      categoryIds: [],
      type: "all",
      accountId: null,
      status: "all",
      installmentFilter: "all",
      corporateFilter: "all",
      cardPaymentFilter: "all",
    });

    expect(cs.some((c) => c.metodo === "in")).toBe(false);
    expect(chamou(cs, "eq", "type", "all")).toBe(false);
    expect(chamou(cs, "eq", "status", "all")).toBe(false);
  });

  it("parceladas usam > 1; avulsas incluem as sem parcelamento", async () => {
    const so = await consultarCom({ installmentFilter: "only_installments" });
    expect(chamou(so, "gt", "total_installments", 1)).toBe(true);

    const sem = await consultarCom({ installmentFilter: "no_installments" });
    // NULL precisa entrar: `lte.1` sozinho descartaria as linhas sem parcelamento.
    expect(chamou(sem, "or", "total_installments.is.null,total_installments.lte.1")).toBe(true);
  });

  it("'não corporativa' inclui as linhas com a flag nula", async () => {
    const cs = await consultarCom({ corporateFilter: "no_corporate" });

    // `not.eq.true` descartaria os nulos junto (NULL <> true é NULL).
    expect(chamou(cs, "or", "is_corporate_expense.is.null,is_corporate_expense.eq.false")).toBe(true);
  });

  it("'não pagamento de fatura' inclui as linhas com a flag nula", async () => {
    const cs = await consultarCom({ cardPaymentFilter: "no_card_payment" });

    expect(chamou(cs, "or", "is_card_payment.is.null,is_card_payment.eq.false")).toBe(true);
  });
});

describe("useTransactions — intervalo de datas sem desvio de fuso (A8)", () => {
  it("converte a data do date-picker pelo calendário local", async () => {
    // Date-picker devolve meia-noite LOCAL. Via toISOString, em UTC-3 isso
    // viraria "2026-08-09T03:00" -> a data inicial escorregava para o dia
    // anterior e a transação do dia 10 ficava de fora do próprio intervalo.
    const cs = await consultarCom({
      dateRange: {
        from: new Date(2026, 7, 10, 0, 0, 0),
        to: new Date(2026, 7, 20, 0, 0, 0),
      },
    });

    expect(chamou(cs, "gte", "date", "2026-08-10")).toBe(true);
    expect(chamou(cs, "lte", "date", "2026-08-20")).toBe(true);
  });

  it("aceita intervalo aberto de um lado só", async () => {
    const cs = await consultarCom({
      dateRange: { from: new Date(2026, 7, 10), to: null },
    });

    expect(chamou(cs, "gte", "date", "2026-08-10")).toBe(true);
    expect(cs.some((c) => c.metodo === "lte" && c.args[0] === "date" && c.args[1] === null)).toBe(false);
  });
});

describe("useTransactions — paginação depois do filtro", () => {
  it("recorta com range DEPOIS de aplicar os filtros", async () => {
    const cs = await consultarCom({ categoryIds: ["cat-1"] });

    const posIn = cs.findIndex((c) => c.metodo === "in");
    const posRange = cs.findIndex((c) => c.metodo === "range");

    expect(posIn).toBeGreaterThanOrEqual(0);
    expect(posRange).toBeGreaterThan(posIn);
  });
});
