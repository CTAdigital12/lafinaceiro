import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * Pagamento de fatura não pode ser desmontado pela edição.
 *
 * O pagamento debitado em conta tem conta E cartão (é o formato do "Pagar
 * Fatura → Vincular"). O modal escolhia o método pelo cartão, abria como
 * COMPRA e, ao salvar, gravava `account_id: null` e `is_card_payment: false`:
 * os R$ 9.568,59 da fatura de 09/2026 virariam uma compra no Itaú e sumiriam
 * do saldo da conta. O espelho de reembolso (receita no cartão) perdia o
 * `is_card_payment` do mesmo jeito e deixava de abater a fatura.
 */

const CARD = vi.hoisted(() => ({
  id: "personnalite",
  user_id: "u1",
  name: "Itaú Personnalité Black",
  last_digits: "5234",
  brand: "mastercard",
  credit_limit: 100000,
  current_invoice: 0,
  closing_date: 5,
  due_date: 15,
  color: null,
  status: "active",
  created_at: "",
  updated_at: "",
}));

const createTransactionMock = vi.hoisted(() => vi.fn());
const updateTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ incomeCategories: [], expenseCategories: [], categories: [] }),
}));
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ accounts: [{ id: "conta-itau", name: "Itaú Conta", icon: "🏦" }] }),
}));
vi.mock("@/hooks/useProjects", () => ({ useProjects: () => ({ activeProjects: [] }) }));
vi.mock("@/hooks/useCategorizationRules", () => ({
  useCategorizationRules: () => ({ createRule: { mutateAsync: vi.fn(), isPending: false } }),
}));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({
    createTransaction: { mutateAsync: createTransactionMock, isPending: false },
    updateTransaction: { mutateAsync: updateTransactionMock, isPending: false },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/hooks/useCreditCards", () => ({ useCreditCards: () => ({ creditCards: [CARD] }) }));

import { TransactionModal } from "@/components/modals/TransactionModal";

// O <Select> do Radix abre por pointer events que o jsdom não implementa.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  createTransactionMock.mockResolvedValue({ id: "nova" });
  updateTransactionMock.mockResolvedValue({});
});

const lancamento = (over: Partial<Transaction>) =>
  ({
    id: "tx",
    user_id: "u1",
    category_id: null,
    status: "completed",
    is_corporate_expense: false,
    is_reimbursable: false,
    is_refund: false,
    is_provisional: false,
    refunded_transaction_id: null,
    installment_group_id: null,
    installment_number: null,
    total_installments: null,
    project_id: null,
    due_date: null,
    ...over,
  }) as unknown as Transaction;

describe("TransactionModal — pagamento de fatura", () => {
  it("editar o pagamento debitado em conta mantém conta, cartão e is_card_payment", async () => {
    const user = userEvent.setup();
    render(
      <TransactionModal
        open
        onOpenChange={() => {}}
        transaction={lancamento({
          id: "fatura-set",
          description: "FATURA PAGA PERSONNALITE",
          amount: 9568.59,
          type: "expense",
          date: "2026-09-15",
          account_id: "conta-itau",
          credit_card_id: "personnalite",
          is_card_payment: true,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    await waitFor(() => expect(updateTransactionMock).toHaveBeenCalled());

    expect(updateTransactionMock.mock.calls[0][0]).toMatchObject({
      id: "fatura-set",
      account_id: "conta-itau",
      credit_card_id: "personnalite",
      is_card_payment: true,
    });
    // Abriu como débito em conta, com o cartão pago à vista.
    expect(screen.getByText("Cartão pago")).toBeInTheDocument();
  });

  it("vincula pelo 'Cartão pago' um pagamento lançado em conta sem cartão", async () => {
    const user = userEvent.setup();
    render(
      <TransactionModal
        open
        onOpenChange={() => {}}
        transaction={lancamento({
          id: "fatura-orfa",
          description: "FATURA PAGA PERSONNALITE",
          amount: 9568.59,
          type: "expense",
          date: "2026-09-15",
          account_id: "conta-itau",
          credit_card_id: null,
          is_card_payment: true,
        })}
      />,
    );

    await user.click(screen.getByLabelText("Cartão pago"));
    await user.click(await screen.findByRole("option", { name: /Itaú Personnalité Black/ }));
    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    await waitFor(() => expect(updateTransactionMock).toHaveBeenCalled());

    expect(updateTransactionMock.mock.calls[0][0]).toMatchObject({
      account_id: "conta-itau",
      credit_card_id: "personnalite",
      is_card_payment: true,
      // Pagamento entra pela data, não por ciclo — como os que já existem.
      due_date: null,
    });
  });

  it("editar o espelho de reembolso não o transforma em receita comum", async () => {
    const user = userEvent.setup();
    render(
      <TransactionModal
        open
        onOpenChange={() => {}}
        transaction={lancamento({
          id: "espelho",
          description: "Reembolso recebido - Linkedin",
          amount: 926.68,
          type: "income",
          date: "2026-08-11",
          due_date: "2026-08-15",
          account_id: null,
          credit_card_id: "personnalite",
          is_card_payment: true,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    await waitFor(() => expect(updateTransactionMock).toHaveBeenCalled());

    expect(updateTransactionMock.mock.calls[0][0]).toMatchObject({
      credit_card_id: "personnalite",
      is_card_payment: true,
    });
  });

  it("compra no cartão continua não sendo pagamento", async () => {
    const user = userEvent.setup();
    render(
      <TransactionModal
        open
        onOpenChange={() => {}}
        transaction={lancamento({
          id: "compra",
          description: "Apple.com/bill",
          amount: 93.9,
          type: "expense",
          date: "2026-08-14",
          due_date: "2026-09-15",
          account_id: null,
          credit_card_id: "personnalite",
          is_card_payment: false,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Salvar Alterações" }));
    await waitFor(() => expect(updateTransactionMock).toHaveBeenCalled());

    expect(updateTransactionMock.mock.calls[0][0]).toMatchObject({
      account_id: null,
      credit_card_id: "personnalite",
      is_card_payment: false,
      due_date: "2026-09-15",
    });
  });
});
