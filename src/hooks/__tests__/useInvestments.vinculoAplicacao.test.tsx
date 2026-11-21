import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Aplicação vinculada ao débito que já veio do extrato.
 *
 * A parcela do título de capitalização chega debitada pelo extrato. A
 * aplicação passa a VINCULAR esse débito (em vez de criar outra saída, que
 * dobraria o débito na conta) — e então editar ou excluir a operação não pode
 * mais apagar o lançamento vinculado sem olhar, como fazia: ele é do usuário.
 *
 * Banco falso em memória, com o mínimo do query builder que o hook usa.
 */

type Row = Record<string, unknown>;
type Filter = { col: string; op: "eq" | "neq" | "not_null"; val?: unknown };

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  seq: 0,
}));

vi.mock("@/integrations/supabase/client", () => {
  const matches = (row: Row, filters: Filter[]) =>
    filters.every((f) =>
      f.op === "eq" ? row[f.col] === f.val : f.op === "neq" ? row[f.col] !== f.val : row[f.col] != null,
    );

  const from = (table: string) => {
    const state: {
      op: "select" | "insert" | "update" | "delete";
      filters: Filter[];
      payload?: Row | Row[];
      cols?: string;
      head?: boolean;
      single?: "single" | "maybe";
    } = { op: "select", filters: [] };

    const rows = () => (db.tables[table] ??= []);

    const run = () => {
      if (state.op === "insert") {
        const inserted = (state.payload as Row[]).map((r) => ({ id: `${table}-${++db.seq}`, ...r }));
        rows().push(...inserted);
        return { data: state.single ? inserted[0] : inserted, error: null };
      }
      const hit = rows().filter((r) => matches(r, state.filters));
      if (state.op === "update") {
        hit.forEach((r) => Object.assign(r, state.payload));
        return { data: state.single ? hit[0] ?? null : hit, error: null };
      }
      if (state.op === "delete") {
        db.tables[table] = rows().filter((r) => !hit.includes(r));
        return { data: null, error: null };
      }
      if (state.head) return { data: null, count: hit.length, error: null };
      const shaped = state.cols?.includes("asset:investment_assets")
        ? hit.map((r) => ({ ...r, asset: (db.tables.investment_assets ?? []).find((a) => a.id === r.asset_id) }))
        : hit;
      if (state.single) return { data: shaped[0] ?? null, error: null };
      return { data: shaped, error: null };
    };

    const builder = {
      select(cols?: string, opts?: { head?: boolean }) {
        if (state.op === "select") {
          state.cols = cols;
          state.head = opts?.head;
        }
        return builder;
      },
      insert(payload: Row[]) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: Row) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ col, op: "eq", val });
        return builder;
      },
      neq(col: string, val: unknown) {
        state.filters.push({ col, op: "neq", val });
        return builder;
      },
      not(col: string) {
        state.filters.push({ col, op: "not_null" });
        return builder;
      },
      order() {
        return builder;
      },
      single() {
        state.single = "single";
        return builder;
      },
      maybeSingle() {
        state.single = "maybe";
        return builder;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return builder;
  };

  return { supabase: { from } };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "eu" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useInvestments } from "@/hooks/useInvestments";

const CONTA = "conta-itau";

const PIC = {
  id: "pic",
  user_id: "eu",
  ticker: "PIC",
  name: "PIC Itaú",
  asset_type: "capitalizacao",
  pricing_method: "total_balance",
  quantity: 1,
  average_price: 3893.11,
  current_price: 0,
  current_balance: 3893.11,
};

const debitoDoExtrato = (extra: Row = {}): Row => ({
  id: "debito-dez",
  user_id: "eu",
  account_id: CONTA,
  type: "expense",
  amount: 92.29,
  date: "2026-12-19",
  description: "CAP PIC 44 60",
  is_card_payment: false,
  is_investment_contribution: false,
  ...extra,
});

