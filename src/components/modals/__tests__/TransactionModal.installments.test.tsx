import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Teste de fiação do A5: a mesma compra, no mesmo dia e no mesmo cartão, tem
 * que cair na MESMA fatura sendo avulsa ou parcelada.
 *
 * `creditCardCycle.test.ts` prova a regra isolada. Este aqui prova que o modal
 * realmente a usa nos dois caminhos — que era exatamente o defeito: a compra
 * avulsa chamava a regra e o parcelamento não.
 *
 * Faz pela API o que se faria na tela: preenche o formulário, escolhe o
 * cartão, liga o parcelamento e envia — e inspeciona o que foi mandado gravar.
 */

/**
 * `vi.hoisted` porque `vi.mock` é içado para o topo do arquivo: sem isso a
 * factory fecha sobre a constante ainda na zona morta, `creditCards` chega
 * `undefined` e a seção do cartão estoura ao renderizar.
 */
const CARD = vi.hoisted(() => ({
  id: "card-1",
  user_id: "u1",
  name: "Cartão Teste",
  last_digits: "1234",
  brand: "visa",
  credit_limit: 5000,
  current_invoice: 0,
  closing_date: 20, // fecha dia 20
  due_date: 5, // vence dia 5
  color: null,
  status: "active",
  created_at: "",
  updated_at: "",
}));

/**
 * O relógio só fica congelado durante o render (com fake timers o userEvent não
 * dirige os componentes do Radix), então no submit `todayYmd()` devolveria a
 * data real da máquina enquanto o campo `date` guarda 25/08/2026. As duas
 * noções de "hoje" precisam concordar, senão a compra do dia parece futura e a
 * primeira parcela nasce pendente — falha do harness, não do componente.
 */
vi.mock("@/lib/dateUtils", async () => ({
  ...(await vi.importActual<typeof import("@/lib/dateUtils")>("@/lib/dateUtils")),
  todayYmd: () => "2026-08-25",
}));

const createTransactionMock = vi.hoisted(() => vi.fn());
const updateTransactionMock = vi.hoisted(() => vi.fn());
const createRuleMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    incomeCategories: [],
    expenseCategories: [],
    categories: [],
  }),
}));
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ accounts: [] }),
}));
vi.mock("@/hooks/useProjects", () => ({
  useProjects: () => ({ activeProjects: [] }),
}));
vi.mock("@/hooks/useCategorizationRules", () => ({
  useCategorizationRules: () => ({
    createRule: { mutateAsync: createRuleMock, isPending: false },
  }),
}));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({
    createTransaction: { mutateAsync: createTransactionMock, isPending: false },
    updateTransaction: { mutateAsync: updateTransactionMock, isPending: false },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/hooks/useCreditCards", () => ({
  useCreditCards: () => ({ creditCards: [CARD] }),
}));

import { TransactionModal } from "@/components/modals/TransactionModal";

/** Compra em 25/08/2026 — depois do fechamento (dia 20) -> fatura de setembro. */
const DIA_DA_COMPRA = new Date(2026, 7, 25, 12, 0, 0);

beforeEach(() => {
  vi.clearAllMocks();
  createTransactionMock.mockResolvedValue({ id: "nova" });
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Preenche o formulário no cartão de teste e envia.
 * `parcelas` > 1 liga o switch "É compra parcelada?".
 */
async function lancarCompra(parcelas?: number) {
  // O modal inicializa a data com `new Date()`. Fixamos o relógio só durante o
  // render — com fake timers ligados, o userEvent não consegue dirigir os
  // componentes do Radix.
  vi.useFakeTimers();
  vi.setSystemTime(DIA_DA_COMPRA);
  render(<TransactionModal open onOpenChange={() => {}} />);
  vi.useRealTimers();

  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Descrição"), "Compra de teste");
  await user.type(screen.getByLabelText("Valor"), "300");

  // Método de pagamento -> Cartão de Crédito
  await user.click(screen.getByRole("button", { name: "Cartão de Crédito" }));

  // Seleciona o cartão. Há vários comboboxes na tela (categoria, cartão,
  // status) e o nome acessível do botão do Radix não é o texto visível, então
  // localizamos pelo rótulo que o próprio gatilho mostra.
  await user.click(screen.getByText("Selecione um cartão"));
  await user.click(await screen.findByText(/Cartão Teste/));

  if (parcelas) {
    await user.click(screen.getByLabelText("É compra parcelada?"));
    // Campo controlado com min=2: `clear` devolve 2 e um `type` em seguida
    // concatenaria ("2" + "3" = 23 parcelas). `change` troca o valor inteiro.
    fireEvent.change(screen.getByLabelText("Total de Parcelas"), {
      target: { value: String(parcelas) },
    });
  }

  await user.click(screen.getByRole("button", { name: "Salvar Transação" }));

  await waitFor(() => expect(createTransactionMock).toHaveBeenCalled());

  return createTransactionMock.mock.calls.map((c) => c[0]);
}

describe("TransactionModal — vencimento de parcelas no cartão (A5)", () => {
  it("compra avulsa usa o ciclo do cartão, não a data da compra", async () => {
    const [payload] = await lancarCompra();

    expect(payload.date).toBe("2026-08-25");
    expect(payload.due_date).toBe("2026-09-05");
  });

  it("a primeira parcela cai na mesma fatura que a compra avulsa", async () => {
    const parcelas = await lancarCompra(3);

    expect(parcelas).toHaveLength(3);

    // O defeito: due_date era a própria data da parcela (25/08, 25/09, 25/10),
    // então a primeira parcela caía na fatura de agosto e a compra avulsa do
    // mesmo dia caía na de setembro.
    expect(parcelas.map((p) => p.due_date)).toEqual([
      "2026-09-05",
      "2026-10-05",
      "2026-11-05",
    ]);

    expect(parcelas[0].due_date).not.toBe("2026-08-25");
  });

  it("numera as parcelas e agrupa todas no mesmo installment_group_id", async () => {
    const parcelas = await lancarCompra(3);

    expect(parcelas.map((p) => p.installment_number)).toEqual([1, 2, 3]);
    expect(parcelas.every((p) => p.total_installments === 3)).toBe(true);

    const grupos = new Set(parcelas.map((p) => p.installment_group_id));
    expect(grupos.size).toBe(1);
  });

  /**
   * Guarda de regressão da correção do status: a regra "data futura nasce
   * pendente" NÃO pode alcançar a compra no cartão feita hoje. A primeira
   * parcela precisa continuar `completed`, senão ela deixa de contar na fatura
   * atual (`countsTowardInvoice` exige `status === "completed"`).
   *
   * A regra isolada está em `transactionStatus.test.ts`; aqui é a fiação.
   */
  it("primeira parcela do cartão comprada hoje continua concluída; as demais pendentes", async () => {
    const parcelas = await lancarCompra(3);

    expect(parcelas.map((p) => p.status)).toEqual([
      "completed",
      "pending",
      "pending",
    ]);
  });
});
