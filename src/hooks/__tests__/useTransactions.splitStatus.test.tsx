import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Confirmar UMA parte de uma divisão tem que confirmar as irmãs.
 *
 * As partes nascem com o status do pai (RPC `split_transaction`), mas a edição
 * atualiza por `id`: em 14/09/2026 a parcela 3/4 do Airbnb estava com a
 * primária `completed` (R$ 688,48) e a irmã reembolsável `pending`
 * (R$ 425,24). Como o total da fatura só conta `completed`, o ciclo 09/2026
 * subdeclarava exatamente os R$ 425,24 — e a conciliação não acusava, porque
 * ela soma as partes e casava o R$ 1.113,72 inteiro com a planilha.
 *
 * As asserções são sobre as CHAMADAS ao banco: é lá que a propagação acontece.
 */
const chamadas = vi.hoisted(() => [] as Array<{ metodo: string; args: unknown[] }>);
const linhaAtualizada = vi.hoisted(() => ({ atual: null as Record<string, unknown> | null }));

const queryBuilderMock = vi.hoisted(() => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "neq", "or", "not", "is", "in", "gte", "lte", "order", "range"]) {
    builder[m] = (...args: unknown[]) => {
      chamadas.push({ metodo: m, args });
      return builder;
    };
  }
  builder.update = (...args: unknown[]) => {
    chamadas.push({ metodo: "update", args });
    return builder;
  };
  builder.maybeSingle = () => {
    chamadas.push({ metodo: "maybeSingle", args: [] });
    return Promise.resolve({ data: linhaAtualizada.atual, error: null });
  };
  // A cadeia da propagação termina no `.neq(...)`, sem `select`: o `await`
  // resolve o próprio builder, então ele precisa ser "thenable".
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return builder;
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => queryBuilderMock, rpc: vi.fn() },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/contexts/DateContext", () => ({ useDate: () => ({ month: 9, year: 2026 }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useCreditCardInvoiceSync", () => ({
  useCreditCardInvoiceSync: () => ({ syncInvoiceForCard: vi.fn() }),
}));

import { useTransactions } from "@/hooks/useTransactions";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

/** Edita o lançamento e devolve as chamadas de `update` que chegaram ao banco. */
async function editar(
  patch: Record<string, unknown>,
  linha: Record<string, unknown> | null = { split_group_id: "g1", credit_card_id: null, due_date: null },
) {
  linhaAtualizada.atual = linha;
  const { result } = renderHook(() => useTransactions(9, 2026), { wrapper });
  await result.current.updateTransaction.mutateAsync({ id: "parte-1", ...patch });
  return chamadas.filter((c) => c.metodo === "update");
}

/** A propagação é o `update` que filtra por `split_group_id`. */
const propagacao = (updates: Array<{ args: unknown[] }>) =>
  chamadas.find((c) => c.metodo === "eq" && c.args[0] === "split_group_id") ? updates.at(-1) : undefined;

beforeEach(() => {
  chamadas.length = 0;
  linhaAtualizada.atual = null;
});

describe("updateTransaction — status de uma divisão vale para o grupo", () => {
  it("confirmar uma parte propaga o status para as irmãs", async () => {
    const updates = await editar({ status: "completed", amount: 688.48 });

    expect(propagacao(updates)?.args[0]).toEqual({ status: "completed" });
    // A própria linha já foi atualizada pelo `.eq("id", ...)`; a propagação
    // exclui ela para não gravar duas vezes.
    expect(chamadas.some((c) => c.metodo === "neq" && c.args[0] === "id")).toBe(true);
    expect(chamadas.some((c) => c.metodo === "eq" && c.args[0] === "split_group_id")).toBe(true);
  });

  it("confirmar uma provisória propaga status e is_provisional juntos", async () => {
    const updates = await editar({ status: "completed", is_provisional: false });

    expect(propagacao(updates)?.args[0]).toEqual({ status: "completed", is_provisional: false });
  });

  it("não toca nas irmãs quando a edição não mexe em status nem em provisória", async () => {
    await editar({ amount: 700, description: "Airbnb" });

    expect(chamadas.some((c) => c.metodo === "eq" && c.args[0] === "split_group_id")).toBe(false);
  });

  it("lançamento sem divisão não dispara propagação", async () => {
    await editar({ status: "completed" }, { split_group_id: null, credit_card_id: null, due_date: null });

    expect(chamadas.some((c) => c.metodo === "eq" && c.args[0] === "split_group_id")).toBe(false);
  });

  it("o que é de cada parte NÃO é propagado", async () => {
    await editar({ is_reimbursable: true, reimbursement_status: "pending", category_id: "cat-1" });

    expect(chamadas.some((c) => c.metodo === "eq" && c.args[0] === "split_group_id")).toBe(false);
  });
});
