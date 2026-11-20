import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Aporte em investimento marcado pela regra de categorização na importação.
 *
 * Não existe gerador de recorrência: o débito mensal da capitalização entra
 * pelo extrato, e a regra é a única automação no caminho. Aqui se prova a
 * fiação da regra até o que é gravado — e que o resgate (receita) com a
 * mesma palavra no extrato não vira aporte.
 */

const state = vi.hoisted(() => ({ cards: [] as Array<{ id: string; name: string; last_digits: string }> }));
const createTransactionMock = vi.hoisted(() => vi.fn());
// Funções estáveis: o efeito de inicialização depende delas.
const regras = vi.hoisted(() => ({
  findCategoryForDescription: () => null,
  findCorporateForDescription: () => false,
  findInvestmentContributionForDescription: (d: string) => d.toUpperCase().includes("CAPITALIZ"),
  createRule: { mutateAsync: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const nome of ["select", "eq", "gte", "lte", "order"]) chain[nome] = () => chain;
  // Lançamentos já existentes na conta (dedup): nenhum.
  chain.range = () => Promise.resolve({ data: [], error: null });
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
vi.mock("@/hooks/useCreditCards", () => ({ useCreditCards: () => ({ creditCards: state.cards }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AccountReviewModal } from "../AccountReviewModal";

// O <Select> do Radix abre por pointer events que o jsdom não implementa.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

beforeEach(() => {
  createTransactionMock.mockReset().mockResolvedValue({ id: "nova" });
});

type Item = { date: string; description: string; amount: number; type: "expense" | "income" };

const renderReview = (items: Item[]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountReviewModal open onOpenChange={() => {}} items={items} accountId="conta-itau" accountName="Itaú Conta" />
    </QueryClientProvider>,
  );

const gravado = (description: string) =>
  createTransactionMock.mock.calls.map((c) => c[0]).find((p) => p.description === description);

describe("AccountReviewModal — aporte em investimento", () => {
  it("a regra marca o débito da capitalização como aporte; compra comum e resgate não", async () => {
    const user = userEvent.setup();
    renderReview([
      { date: "2026-11-05", description: "DA TITULO CAPITALIZACAO", amount: 300, type: "expense" },
      { date: "2026-11-06", description: "UBER TRIP", amount: 30, type: "expense" },
      { date: "2026-11-07", description: "RESGATE CAPITALIZACAO", amount: 900, type: "income" },
    ]);

    await user.click(await screen.findByRole("button", { name: /Confirmar Importação/ }));
    await waitFor(() => expect(createTransactionMock).toHaveBeenCalledTimes(3));

    expect(gravado("DA TITULO CAPITALIZACAO")).toMatchObject({
      account_id: "conta-itau",
      type: "expense",
      is_investment_contribution: true,
      is_corporate_expense: false,
    });
    expect(gravado("UBER TRIP")).toMatchObject({ is_investment_contribution: false });
    expect(gravado("RESGATE CAPITALIZACAO")).toMatchObject({ is_investment_contribution: false });
  });

  it("desmarcar na revisão vence a regra", async () => {
    const user = userEvent.setup();
    renderReview([{ date: "2026-11-05", description: "DA TITULO CAPITALIZACAO", amount: 300, type: "expense" }]);

    const caixa = await screen.findByRole("checkbox", { name: /Aporte/ });
    expect(caixa).toBeChecked();
    await user.click(caixa);
    await user.click(screen.getByRole("button", { name: /Confirmar Importação/ }));
    await waitFor(() => expect(createTransactionMock).toHaveBeenCalledTimes(1));

    expect(gravado("DA TITULO CAPITALIZACAO")).toMatchObject({ is_investment_contribution: false });
  });
});
