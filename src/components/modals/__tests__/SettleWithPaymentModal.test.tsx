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
  },
]);

vi.mock("@/hooks/useSettleWithPayment", async () => ({
  ...(await vi.importActual<typeof import("@/hooks/useSettleWithPayment")>(
    "@/hooks/useSettleWithPayment",
  )),
  useSettleCandidates: () => ({ candidates: CANDIDATES, isLoading: false }),
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
};

const renderModal = () =>
  render(
    <SettleWithPaymentModal open onOpenChange={() => {}} payment={PAYMENT} />,
  );

describe("SettleWithPaymentModal", () => {
  beforeEach(() => settleMock.mockClear());

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

  it("avisa que o lançamento do pagamento será excluído", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText("Empréstimo Reforma 3/10"));
    await user.click(screen.getByText("Ingresso Eltinho 2/6"));

    expect(await screen.findByText(/será excluído/i)).toBeInTheDocument();
  });
});
