import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Mock do client Supabase. Cada `from(table)` retorna um query-builder
 * chainable cuja Promise final resolve com `{ data, error }`. A factory
 * permite override por chamada via `mockTableResponse`.
 *
 * Mantemos a tabela e os filtros aplicados na lista `lastQueryLog` para que
 * os testes possam afirmar que os filtros corretos (user_id, status,
 * is_provisional, janela de data) foram enviados.
 */
type QueryLogEntry = {
  table: string;
  filters: Array<{ method: string; args: unknown[] }>;
};

interface QueryBuilder extends PromiseLike<{ data: unknown; error: unknown }> {
  select: (cols: string) => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  gte: (col: string, val: unknown) => QueryBuilder;
  lte: (col: string, val: unknown) => QueryBuilder;
  order: (col: string, opts?: unknown) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
  not: (col: string, op: string, val: unknown) => QueryBuilder;
}

const supabaseMock = vi.hoisted(() => {
  const log: QueryLogEntry[] = [];
  const responsesByTable = new Map<string, { data: unknown; error: unknown }>();

  const makeBuilder = (table: string): QueryBuilder => {
    const entry: QueryLogEntry = { table, filters: [] };
    log.push(entry);
    const record = (method: string) => (...args: unknown[]) => {
      entry.filters.push({ method, args });
      return builder;
    };
    const builder = {
      select: record("select"),
      eq: record("eq"),
      gte: record("gte"),
      lte: record("lte"),
      order: record("order"),
      limit: record("limit"),
      not: record("not"),
      then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
        const res = responsesByTable.get(table) ?? { data: [], error: null };
        return Promise.resolve(res).then(resolve);
      },
    } as QueryBuilder;
    return builder;
  };

  return {
    from: vi.fn((table: string) => makeBuilder(table)),
    __log: log,
    __setResponse: (table: string, res: { data: unknown; error: unknown }) =>
      responsesByTable.set(table, res),
    __reset: () => {
      log.length = 0;
      responsesByTable.clear();
    },
  };
});

const authMock = vi.hoisted(() => ({ user: { id: "user-me" } as { id: string } | null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authMock,
}));

import { useUnlinkedIncomes } from "@/hooks/useUnlinkedIncomes";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.__reset();
  authMock.user = { id: "user-me" };
});

describe("useUnlinkedIncomes", () => {
  it("filtra por user_id, status=completed, is_provisional=false (regras de saldo + defesa em profundidade)", async () => {
    supabaseMock.__setResponse("transactions", { data: [], error: null });
    supabaseMock.__setResponse("investment_transactions", { data: [], error: null });

    const { result } = renderHook(
      () => useUnlinkedIncomes("acc-1", "2026-05-11"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const txQuery = supabaseMock.__log.find((q) => q.table === "transactions");
    expect(txQuery).toBeDefined();
    const flat = txQuery!.filters.map((f) => `${f.method}:${JSON.stringify(f.args)}`);

    expect(flat).toContain(`eq:["user_id","user-me"]`);
    expect(flat).toContain(`eq:["account_id","acc-1"]`);
    expect(flat).toContain(`eq:["type","income"]`);
    expect(flat).toContain(`eq:["status","completed"]`);
    expect(flat).toContain(`eq:["is_provisional",false]`);
  });

  it("aplica janela ±30 dias da refDate (gte/lte com offset correto)", async () => {
    supabaseMock.__setResponse("transactions", { data: [], error: null });
    supabaseMock.__setResponse("investment_transactions", { data: [], error: null });

    const { result } = renderHook(
      () => useUnlinkedIncomes("acc-1", "2026-05-11"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const txQuery = supabaseMock.__log.find((q) => q.table === "transactions");
    const gte = txQuery!.filters.find((f) => f.method === "gte");
    const lte = txQuery!.filters.find((f) => f.method === "lte");
    // 2026-05-11 ±30 dias = [2026-04-11, 2026-06-10]
    expect(gte?.args).toEqual(["date", "2026-04-11"]);
    expect(lte?.args).toEqual(["date", "2026-06-10"]);
  });

  it("exclui receitas já linkadas a investment_transactions (diff em memória)", async () => {
    const incomes = [
      { id: "tx-a", account_id: "acc-1", amount: 100, date: "2026-05-10", description: "Resgate A", category_id: null, user_id: "user-me" },
      { id: "tx-b", account_id: "acc-1", amount: 200, date: "2026-05-09", description: "Salário", category_id: null, user_id: "user-me" },
      { id: "tx-c", account_id: "acc-1", amount: 300, date: "2026-05-08", description: "Outro", category_id: null, user_id: "user-me" },
    ];
    const linked = [
      { linked_transaction_id: "tx-b" }, // tx-b já linkado
      { linked_transaction_id: null },   // ignore
    ];

    supabaseMock.__setResponse("transactions", { data: incomes, error: null });
    supabaseMock.__setResponse("investment_transactions", { data: linked, error: null });

    const { result } = renderHook(
      () => useUnlinkedIncomes("acc-1", "2026-05-11"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.incomes.map((i) => i.id)).toEqual(["tx-a", "tx-c"]);
  });

  it("desabilitado quando accountId é undefined (não dispara query)", async () => {
    supabaseMock.__setResponse("transactions", { data: [], error: null });

    const { result } = renderHook(
      () => useUnlinkedIncomes(undefined, "2026-05-11"),
      { wrapper },
    );

    // Aguarda micro-task — query desabilitada não dispara from()
    await new Promise((r) => setTimeout(r, 0));
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(result.current.incomes).toEqual([]);
  });

  it("desabilitado quando enabled=false", async () => {
    supabaseMock.__setResponse("transactions", { data: [], error: null });

    renderHook(
      () => useUnlinkedIncomes("acc-1", "2026-05-11", false),
      { wrapper },
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("propaga erro da query de transactions", async () => {
    supabaseMock.__setResponse("transactions", {
      data: null,
      error: new Error("perm-denied"),
    });
    supabaseMock.__setResponse("investment_transactions", { data: [], error: null });

    const { result } = renderHook(
      () => useUnlinkedIncomes("acc-1", "2026-05-11"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error?.message).toBe("perm-denied");
  });
});
