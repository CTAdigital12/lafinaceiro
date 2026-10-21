import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Previsto DIVIDIDO na conta, confirmado pelo extrato: todas as partes.
 *
 * O extrato traz o débito cheio (R$ 1.611,00); o sistema tem o previsto
 * dividido em 1.500,08 + 110,92. A importação o reconhecia e tratava como
 * "Já importada" — sem confirmar parte nenhuma. As duas ficavam pendentes
 * para sempre, fora do saldo da conta, que só conta o realizado.
 */

const updates = vi.hoisted(() => [] as Array<{ patch: unknown; ids: string[] }>);
const createTransactionMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "nova" }));
const regras = vi.hoisted(() => ({
  findCategoryForDescription: () => null,
  findCorporateForDescription: () => false,
  createRule: { mutateAsync: vi.fn() },
}));
const SEM_CARTOES = vi.hoisted(() => [] as unknown[]);

const PREVISTO_DIVIDIDO = vi.hoisted(() => [
  {
    id: "pix-primaria", date: "2026-09-10", amount: 1500.08, description: "PIX Luiz - reforma",
    original_description: null, status: "pending", is_provisional: false,
    split_group_id: "grupo-pix", split_parent_id: null,
  },
  {
    id: "pix-irma", date: "2026-09-10", amount: 110.92, description: "PIX Luiz - ingresso",
    original_description: null, status: "pending", is_provisional: false,
    split_group_id: "grupo-pix", split_parent_id: "pix-primaria",
  },
]);

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const nome of ["select", "eq", "gte", "lte", "order"]) chain[nome] = () => chain;
  // A busca pagina: a 1ª página traz o previsto dividido, a 2ª vem vazia.
  chain.range = (from: number) => Promise.resolve({ data: from === 0 ? PREVISTO_DIVIDIDO : [], error: null });
  chain.update = (patch: unknown) => ({
    in: (_col: string, ids: string[]) => {
      updates.push({ patch, ids });
      return Promise.resolve({ error: null });
    },
    eq: () => Promise.resolve({ error: null }),
  });
  return { supabase: { from: () => chain } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ categories: [], createCategory: { mutateAsync: vi.fn() } }),
  groupCategoriesByParent: () => [],
}));
vi.mock("@/hooks/useCategorizationRules", () => ({ useCategorizationRules: () => regras }));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({ createTransaction: { mutateAsync: createTransactionMock } }),
}));
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ accounts: [], updateAccount: { mutateAsync: vi.fn() } }),
}));
vi.mock("@/hooks/useCreditCards", () => ({ useCreditCards: () => ({ creditCards: SEM_CARTOES }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AccountReviewModal } from "../AccountReviewModal";

describe("AccountReviewModal — previsto dividido confirmado pelo extrato", () => {
  it("confirma as duas partes e não cria lançamento novo", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AccountReviewModal
          open
          onOpenChange={() => {}}
          items={[{ date: "2026-09-10", description: "PIX TRANSF LUIZ HE10 09", amount: 1611, type: "expense" }]}
          accountId="conta-itau"
          accountName="Itaú Conta"
        />
      </QueryClientProvider>,
    );

    // Espera a revisão montar (a checagem de duplicatas é assíncrona).
    await screen.findByDisplayValue("PIX TRANSF LUIZ HE10 09");
    await waitFor(() => expect(screen.getByRole("button", { name: /Confirmar Importação/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Confirmar Importação/ }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].patch).toEqual({ status: "completed", is_provisional: false });
    expect([...updates[0].ids].sort()).toEqual(["pix-irma", "pix-primaria"]);
    expect(createTransactionMock).not.toHaveBeenCalled();

    // E a revisão dizia o que ia acontecer, em vez de "Já importada".
    expect(screen.getByText(/Previsto dividido — as 2 partes serão confirmadas/)).toBeInTheDocument();
    expect(screen.queryByText("Já importada")).not.toBeInTheDocument();
  });
});
