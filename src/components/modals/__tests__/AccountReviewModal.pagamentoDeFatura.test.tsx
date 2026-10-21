import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Pagamento de fatura importado do extrato chega ligado ao cartão.
 *
 * A importação reconhecia "FATURA PAGA …" e gravava `is_card_payment` SEM
 * cartão. Para a fatura, esse pagamento não existia: a de 09/2026 do Itaú
 * (R$ 9.568,59) nunca virou "Paga" e o limite ficou subestimado até o
 * vínculo ser feito à mão. Agora o cartão vem sugerido pelo nome e é
 * confirmado na revisão — a regra está em `cardPaymentMatch.test.ts`; aqui se
 * prova a fiação até o que é gravado.
 */

const PERSONNALITE = vi.hoisted(() => ({ id: "personnalite", name: "Itaú Personnalité Black", last_digits: "5234" }));
const NUBANK = vi.hoisted(() => ({ id: "nubank", name: "Nubank", last_digits: "1111" }));
const state = vi.hoisted(() => ({ cards: [] as Array<{ id: string; name: string; last_digits: string }> }));
const createTransactionMock = vi.hoisted(() => vi.fn());
// Funções estáveis: o efeito de inicialização depende delas.
const regras = vi.hoisted(() => ({
  findCategoryForDescription: () => null,
  findCorporateForDescription: () => false,
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

const FATURA_SET = { date: "2026-09-15", description: "FATURA PAGA PERSONNALITE", amount: 9568.59, type: "expense" as const };

const renderReview = (items: Array<typeof FATURA_SET>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountReviewModal open onOpenChange={() => {}} items={items} accountId="conta-itau" accountName="Itaú Conta" />
    </QueryClientProvider>,
  );

const gravado = (description: string) =>
  createTransactionMock.mock.calls.map((c) => c[0]).find((p) => p.description === description);

describe("AccountReviewModal — pagamento de fatura", () => {
  it("grava o pagamento já ligado ao cartão sugerido; compra comum segue sem cartão", async () => {
    state.cards = [PERSONNALITE, NUBANK];
    const user = userEvent.setup();
    renderReview([FATURA_SET, { date: "2026-09-16", description: "UBER TRIP", amount: 30, type: "expense" }]);

    // A sugestão aparece na revisão, para ser confirmada.
    expect(await screen.findByText("Cartão pago")).toBeInTheDocument();
    expect(screen.getByLabelText("Cartão pago")).toHaveTextContent("Itaú Personnalité Black");

    await user.click(screen.getByRole("button", { name: /Confirmar Importação/ }));
    await waitFor(() => expect(createTransactionMock).toHaveBeenCalledTimes(2));

    expect(gravado("FATURA PAGA PERSONNALITE")).toMatchObject({
      account_id: "conta-itau",
      credit_card_id: "personnalite",
      is_card_payment: true,
    });
    expect(gravado("UBER TRIP")).toMatchObject({ credit_card_id: null, is_card_payment: false });
  });

  it("pagamento de cartão não cadastrado não cai no único cartão que existe", async () => {
    state.cards = [PERSONNALITE];
    const user = userEvent.setup();
    renderReview([{ ...FATURA_SET, description: "FATURA PAGA UNICLASS BLA", amount: 111.86 }]);

    expect(await screen.findByLabelText("Cartão pago")).toHaveTextContent("Não vincular");

    await user.click(screen.getByRole("button", { name: /Confirmar Importação/ }));
    await waitFor(() => expect(createTransactionMock).toHaveBeenCalledTimes(1));

    expect(gravado("FATURA PAGA UNICLASS BLA")).toMatchObject({
      credit_card_id: null,
      is_card_payment: true,
    });
  });

  it("a escolha na revisão vence a sugestão", async () => {
    state.cards = [PERSONNALITE, NUBANK];
    const user = userEvent.setup();
    renderReview([FATURA_SET]);

    await user.click(await screen.findByLabelText("Cartão pago"));
    await user.click(await screen.findByRole("option", { name: /Não vincular/ }));
    await user.click(screen.getByRole("button", { name: /Confirmar Importação/ }));
    await waitFor(() => expect(createTransactionMock).toHaveBeenCalledTimes(1));

    expect(gravado("FATURA PAGA PERSONNALITE")).toMatchObject({ credit_card_id: null });
  });
});
