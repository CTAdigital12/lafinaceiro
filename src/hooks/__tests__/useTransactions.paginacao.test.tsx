import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Os Relatórios pedem `loadedCount: 10000`, mas o PostgREST corta cada resposta
 * em 1000 linhas sem erro. Com uma consulta só, o Fluxo de Caixa de nov/2026
 * recebia os 1000 lançamentos mais recentes (de 22/03 em diante) e o acumulado
 * de 6 meses saía R$ 7.895 em vez de R$ 4.257.
 *
 * O mock imita o servidor: cada `.range()` devolve a fatia pedida, limitada a
 * 1000, com o `count` total — como o PostgREST faz.
 */
const TETO = 1000;
const TOTAL = 1591;
const ranges = vi.hoisted(() => [] as Array<[number, number]>);

vi.mock("@/integrations/supabase/client", () => {
  const consulta = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "in", "is", "not", "or", "ilike", "order", "gt"]) {
      q[m] = () => q;
    }
    q.range = (from: number, to: number) => {
      ranges.push([from, to]);
      const fim = Math.min(to + 1, from + TETO, TOTAL);
      const data = Array.from({ length: Math.max(0, fim - from) }, (_, i) => ({ id: `t${from + i}` }));
      return Promise.resolve({ data, error: null, count: TOTAL });
    };
    return q;
  };
  return { supabase: { from: () => consulta(), rpc: vi.fn() } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/contexts/DateContext", () => ({ useDate: () => ({ month: 11, year: 2026 }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useCreditCardInvoiceSync", () => ({
  useCreditCardInvoiceSync: () => ({ syncInvoiceForCard: vi.fn() }),
}));

import { useTransactions } from "@/hooks/useTransactions";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  ranges.length = 0;
});

describe("useTransactions — leitura acima do teto do PostgREST", () => {
  it("os Relatórios (loadedCount 10000) recebem todos os lançamentos, não só 1000", async () => {
    const { result } = renderHook(
      () => useTransactions(undefined, undefined, { showAll: true, loadedCount: 10000 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.transactions).toHaveLength(TOTAL);
    expect(new Set(result.current.transactions.map((t) => t.id)).size).toBe(TOTAL);
    expect(result.current.hasMore).toBe(false);
  });

  it("a lista de Transações (20 linhas) continua com uma requisição só", async () => {
    const { result } = renderHook(() => useTransactions(undefined, undefined, { showAll: true }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.transactions).toHaveLength(20);
    expect(ranges).toEqual([[0, 19]]);
    expect(result.current.hasMore).toBe(true);
  });
});
