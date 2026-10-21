import { describe, it, expect } from "vitest";
import { detectDuplicates, matchManualInvoiceEntries, type ExistingTransaction } from "@/lib/deduplication";

/**
 * Lançamento de cartão feito à mão antes de importar a fatura.
 *
 * Caso real (21/10/2026): "Recanto Do Djalma - Marmitas peões", R$ 142,00, de
 * 19/10, foi lançado à mão no cartão. A fatura traz "RECANTO DO DJALMA" e a
 * regra exata não o reconhece — compara com `original_description`, que o
 * manual não tem. É o defeito do PR #123, no caminho da fatura.
 */

const NADA = { items: new Set<number>(), existingIds: new Set<string>() };

type Existente = ExistingTransaction & { status?: string | null; is_provisional?: boolean | null };

const manual = (over: Partial<Existente> = {}): Existente => ({
  id: "recanto",
  description: "Recanto Do Djalma - Marmitas peões",
  original_description: null,
  amount: 142,
  date: "2026-10-19",
  is_refund: false,
  installment_number: null,
  total_installments: null,
  split_group_id: null,
  split_parent_id: null,
  status: "completed",
  is_provisional: false,
  ...over,
});

const LINHA = { purchase_date: "2026-10-19", transaction_value: 142, description: "RECANTO DO DJALMA" };

describe("matchManualInvoiceEntries", () => {
  it("reconhece a compra lançada à mão com outra descrição", () => {
    const existing = [manual()];
    // A regra exata não pega — é por isso que a linha entraria de novo.
    expect(detectDuplicates([LINHA], existing).size).toBe(0);

    expect(matchManualInvoiceEntries([LINHA], existing, NADA).get(0)?.id).toBe("recanto");
  });

  it("aceita data até 3 dias de distância e recusa 4", () => {
    expect(matchManualInvoiceEntries([LINHA], [manual({ date: "2026-10-16" })], NADA).size).toBe(1);
    expect(matchManualInvoiceEntries([LINHA], [manual({ date: "2026-10-22" })], NADA).size).toBe(1);
    expect(matchManualInvoiceEntries([LINHA], [manual({ date: "2026-10-15" })], NADA).size).toBe(0);
  });

  it("exige o mesmo valor", () => {
    expect(matchManualInvoiceEntries([{ ...LINHA, transaction_value: 142.1 }], [manual()], NADA).size).toBe(0);
  });

  it("só casa lançamento realizado: previsto, provisório ou sem status ficam de fora", () => {
    expect(matchManualInvoiceEntries([LINHA], [manual({ status: "pending" })], NADA).size).toBe(0);
    expect(matchManualInvoiceEntries([LINHA], [manual({ is_provisional: true })], NADA).size).toBe(0);
    expect(matchManualInvoiceEntries([LINHA], [manual({ status: undefined })], NADA).size).toBe(0);
  });

  it("importado não é candidato: ele já tem a sua linha de fatura", () => {
    const importado = manual({ original_description: "RECANTO DO DJALMA ALMOCO" });
    expect(matchManualInvoiceEntries([LINHA], [importado], NADA).size).toBe(0);
  });

  it("parcela fica de fora dos dois lados — detectDuplicates já a resolve pelo índice", () => {
    const parcela = { ...LINHA, installment_current: 2, installment_total: 5 };
    expect(matchManualInvoiceEntries([parcela], [manual()], NADA).size).toBe(0);
    expect(matchManualInvoiceEntries([LINHA], [manual({ installment_number: 2, total_installments: 5 })], NADA).size).toBe(0);
  });

  it("crédito da fatura casa com estorno manual, e só com ele", () => {
    const credito = { ...LINHA, is_credit: true };
    const estorno = manual({ id: "estorno", is_refund: true });

    expect(matchManualInvoiceEntries([credito], [manual()], NADA).size).toBe(0);
    expect(matchManualInvoiceEntries([LINHA], [estorno], NADA).size).toBe(0);
    expect(matchManualInvoiceEntries([credito], [estorno], NADA).get(0)?.id).toBe("estorno");
  });

  it("respeita o que a regra exata já resolveu", () => {
    const existing = [manual()];
    expect(matchManualInvoiceEntries([LINHA], existing, { items: new Set([0]), existingIds: new Set() }).size).toBe(0);
    expect(matchManualInvoiceEntries([LINHA], existing, { items: new Set(), existingIds: new Set(["recanto"]) }).size).toBe(0);
  });

  it("um manual serve uma linha só, e o de data mais próxima vence", () => {
    const longe = manual({ id: "longe", date: "2026-10-17" });
    const perto = manual({ id: "perto", date: "2026-10-20" });
    const m = matchManualInvoiceEntries([LINHA, LINHA], [longe, perto], NADA);
    expect(m.get(0)?.id).toBe("perto");
    expect(m.get(1)?.id).toBe("longe");
  });

  it("divisão conta pelo valor somado", () => {
    const partes = [
      manual({ id: "p1", amount: 100, split_group_id: "g", split_parent_id: null }),
      manual({ id: "p2", amount: 42, description: "Marmitas - empresa", split_group_id: "g", split_parent_id: "p1" }),
    ];
    expect(matchManualInvoiceEntries([LINHA], partes, NADA).get(0)?.splitMemberIds.sort()).toEqual(["p1", "p2"]);
  });
});
