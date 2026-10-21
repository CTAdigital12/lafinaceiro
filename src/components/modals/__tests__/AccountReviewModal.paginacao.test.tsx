import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A revisão do extrato lê o banco em dois momentos, e os dois liam a conta
 * inteira numa consulta só. O PostgREST corta em 1000 linhas sem erro:
 *
 * - na checagem de duplicata, o que ficava de fora entrava de novo como novo;
 * - no "Sincronizar", a soma truncada era GRAVADA em `initial_balance` — e o
 *   erro da consulta era ignorado, virando soma 0.
 *
 * O servidor falso faz o mesmo que o real: sem `.range()`, devolve só as 1000
 * primeiras linhas, sem erro.
 */

const TETO = 1000;
const banco = vi.hoisted(() => ({ linhas: [] as Array<Record<string, unknown>>, falha: false }));
const consultas = vi.hoisted(() => [] as unknown[][]);
const createTransactionMock = vi.hoisted(() => vi.fn());
const updateAccountMock = vi.hoisted(() => vi.fn());
const netMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const regras = vi.hoisted(() => ({
  findCategoryForDescription: () => null,
  findCorporateForDescription: () => false,
  createRule: { mutateAsync: vi.fn() },
}));
const SEM_CARTOES = vi.hoisted(() => [] as unknown[]);

vi.mock("@/integrations/supabase/client", () => {
  const resposta = (from: number, to: number) =>
    Promise.resolve(
      banco.falha
        ? { data: null, error: { message: "statement timeout" } }
        : { data: banco.linhas.slice(from, Math.min(to + 1, from + TETO)), error: null },
    );
  const chain: Record<string, unknown> = {};
  for (const nome of ["select", "eq", "gte", "lte", "order"]) {
    chain[nome] = (...args: unknown[]) => {
      consultas.push([nome, ...args]);
      return chain;
    };
  }
  chain.range = (from: number, to: number) => {
    consultas.push(["range", from, to]);
    return resposta(from, to);
  };
  // Consulta sem .range(): o teto do PostgREST.
  chain.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => resposta(0, TETO - 1).then(ok, erro);
  return { supabase: { from: () => chain } };
});
vi.mock("@/lib/accountBalance", () => ({ fetchRealizedNetForAccount: netMock }));
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
  useAccounts: () => ({ accounts: [], updateAccount: { mutateAsync: updateAccountMock } }),
}));
vi.mock("@/hooks/useCreditCards", () => ({ useCreditCards: () => ({ creditCards: SEM_CARTOES }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { AccountReviewModal } from "../AccountReviewModal";

const PIX = { date: "2026-10-13", description: "PIX TRANSF Rulhan 13 10", amount: 425.24, type: "income" as const };

const existente = (over: Record<string, unknown>) => ({
  date: "2026-10-13", type: "expense", description: "Outra coisa", original_description: "OUTRA COISA",
  status: "completed", is_provisional: false, split_group_id: null, split_parent_id: null,
  ...over,
});

/** 1100 lançamentos sem relação com o PIX, e o próprio PIX já importado na posição 1050. */
const contaCheia = () => {
  const linhas = Array.from({ length: 1100 }, (_, i) => existente({ id: `f${i}`, amount: 10 }));
  linhas.splice(1050, 0, existente({ id: "ja-importada", type: "income", amount: 425.24, description: PIX.description, original_description: PIX.description }));
  return linhas;
};

beforeEach(() => {
  banco.linhas = [];
  banco.falha = false;
  consultas.length = 0;
  createTransactionMock.mockReset().mockResolvedValue({ id: "nova" });
  updateAccountMock.mockReset().mockResolvedValue({});
  netMock.mockReset();
  toastMock.mockReset();
});

const renderReview = (bankBalance?: number) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountReviewModal open onOpenChange={() => {}} items={[PIX]} accountId="conta-itau" accountName="Itaú Conta" bankBalance={bankBalance} />
    </QueryClientProvider>,
  );

const confirmar = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => expect(screen.getByRole("button", { name: /Confirmar Importação/ })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: /Confirmar Importação/ }));
};

describe("AccountReviewModal — checagem de duplicata", () => {
  it("reconhece o lançamento já importado mesmo depois da linha 1000", async () => {
    banco.linhas = contaCheia();
    const user = userEvent.setup();
    renderReview();

    expect(await screen.findByText("Já importada")).toBeInTheDocument();
    await confirmar(user);
    expect(createTransactionMock).not.toHaveBeenCalled();
  });

  it("lê só o período do extrato, com a folga do casamento manual, em ordem estável", async () => {
    renderReview();

    await waitFor(() => expect(consultas.some(([nome]) => nome === "range")).toBe(true));
    expect(consultas).toContainEqual(["eq", "account_id", "conta-itau"]);
    expect(consultas).toContainEqual(["gte", "date", "2026-10-10"]);
    expect(consultas).toContainEqual(["lte", "date", "2026-10-16"]);
    expect(consultas).toContainEqual(["order", "id", { ascending: true }]);
  });

  it("avisa quando a consulta falha, em vez de mostrar tudo como novo em silêncio", async () => {
    banco.falha = true;
    renderReview();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Não foi possível verificar duplicatas", variant: "destructive" }),
      ),
    );
  });
});

describe("AccountReviewModal — Sincronizar saldo", () => {
  const sincronizar = async () => {
    const user = userEvent.setup();
    renderReview(2682.21);
    await confirmar(user);
    await user.click(await screen.findByRole("button", { name: "Sincronizar" }));
  };

  it("grava a âncora a partir da soma paginada da conta", async () => {
    netMock.mockResolvedValue(1812.73);
    await sincronizar();

    await waitFor(() => expect(updateAccountMock).toHaveBeenCalledTimes(1));
    expect(netMock).toHaveBeenCalledWith("conta-itau");
    const [{ id, initial_balance }] = updateAccountMock.mock.calls[0];
    expect(id).toBe("conta-itau");
    expect(initial_balance).toBeCloseTo(869.48, 2);
  });

  it("não grava nada quando a soma não pôde ser lida", async () => {
    netMock.mockRejectedValue(new Error("statement timeout"));
    await sincronizar();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao sincronizar saldo" })),
    );
    expect(updateAccountMock).not.toHaveBeenCalled();
  });
});
