import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * O "Saldo em aberto" (`current_invoice`) soma TODO o histórico do cartão.
 * O PostgREST corta a resposta em 1000 linhas sem avisar, e em 21/10/2026 o
 * cartão Itaú passou desse teto: os pagamentos ficaram fora do corte e o saldo
 * foi gravado como R$ 209.222,63 contra 13.048,56 real.
 *
 * O mock imita o PostgREST: sem `.range()` devolve as primeiras 1000 linhas;
 * com `.range()` devolve a fatia pedida, também limitada a 1000.
 */
const TETO = 1000;

const LINHAS = vi.hoisted(() => {
  const linhas = [];
  // 1050 compras de R$ 10 e, no fim, 50 pagamentos de R$ 200.
  for (let i = 0; i < 1100; i++) {
    const pagamento = i >= 1050;
    linhas.push({
      id: `t${String(i).padStart(4, "0")}`,
      amount: pagamento ? 200 : 10,
      type: "expense",
      status: "completed",
      is_refund: false,
      is_card_payment: pagamento,
      is_provisional: false,
    });
  }
  return linhas;
});

const gravado = vi.hoisted(() => ({ payload: null as unknown }));

vi.mock("@/integrations/supabase/client", () => {
  const consulta = () => {
    let intervalo: [number, number] | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      order: () => q,
      range: (from: number, to: number) => {
        intervalo = [from, to];
        return q;
      },
      then: (resolve: (r: unknown) => unknown) => {
        const [from, to] = intervalo ?? [0, LINHAS.length - 1];
        const fim = Math.min(to + 1, from + TETO);
        return Promise.resolve({ data: LINHAS.slice(from, fim), error: null }).then(resolve);
      },
      update: (payload: unknown) => {
        gravado.payload = payload;
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
    return q;
  };
  return { supabase: { from: () => consulta() } };
});

import { useCreditCardInvoiceSync } from "@/hooks/useCreditCardInvoiceSync";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  gravado.payload = null;
});

describe("recalculateInvoice — cartão com mais de 1000 lançamentos", () => {
  it("soma o histórico inteiro, inclusive o que passa do teto do PostgREST", async () => {
    const { result } = renderHook(() => useCreditCardInvoiceSync(), { wrapper });

    await result.current.recalculateInvoice.mutateAsync("card-1");

    // 1050 × 10 − 50 × 200 = 500. Truncado em 1000 linhas daria 10.000.
    expect(gravado.payload).toMatchObject({ current_invoice: 500 });
  });
});
