/**
 * Conta única nas metas (21/11/2026): criar meta numa categoria que já tem meta
 * no mês, gravada pelo OUTRO login, atualiza essa meta em vez de criar uma
 * paralela no nome de quem digitou — que o outro login não enxergava.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown[]]> };

const supabaseMock = vi.hoisted(() => {
  const calls: Call[] = [];
  let existing: Array<{ id: string }> = [];

  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => {
      call.filters.push([name, args]);
      return builder;
    };
    for (const m of ["eq", "order", "limit", "single"]) builder[m] = chain(m);
    builder.select = (...args: unknown[]) => {
      call.filters.push(["select", args]);
      return builder;
    };
    builder.insert = (payload: unknown) => {
      call.op = "insert";
      call.payload = payload;
      return builder;
    };
    builder.update = (payload: unknown) => {
      call.op = "update";
      call.payload = payload;
      return builder;
    };
    builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) => {
      const isLookup = call.op === "select" && call.filters.some(([m]) => m === "limit");
      const data = isLookup ? existing : call.op === "select" ? [] : { id: "b-1" };
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return builder;
  };

  return {
    from: vi.fn(from),
    __calls: calls,
    __setExisting: (rows: Array<{ id: string }>) => {
      existing = rows;
    },
    __reset: () => {
      calls.length = 0;
      existing = [];
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "membro" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useBudgets } from "@/hooks/useBudgets";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const writes = () => supabaseMock.__calls.filter((c) => c.op === "insert" || c.op === "update");

beforeEach(() => supabaseMock.__reset());

describe("useBudgets.createBudget — conta única", () => {
  it("categoria já tem meta no mês (do outro login): atualiza essa meta, não insere", async () => {
    supabaseMock.__setExisting([{ id: "meta-do-dono" }]);
    const { result } = renderHook(() => useBudgets(9, 2026), { wrapper });

    await result.current.createBudget.mutateAsync({
      category_id: "lanches",
      month: 9,
      year: 2026,
      planned_amount: 100,
    });

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [w] = writes();
    expect(w.op).toBe("update");
    expect(w.payload).toEqual({ planned_amount: 100 });
    expect(w.filters).toContainEqual(["eq", ["id", "meta-do-dono"]]);

    // A busca não pode filtrar por user_id, senão não acha a meta do outro.
    const lookup = supabaseMock.__calls.find((c) => c.filters.some(([m]) => m === "limit"))!;
    expect(lookup.filters.some(([, args]) => args[0] === "user_id")).toBe(false);
    expect(lookup.filters).toContainEqual(["eq", ["category_id", "lanches"]]);
  });

  it("categoria sem meta no mês: insere no nome de quem digitou", async () => {
    const { result } = renderHook(() => useBudgets(9, 2026), { wrapper });

    await result.current.createBudget.mutateAsync({
      category_id: "lanches",
      month: 9,
      year: 2026,
      planned_amount: 100,
    });

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [w] = writes();
    expect(w.op).toBe("insert");
    expect(w.payload).toEqual([
      { category_id: "lanches", month: 9, year: 2026, planned_amount: 100, user_id: "membro" },
    ]);
  });
});
