import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Transaction } from "@/hooks/useTransactions";

/**
 * Estorno de compra no cartão é gravado como RECEITA (é o formato da
 * importação da fatura e da Conciliação de Faturas), mas abate a categoria da
 * COMPRA nos relatórios (`isCardIncomeRefund`). O modal mostrava a lista de
 * categorias de receita para qualquer `type='income'`, então não havia como
 * pôr "Vestuário" no estorno de 164,25 do Mercado Livre (03/11/2026).
 */

const CARD = vi.hoisted(() => ({
  id: "black",
  user_id: "u1",
  name: "Itaú Personnalité Black",
  last_digits: "5391",
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

const CATS = vi.hoisted(() => {
  const vestuario = { id: "vestuario", name: "Vestuário", icon: "👕", color: null, type: "expense", parent_id: null };
  const salario = { id: "salario", name: "Salário", icon: "💰", color: null, type: "income", parent_id: null };
  return { vestuario, salario };
});

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    incomeCategories: [CATS.salario],
    expenseCategories: [CATS.vestuario],
    categories: [CATS.salario, CATS.vestuario],
  }),
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
    createTransaction: { mutateAsync: vi.fn(), isPending: false },
    updateTransaction: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/hooks/useCreditCards", () => ({ useCreditCards: () => ({ creditCards: [CARD] }) }));

import { TransactionModal } from "@/components/modals/TransactionModal";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

const receita = (over: Partial<Transaction>) =>
  ({
    id: "tx",
    user_id: "u1",
    description: "Mercadolivre*mercadolosascobra",
    amount: 164.25,
    type: "income",
    date: "2026-10-30",
    due_date: "2026-11-15",
    category_id: null,
    account_id: null,
    credit_card_id: "black",
    status: "completed",
    is_corporate_expense: false,
    is_reimbursable: false,
    is_refund: true,
    is_card_payment: false,
    is_provisional: false,
    refunded_transaction_id: null,
    installment_group_id: null,
    installment_number: null,
    total_installments: null,
    project_id: null,
    ...over,
  }) as unknown as Transaction;

const abrirCategorias = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByText("Selecione uma categoria"));
};

describe("TransactionModal — categoria do estorno de cartão", () => {
  it("estorno no cartão gravado como receita oferece as categorias de DESPESA", async () => {
    render(<TransactionModal open onOpenChange={() => {}} transaction={receita({})} />);
    await abrirCategorias();

    expect(await screen.findByText("Vestuário")).toBeInTheDocument();
    expect(screen.queryByText("Salário")).not.toBeInTheDocument();
  });

  it("receita comum no cartão (sem estorno) continua com as de receita", async () => {
    render(<TransactionModal open onOpenChange={() => {}} transaction={receita({ is_refund: false })} />);
    await abrirCategorias();

    expect(await screen.findByText("Salário")).toBeInTheDocument();
    expect(screen.queryByText("Vestuário")).not.toBeInTheDocument();
  });

  it("receita + estorno na CONTA continua com as de receita", async () => {
    render(
      <TransactionModal
        open
        onOpenChange={() => {}}
        transaction={receita({ credit_card_id: null, account_id: "conta-itau", due_date: null })}
      />,
    );
    await abrirCategorias();

    expect(await screen.findByText("Salário")).toBeInTheDocument();
    expect(screen.queryByText("Vestuário")).not.toBeInTheDocument();
  });
});
