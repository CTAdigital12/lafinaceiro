import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Lançamento feito à mão, depois confirmado pelo extrato.
 *
 * Em 13/10/2026 a PIX do Rulhan (R$ 425,24) foi lançada à mão como
 * "Airbnb - Rulhan", vinculada ao reembolso da parcela do Airbnb. O OFX trouxe
 * "PIX TRANSF Rulhan 13 10", a revisão a mostrou como nova e ela entrou de
 * novo: saldo da conta R$ 425,24 acima do banco. A regra está em
 * `deduplication.manual.test.ts`; aqui se prova a fiação até o que é gravado.
 */

const updates = vi.hoisted(() => [] as Array<{ patch: unknown; ids: string[] }>);
const createTransactionMock = vi.hoisted(() => vi.fn());
const regras = vi.hoisted(() => ({
  findCategoryForDescription: () => null,
  findCorporateForDescription: () => false,
  createRule: { mutateAsync: vi.fn() },
}));
const SEM_CARTOES = vi.hoisted(() => [] as unknown[]);

const MANUAL = vi.hoisted(() => [
  {
    id: "airbnb-rulhan", date: "2026-10-12", amount: 425.24, type: "income", description: "Airbnb - Rulhan",
    original_description: null, status: "completed", is_provisional: false,
    split_group_id: null, split_parent_id: null,
  },
]);

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const nome of ["select", "eq", "gte", "lte", "order"]) chain[nome] = () => chain;
  // A busca pagina: a 1ª página traz o manual, a 2ª vem vazia.
  chain.range = (from: number) => Promise.resolve({ data: from === 0 ? MANUAL : [], error: null });
  chain.update = (patch: unknown) => ({
    in: (_col: string, ids: string[]) => {
      updates.push({ patch, ids });
      return Promise.resolve({ error: null });
    },
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

beforeEach(() => {
  updates.length = 0;
  createTransactionMock.mockReset().mockResolvedValue({ id: "nova" });
});

const PIX = { date: "2026-10-13", description: "PIX TRANSF Rulhan 13 10", amount: 425.24, type: "income" as const };

const renderReview = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountReviewModal open onOpenChange={() => {}} items={[PIX]} accountId="conta-itau" accountName="Itaú Conta" />
    </QueryClientProvider>,
  );

const confirmar = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => expect(screen.getByRole("button", { name: /Confirmar Importação/ })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: /Confirmar Importação/ }));
};

describe("AccountReviewModal — lançamento feito à mão", () => {
  it("não grava de novo: vincula o manual ao extrato, com o texto e a data do banco", async () => {
    const user = userEvent.setup();
    renderReview();

    // A revisão mostra o par, em vez de tratar a linha como nova.
    expect(await screen.findByText(/Lançado à mão: Airbnb - Rulhan/)).toBeInTheDocument();
    expect(screen.queryByText("Já importada")).not.toBeInTheDocument();

    await confirmar(user);

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      patch: { original_description: "PIX TRANSF Rulhan 13 10", date: "2026-10-13" },
      ids: ["airbnb-rulhan"],
    });
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("“Importar mesmo assim” grava a linha nova e não mexe no manual", async () => {
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByLabelText("Importar mesmo assim"));
    await confirmar(user);

    await waitFor(() => expect(createTransactionMock).toHaveBeenCalledTimes(1));
    expect(createTransactionMock.mock.calls[0][0]).toMatchObject({ description: "PIX TRANSF Rulhan 13 10", amount: 425.24, type: "income" });
    expect(updates).toHaveLength(0);
  });
});
