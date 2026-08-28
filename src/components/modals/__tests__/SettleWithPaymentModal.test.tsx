import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Fiação do modal "quitar previstos com este pagamento".
 *
 * A regra da soma está em `settleWithPayment.test.ts` e as travas de verdade
 * estão na RPC. Aqui o que se prova é o que só a tela pode errar: que o botão
 * só libera quando a soma dos selecionados fecha com o valor do pagamento, e
 * que os ids enviados são os que o usuário marcou.
 */

const settleMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

/** Lista viva: os testes trocam o conteúdo para simular uma refetch. */
const state = vi.hoisted(() => ({ candidates: [] as Array<Record<string, unknown>> }));

const CANDIDATES = vi.hoisted(() => [
  {
    id: "parcela-emprestimo",
    description: "Empréstimo Reforma 3/10",
    amount: 1500,
    date: "2026-08-10",
    due_date: null,
    status: "pending",
    is_provisional: false,
    installment_number: 3,
    total_installments: 10,
    categories: { name: "Reformas e melhorias" },
    account_id: "conta-itau",
    accounts: { name: "Itaú" },
  },
  {
    id: "parcela-ingresso",
    description: "Ingresso Eltinho 2/6",
    amount: 111,
    date: "2026-08-15",
    due_date: null,
    status: "pending",
    is_provisional: false,
    installment_number: 2,
    total_installments: 6,
    categories: { name: "Lazer" },
    account_id: "conta-nubank",
    accounts: { name: "Nubank" },
  },
]);

/**
 * Mock COMPLETO, sem `importActual`: o módulo real importa o cliente Supabase,
 * que estoura com "supabaseUrl is required" onde não há .env — é assim que o
 * CI roda. As regras puras vivem em `@/lib/settleWithPayment` justamente por
 * isso, e são testadas lá.
 */
vi.mock("@/hooks/useSettleWithPayment", () => ({
  useSettleCandidates: () => ({ candidates: state.candidates, isLoading: false }),
  useSettleWithPayment: () => ({
    settleWithPayment: { mutateAsync: settleMock, isPending: false },
  }),
}));

vi.mock("@/hooks/useFormatCurrency", () => ({
  useFormatCurrency: () => (value: number) => `R$ ${Number(value).toFixed(2)}`,
}));

import { SettleWithPaymentModal } from "../SettleWithPaymentModal";

const PAYMENT = {
  id: "pix-luiz",
  description: "PIX TRANSF LUIZ HE20 08",
  amount: 1611,
  date: "2026-08-20",
  type: "expense",
  account_id: "conta-itau",
};

const renderModal = () =>
  render(
    <SettleWithPaymentModal open onOpenChange={() => {}} payment={PAYMENT} />,
  );

describe("SettleWithPaymentModal", () => {
  beforeEach(() => {
    settleMock.mockClear();
    state.candidates = CANDIDATES;
  });

  it("mantém o botão travado enquanto a soma não fecha", async () => {
    const user = userEvent.setup();
    renderModal();

    const quitar = screen.getByRole("button", { name: /quitar/i });
    expect(quitar).toBeDisabled();

    await user.click(screen.getByText("Empréstimo Reforma 3/10"));
    await waitFor(() => expect(quitar).toBeDisabled());
  });

  it("libera e envia os ids marcados quando a soma bate", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText("Empréstimo Reforma 3/10"));
    await user.click(screen.getByText("Ingresso Eltinho 2/6"));

    const quitar = screen.getByRole("button", { name: /quitar/i });
    await waitFor(() => expect(quitar).toBeEnabled());

    await user.click(quitar);

    await waitFor(() => expect(settleMock).toHaveBeenCalledTimes(1));
    const call = settleMock.mock.calls[0][0];
    expect(call.paymentId).toBe("pix-luiz");
    expect([...call.targetIds].sort()).toEqual(["parcela-emprestimo", "parcela-ingresso"]);
  });

  it("marca a candidata que está em OUTRA conta", async () => {
    renderModal();

    // A lista não filtra por conta de propósito (a RPC move a conta do alvo
    // para a do pagamento). O que a torna segura é a diferença ficar visível.
    expect(screen.getByText("Nubank")).toBeInTheDocument();
    expect(screen.queryByText("Itaú")).toBeNull();
  });

  it("não promete um filtro por conta que a consulta não faz", async () => {
    state.candidates = [];
    renderModal();

    expect(screen.getByText(/fora de cartão em até 60 dias/i)).toBeInTheDocument();
    expect(screen.queryByText(/nesta conta/i)).toBeNull();
  });

  it("envia o que foi VALIDADO, não o que ficou marcado", async () => {
    const user = userEvent.setup();
    const { rerender } = renderModal();

    await user.click(screen.getByText("Empréstimo Reforma 3/10"));
    await user.click(screen.getByText("Ingresso Eltinho 2/6"));

    // Refetch (outra aba, outro aparelho): o ingresso sai da lista e o
    // empréstimo passa a valer o pagamento inteiro. A soma volta a fechar, o
    // botão libera — e o id do ingresso continua no Set de marcados.
    state.candidates = [{ ...CANDIDATES[0], amount: 1611 }];
    rerender(<SettleWithPaymentModal open onOpenChange={() => {}} payment={PAYMENT} />);

    const quitar = screen.getByRole("button", { name: /quitar/i });
    await waitFor(() => expect(quitar).toBeEnabled());
    await user.click(quitar);

    await waitFor(() => expect(settleMock).toHaveBeenCalledTimes(1));
    // Enviar o Set cru mandaria também "parcela-ingresso", que a validação da
    // soma não viu — validando uma coisa e enviando outra.
    expect(settleMock.mock.calls[0][0].targetIds).toEqual(["parcela-emprestimo"]);
  });

  it("avisa que o lançamento do pagamento será excluído", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText("Empréstimo Reforma 3/10"));
    await user.click(screen.getByText("Ingresso Eltinho 2/6"));

    expect(await screen.findByText(/será excluído/i)).toBeInTheDocument();
  });
});