const aplicacao = {
  asset_id: "pic",
  type: "buy" as const,
  date: "2026-12-19",
  quantity: 1,
  unit_price: 92.29,
  fees: 0,
  total_value: 92.29,
  realized_profit: null,
  createExpenseTransaction: true,
  accountId: CONTA,
};

function renderInvestments() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useInvestments(), { wrapper });
}

const transacoes = () => db.tables.transactions ?? [];

beforeEach(() => {
  db.seq = 0;
  db.tables = {
    investment_assets: [{ ...PIC }],
    investment_transactions: [],
    transactions: [],
  };
});

describe("aplicação vinculando o débito do extrato", () => {
  it("vincula o débito existente, sem criar outra saída, e o marca como aporte", async () => {
    db.tables.transactions = [debitoDoExtrato()];
    const { result } = renderInvestments();
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    await result.current.createTransaction.mutateAsync({
      ...aplicacao,
      linkMode: "existing",
      existingTransactionId: "debito-dez",
    });

    expect(transacoes()).toHaveLength(1); // nenhuma saída nova
    expect(transacoes()[0]).toMatchObject({ id: "debito-dez", is_investment_contribution: true });
    expect(db.tables.investment_transactions[0]).toMatchObject({ linked_transaction_id: "debito-dez" });
  });

  it("excluir a aplicação NÃO apaga o débito do extrato, que continua aporte", async () => {
    db.tables.transactions = [debitoDoExtrato({ is_investment_contribution: true })];
    db.tables.investment_transactions = [
      { id: "op-1", user_id: "eu", ...aplicacao, linked_transaction_id: "debito-dez" },
    ];
    const { result } = renderInvestments();
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    await result.current.deleteTransaction.mutateAsync("op-1");

    expect(db.tables.investment_transactions).toHaveLength(0);
    expect(transacoes()).toEqual([expect.objectContaining({ id: "debito-dez", is_investment_contribution: true })]);
  });

  it("editar a aplicação também preserva o débito vinculado", async () => {
    db.tables.transactions = [debitoDoExtrato({ is_investment_contribution: true })];
    db.tables.investment_transactions = [
      { id: "op-1", user_id: "eu", ...aplicacao, linked_transaction_id: "debito-dez" },
    ];
    const { result } = renderInvestments();
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    await result.current.updateTransaction.mutateAsync({
      id: "op-1",
      ...aplicacao,
      linkMode: "existing",
      existingTransactionId: "debito-dez",
    });

    expect(transacoes()).toEqual([expect.objectContaining({ id: "debito-dez" })]);
    expect(db.tables.investment_transactions[0]).toMatchObject({ linked_transaction_id: "debito-dez" });
  });

  it("a saída que a própria aplicação criou continua sendo apagada junto", async () => {
    db.tables.transactions = [
      { id: "auto", user_id: "eu", account_id: CONTA, type: "expense", amount: 92.29, description: "Investimento: PIC" },
    ];
    db.tables.investment_transactions = [
      { id: "op-1", user_id: "eu", ...aplicacao, linked_transaction_id: "auto" },
    ];
    const { result } = renderInvestments();
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    await result.current.deleteTransaction.mutateAsync("op-1");

    expect(transacoes()).toHaveLength(0);
  });

  it("pagamento de fatura não pode ser vinculado, e a operação é desfeita", async () => {
    db.tables.transactions = [debitoDoExtrato({ description: "FATURA PAGA", is_card_payment: true })];
    const { result } = renderInvestments();
    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    await expect(
      result.current.createTransaction.mutateAsync({
        ...aplicacao,
        linkMode: "existing",
        existingTransactionId: "debito-dez",
      }),
    ).rejects.toThrow("não é uma despesa");

    expect(db.tables.investment_transactions).toHaveLength(0);
    expect(transacoes()[0]).toMatchObject({ is_investment_contribution: false });
  });
});
