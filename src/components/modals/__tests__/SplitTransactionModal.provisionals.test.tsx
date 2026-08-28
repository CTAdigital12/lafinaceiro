import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Fiação do rateio quando uma PARTE escolhe uma recorrência.
 *
 * A regra pura (validação das partes, recorrência repetida) está em
 * `splitTransaction.test.ts`, e as travas de verdade estão na RPC. Aqui se
 * prova o que só a tela pode errar: salvar ANTES de a consulta de previsões
 * responder gravava o rateio sem apagar a previsão que ele quita, e o mês
 * passava a somar a previsão E a parte que a substitui — em silêncio, porque
 * o aviso de exclusão também só aparece depois que a consulta responde.
 */

const splitMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const provisionalsState = vi.hoisted(() => ({
  isLoading: true,
  provisionals: [] as Array<{
    id: string;
    recurring_rule_id: string;
    description: string;
    amount: number;
    date: string;
  }>,
}));

const TRANSACTION = vi.hoisted(() => ({
  id: "tx-1",
  description: "Aluguel + internet",
  amount: 1350,
  type: "expense",
  date: "2026-09-05",
  category_id: null,
  split_group_id: "grupo-1",
  installment_group_id: null,
  is_reimbursable: false,
  is_corporate_expense: false,
  reimbursement_status: null,
}));

const PARTS = vi.hoisted(() => [
  {
    id: "parte-aluguel",
    amount: 1200,
    category_id: null,
    is_reimbursable: false,
    is_corporate_expense: false,
    recurring_rule_id: "regra-aluguel",
    reimbursement_status: null,
    split_parent_id: null,
  },
  {
    id: "parte-internet",
    amount: 150,
    category_id: null,
    is_reimbursable: false,
    is_corporate_expense: false,
    recurring_rule_id: "regra-internet",
    reimbursement_status: null,
    split_parent_id: "parte-aluguel",
  },
]);

// Mock COMPLETO, sem `importActual`: o módulo real importa o cliente Supabase,
// que estoura com "supabaseUrl is required" onde não há .env — que é o CI.
vi.mock("@/hooks/useTransactionSplit", () => ({
  useTransactionSplit: () => ({
    splitTransaction: { mutateAsync: splitMock, isPending: false },
    unsplitTransaction: { mutateAsync: vi.fn(), isPending: false },
    updateSplitParts: { mutateAsync: splitMock, isPending: false },
  }),
  useSplitGroup: () => ({ parts: PARTS, isLoading: false }),
  useSplittableInstallments: () => ({ siblings: [] }),
  useRecurringProvisionals: () => provisionalsState,
}));

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ expenseCategories: [], incomeCategories: [], allCategories: [] }),
  groupCategoriesByParent: () => [],
}));

vi.mock("@/hooks/useRecurringRules", () => ({
  useRecurringRules: () => ({
    rules: [
      { id: "regra-aluguel", name: "Aluguel", type: "expense", active: true },
      { id: "regra-internet", name: "Internet", type: "expense", active: true },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useFormatCurrency", () => ({
  useFormatCurrency: () => (v: number) => `R$ ${Number(v).toFixed(2)}`,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: TRANSACTION, error: null }) }),
      }),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

import { SplitTransactionModal } from "../SplitTransactionModal";

const renderModal = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SplitTransactionModal open onOpenChange={() => {}} transactionId="tx-1" />
    </QueryClientProvider>,
  );
};

const previsao = (id: string, ruleId: string, description: string, amount: number) => ({
  id,
  recurring_rule_id: ruleId,
  description,
  amount,
  date: "2026-09-05",
});

describe("SplitTransactionModal — previsões substituídas pelo rateio", () => {
  beforeEach(() => {
    splitMock.mockClear();
    provisionalsState.isLoading = true;
    provisionalsState.provisionals = [];
  });

  it("trava o salvar enquanto a consulta de previsões não responde", async () => {
    provisionalsState.isLoading = true;
    renderModal();

    const salvar = await screen.findByRole("button", { name: /salvar divisão/i });
    await waitFor(() => expect(salvar).toBeDisabled());

    // É este o ponto: salvar aqui gravaria o rateio SEM apagar a previsão que
    // ele quita, e o mês somaria a previsão E a parte que a substitui.
    expect(splitMock).not.toHaveBeenCalled();
  });

  it("com as previsões carregadas, libera e manda os ids a excluir", async () => {
    const user = userEvent.setup();
    provisionalsState.isLoading = false;
    provisionalsState.provisionals = [
      previsao("prev-aluguel", "regra-aluguel", "Aluguel", 1200),
      previsao("prev-internet", "regra-internet", "Internet", 150),
    ];
    renderModal();

    const salvar = await screen.findByRole("button", { name: /salvar divisão/i });
    await waitFor(() => expect(salvar).toBeEnabled());

    await user.click(salvar);

    await waitFor(() => expect(splitMock).toHaveBeenCalledTimes(1));
    const enviado = splitMock.mock.calls[0][0];
    expect([...enviado.provisionalIdsToDelete].sort()).toEqual(["prev-aluguel", "prev-internet"]);
  });

  it("escreve o plural certo — o JSX comia a quebra e saía \"previsãoões\"", async () => {
    provisionalsState.isLoading = false;
    provisionalsState.provisionals = [
      previsao("prev-aluguel", "regra-aluguel", "Aluguel", 1200),
      previsao("prev-internet", "regra-internet", "Internet", 150),
    ];
    renderModal();

    expect(
      await screen.findByText("Excluir as previsões que este rateio quita"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/previsãoões/)).toBeNull();
  });

  it("no singular, concorda no singular", async () => {
    provisionalsState.isLoading = false;
    provisionalsState.provisionals = [previsao("prev-aluguel", "regra-aluguel", "Aluguel", 1200)];
    renderModal();

    expect(
      await screen.findByText("Excluir a previsão que este rateio quita"),
    ).toBeInTheDocument();
  });
});
