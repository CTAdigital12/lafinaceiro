import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * `addInstallments` era a última escrita do grupo de parcelas que não passava
 * pela trava de fatura fechada (A3).
 *
 * O detalhe que importa: as parcelas novas herdam "último vencimento + N
 * meses", então acrescentar parcelas a uma série ANTIGA cria lançamentos dentro
 * de faturas já fechadas. Conferir só as parcelas existentes não pegaria isso —
 * a trava precisa ver as que vão nascer.
 */
const guardMock = vi.hoisted(() => vi.fn());
const escritas = vi.hoisted(() => [] as Array<{ op: string; payload: unknown }>);

const PARCELA_ANTIGA = vi.hoisted(() => ({
  id: "p-2",
  amount: 100,
  type: "expense",
  description: "Compra antiga 2/2",
  category_id: "cat-1",
  credit_card_id: "card-1",
  account_id: null,
  status: "completed",
  is_corporate_expense: false,
  is_reimbursable: false,
  installment_group_id: "grupo-1",
  installment_number: 2,
  total_installments: 2,
  date: "2026-01-10",
  due_date: "2026-02-15", // série encerrada em fevereiro
}));

vi.mock("@/lib/invoiceGuard", () => ({
  findClosedInvoiceBlock: guardMock,
  affectedCardIds: () => ["card-1"],
  CLOSED_INVOICE_MESSAGE: "Esta fatura está fechada.",
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: [PARCELA_ANTIGA], error: null }),
    update: (payload: unknown) => {
      escritas.push({ op: "update", payload });
      return { eq: () => Promise.resolve({ error: null }) };
    },
    insert: (payload: unknown) => {
      escritas.push({ op: "insert", payload });
      return Promise.resolve({ error: null });
    },
  };
  return { supabase: { from: () => builder } };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useCreditCardInvoiceSync", () => ({
  useCreditCardInvoiceSync: () => ({ syncInvoiceForCard: vi.fn() }),
}));

import { useInstallmentGroup } from "@/hooks/useInstallmentGroup";

const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

async function montarGrupo() {
  const { result } = renderHook(() => useInstallmentGroup("grupo-1"), { wrapper });
  await waitFor(() => expect(result.current.installments).toHaveLength(1));
  return result;
}

beforeEach(() => {
  escritas.length = 0;
  guardMock.mockReset();
  guardMock.mockResolvedValue(null); // por padrão, nada bloqueado
});

describe("addInstallments — trava de fatura fechada (A3)", () => {
  it("consulta a trava com as parcelas que vão NASCER, não só as existentes", async () => {
    const result = await montarGrupo();

    await result.current.addInstallments.mutateAsync(2);

    expect(guardMock).toHaveBeenCalledTimes(1);
    const linhas = guardMock.mock.calls[0][0] as Array<{ due_date: string }>;
    const vencimentos = linhas.map((l) => l.due_date);

    // a existente, mais as duas novas encadeadas a partir dela
    expect(vencimentos).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("não escreve nada quando a trava bloqueia", async () => {
    guardMock.mockResolvedValue("Esta fatura está fechada.");
    const result = await montarGrupo();

    await expect(result.current.addInstallments.mutateAsync(2)).rejects.toThrow(
      "Esta fatura está fechada.",
    );

    // Antes, o total_installments das existentes era atualizado ANTES da
    // trava: o grupo ficava com o total inflado e sem as parcelas.
    expect(escritas).toHaveLength(0);
  });

  it("escreve na ordem certa quando liberado: total, depois as novas", async () => {
    const result = await montarGrupo();

    await result.current.addInstallments.mutateAsync(1);

    expect(escritas[0].op).toBe("update");
    expect(escritas[0].payload).toMatchObject({ total_installments: 3 });
    expect(escritas[1].op).toBe("insert");
    expect(escritas[1].payload).toHaveLength(1);
  });
});

describe("updateCategoryForAll — trava de fatura fechada (A3)", () => {
  it("passa pela trava, como já fazia a mesma ação em lote na tela", async () => {
    const result = await montarGrupo();

    await result.current.updateCategoryForAll.mutateAsync("cat-2");

    expect(guardMock).toHaveBeenCalledTimes(1);
  });

  it("não grava a categoria quando a fatura está fechada", async () => {
    guardMock.mockResolvedValue("Esta fatura está fechada.");
    const result = await montarGrupo();

    await expect(
      result.current.updateCategoryForAll.mutateAsync("cat-2"),
    ).rejects.toThrow();

    expect(escritas).toHaveLength(0);
  });
});
