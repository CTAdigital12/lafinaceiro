import { describe, it, expect } from "vitest";
import { findAccountDuplicates, matchManualEntries } from "@/lib/deduplication";

/**
 * Lançamento feito à mão antes de importar o extrato.
 *
 * Caso real (13/10/2026): a PIX do Rulhan de R$ 425,24 foi lançada à mão como
 * "Airbnb - Rulhan"; o OFX trouxe "PIX TRANSF Rulhan 13 10" e a importação a
 * gravou de novo — a regra exata compara o texto do banco, que o manual não tem.
 */

const NADA = { items: new Set<number>(), existingIds: new Set<string>() };

const manual = (over: Partial<Parameters<typeof matchManualEntries>[1][number]> = {}) => ({
  id: "manual",
  date: "2026-10-13",
  description: "Airbnb - Rulhan",
  original_description: null,
  amount: 425.24,
  type: "income",
  ...over,
});

const PIX = { date: "2026-10-13", description: "PIX TRANSF Rulhan 13 10", amount: 425.24, type: "income" };

describe("matchManualEntries", () => {
  it("reconhece a PIX lançada à mão com outra descrição", () => {
    const existing = [manual()];
    // A regra exata não pega — é por isso que a linha entrava de novo.
    expect(findAccountDuplicates([PIX], existing).size).toBe(0);

    const m = matchManualEntries([PIX], existing, NADA);
    expect(m.get(0)?.id).toBe("manual");
  });

  it("aceita data até 3 dias de distância e recusa 4", () => {
    expect(matchManualEntries([PIX], [manual({ date: "2026-10-10" })], NADA).size).toBe(1);
    expect(matchManualEntries([PIX], [manual({ date: "2026-10-16" })], NADA).size).toBe(1);
    expect(matchManualEntries([PIX], [manual({ date: "2026-10-09" })], NADA).size).toBe(0);
  });

  it("não casa direção oposta nem valor diferente", () => {
    expect(matchManualEntries([PIX], [manual({ type: "expense" })], NADA).size).toBe(0);
    expect(matchManualEntries([PIX], [manual({ amount: 425.3 })], NADA).size).toBe(0);
  });

  it("lançamento importado não é candidato: já tem a sua linha de extrato", () => {
    // Dois PIX iguais em dias seguidos: o de ontem, já importado, não pode
    // esconder o de hoje.
    const ontem = manual({ date: "2026-10-12", description: "PIX TRANSF Rulhan 12 10", original_description: "PIX TRANSF Rulhan 12 10" });
    expect(matchManualEntries([PIX], [ontem], NADA).size).toBe(0);
  });

  it("respeita o que a regra exata já resolveu", () => {
    expect(matchManualEntries([PIX], [manual()], { items: new Set([0]), existingIds: new Set() }).size).toBe(0);
    expect(matchManualEntries([PIX], [manual()], { items: new Set(), existingIds: new Set(["manual"]) }).size).toBe(0);
  });

  it("um manual casa com uma linha só", () => {
    const m = matchManualEntries([PIX, { ...PIX }], [manual()], NADA);
    expect([...m.keys()]).toEqual([0]);
  });

  it("entre dois candidatos, fica o de data mais próxima", () => {
    const longe = manual({ id: "longe", date: "2026-10-10" });
    const perto = manual({ id: "perto", date: "2026-10-14" });
    expect(matchManualEntries([PIX], [longe, perto], NADA).get(0)?.id).toBe("perto");
  });

  it("divisão manual conta pelo valor somado e devolve todas as partes", () => {
    const partes = [
      manual({ id: "p1", amount: 300, split_group_id: "g", split_parent_id: null }),
      manual({ id: "p2", amount: 125.24, split_group_id: "g", split_parent_id: "p1" }),
    ];
    const m = matchManualEntries([PIX], partes, NADA);
    expect(m.get(0)?.splitMemberIds.sort()).toEqual(["p1", "p2"]);
  });
});
