import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * A tela de Atividades agrupa os lançamentos importados por `imported_at`. O
 * PostgREST corta a resposta em 1000 linhas sem avisar: a importação que
 * cruzasse o corte aparecia com contagem e total menores do que tem, e o
 * "Desfazer" dela apagaria mais do que a tela mostrava.
 *
 * O mock imita o PostgREST: sem `.range()` devolve as primeiras 1000 linhas;
 * com `.range()` devolve a fatia pedida, também limitada a 1000.
 */
const TETO = 1000;

const LINHAS = vi.hoisted(() => {
  const linhas = [];
  // Já na ordem da consulta (imported_at desc, id): 700 linhas da importação
  // de novembro e 400 da de outubro — 300 delas depois do corte.
  for (let i = 0; i < 1100; i++) {
    const outubro = i >= 700;
    linhas.push({
      id: `t${String(i).padStart(4, "0")}`,
      imported_at: outubro ? "2026-10-01T12:00:00Z" : "2026-11-01T12:00:00Z",
      amount: 1,
      date: outubro ? "2026-09-20" : "2026-10-20",
      credit_card_id: "card-1",
      account_id: null,
      credit_cards: { name: "Black" },
      accounts: null,
    });
  }
  return linhas;
});

vi.mock("@/integrations/supabase/client", () => {
  const consulta = () => {
    let intervalo: [number, number] | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      not: () => q,
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
      // Como o PostgREST: só conta as linhas apagadas quando pedem `count`.
      delete: (opts?: { count?: string }) => ({
        eq: () => Promise.resolve({ error: null, count: opts?.count ? 400 : null }),
      }),
    };
    return q;
  };
  return { supabase: { from: () => consulta() } };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

import { useActivities } from "@/hooks/useActivities";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("useActivities — mais de 1000 lançamentos importados", () => {
  it("conta a importação inteira, inclusive o que passa do teto do PostgREST", async () => {
    const { result } = renderHook(() => useActivities(), { wrapper });

    await waitFor(() => expect(result.current.activities).toHaveLength(2));

    const [novembro, outubro] = result.current.activities;
    expect(novembro).toMatchObject({ transaction_count: 700, total_amount: 700 });
    // Truncado em 1000 linhas, outubro sairia com 300.
    expect(outubro).toMatchObject({
      transaction_count: 400,
      total_amount: 400,
      first_date: "2026-09-20",
      source_name: "Black",
    });
  });
});

describe("useActivities — desfazer importação", () => {
  it("informa quantas transações o banco apagou", async () => {
    const { result } = renderHook(() => useActivities(), { wrapper });

    result.current.undoActivity("2026-10-01T12:00:00Z");

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "400 transações removidas com sucesso." }),
      ),
    );
  });
});
