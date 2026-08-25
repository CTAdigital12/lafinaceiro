import { describe, it, expect } from "vitest";
import {
  collapseSplitGroups,
  prorateParts,
  round2,
  sumParts,
  validateParts,
  type SplitPart,
} from "@/lib/splitTransaction";
import { detectAccountDuplicates, detectDuplicates } from "@/lib/deduplication";

const part = (amount: number, overrides: Partial<SplitPart> = {}): SplitPart => ({
  amount,
  category_id: null,
  label: null,
  is_reimbursable: false,
  is_corporate_expense: false,
  recurring_rule_id: null,
  ...overrides,
});

describe("recorrência por parte", () => {
  it("recusa a mesma recorrência em duas partes", () => {
    expect(
      validateParts(
        [
          part(500, { recurring_rule_id: "rule-a" }),
          part(300, { recurring_rule_id: "rule-a" }),
        ],
        800,
      ),
    ).toBe("A mesma recorrência foi escolhida em duas partes.");
  });

  it("aceita recorrências diferentes em cada parte", () => {
    expect(
      validateParts(
        [
          part(500, { recurring_rule_id: "rule-a" }),
          part(300, { recurring_rule_id: "rule-b" }),
        ],
        800,
      ),
    ).toBeNull();
  });

  it("não replica a recorrência ao ratear nas demais parcelas", () => {
    const rateado = prorateParts(
      [part(500, { recurring_rule_id: "rule-a" }), part(300)],
      800,
      400,
    );
    expect(rateado.map((p) => p.recurring_rule_id)).toEqual([null, null]);
    expect(rateado.map((p) => p.amount)).toEqual([250, 150]);
  });
});

describe("round2", () => {
  it("arredonda casos que o ponto flutuante erra", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(266.66666)).toBe(266.67);
  });
});

describe("sumParts", () => {
  it("soma sem acumular erro de ponto flutuante", () => {
    expect(sumParts([part(0.1), part(0.2)])).toBe(0.3);
    expect(sumParts([part(500), part(300)])).toBe(800);
  });
});

describe("validateParts", () => {
  it("aceita partes que somam exatamente o total", () => {
    expect(validateParts([part(500), part(300)], 800)).toBeNull();
  });

  it("rejeita menos de duas partes", () => {
    expect(validateParts([part(800)], 800)).toMatch(/duas partes/);
  });

  it("rejeita parte zerada ou negativa", () => {
    expect(validateParts([part(800), part(0)], 800)).toMatch(/maior que zero/);
    expect(validateParts([part(900), part(-100)], 800)).toMatch(/maior que zero/);
  });

  it("aponta sobra e falta", () => {
    expect(validateParts([part(500), part(400)], 800)).toMatch(/excede.*100\.00/);
    expect(validateParts([part(500), part(200)], 800)).toMatch(/Faltam.*100\.00/);
  });

  it("tolera a soma correta com centavos", () => {
    expect(validateParts([part(266.67), part(266.67), part(266.66)], 800)).toBeNull();
  });
});

describe("prorateParts", () => {
  it("mantém a proporção ao aplicar a outra parcela de mesmo valor", () => {
    const parts = [part(500), part(300)];
    const result = prorateParts(parts, 800, 800);
    expect(result.map((p) => p.amount)).toEqual([500, 300]);
  });

  it("reescala para uma parcela de valor diferente", () => {
    const parts = [part(500), part(300)];
    const result = prorateParts(parts, 800, 400);
    expect(result.map((p) => p.amount)).toEqual([250, 150]);
    expect(sumParts(result)).toBe(400);
  });

  it("joga a sobra de centavos na maior parte, nunca zerando a menor", () => {
    // 1/3 e 2/3 de 100,01 não fecham com arredondamento simples.
    const parts = [part(66.67), part(33.33)];
    const result = prorateParts(parts, 100, 100.01);
    expect(sumParts(result)).toBe(100.01);
    expect(result[0].amount).toBeGreaterThan(result[1].amount);
    expect(result.every((p) => p.amount > 0)).toBe(true);
  });

  it("preserva categoria e flags de cada parte", () => {
    const parts = [
      part(500, { category_id: "cat-viagem" }),
      part(300, { category_id: "cat-reembolso", is_reimbursable: true, label: "João" }),
    ];
    const result = prorateParts(parts, 800, 400);
    expect(result[1]).toMatchObject({
      category_id: "cat-reembolso",
      is_reimbursable: true,
      label: "João",
      amount: 150,
    });
  });

  it("sempre fecha a soma exata para vários totais", () => {
    const parts = [part(333.33), part(333.33), part(333.34)];
    for (const target of [1000, 999.99, 123.45, 0.03]) {
      expect(sumParts(prorateParts(parts, 1000, target))).toBe(round2(target));
    }
  });
});

describe("collapseSplitGroups", () => {
  const primary = {
    id: "tx-1",
    amount: 500,
    description: "Airbnb 2/4",
    split_group_id: "grp-1",
    split_parent_id: null,
  };
  const secondary = {
    id: "tx-2",
    amount: 300,
    description: "Airbnb 2/4 - João",
    split_group_id: "grp-1",
    split_parent_id: "tx-1",
  };
  const plain = { id: "tx-3", amount: 42, description: "Café", split_group_id: null, split_parent_id: null };

  it("soma as partes numa linha só, com o valor original", () => {
    const rows = collapseSplitGroups([primary, secondary, plain]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "tx-1", amount: 800, isSplitGroup: true });
    expect(rows[0].splitMemberIds.sort()).toEqual(["tx-1", "tx-2"]);
  });

  it("elege a parte primária como representante mesmo se vier depois", () => {
    const rows = collapseSplitGroups([secondary, primary]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "tx-1", description: "Airbnb 2/4", amount: 800 });
  });

  it("passa transações não divididas intactas", () => {
    const rows = collapseSplitGroups([plain]);
    expect(rows[0]).toMatchObject({ id: "tx-3", amount: 42, isSplitGroup: false });
    expect(rows[0].splitMemberIds).toEqual(["tx-3"]);
  });

  it("não mistura grupos diferentes", () => {
    const other = { id: "tx-9", amount: 10, description: "X", split_group_id: "grp-2", split_parent_id: null };
    const rows = collapseSplitGroups([primary, secondary, other]);
    expect(rows.map((r) => r.amount)).toEqual([800, 10]);
  });
});

describe("detectDuplicates com transação dividida", () => {
  // Regressão: a fatura traz UMA linha de R$ 800,00; o sistema tem 500 + 300.
  // Sem colapsar o grupo, a reimportação recriaria a despesa (fatura dobrada).
  const existing = [
    {
      id: "tx-1",
      description: "Airbnb 2/4",
      original_description: "AIRBNB * HM9PXFFNR",
      amount: 500,
      date: "2026-07-10",
      installment_number: 2,
      total_installments: 4,
      split_group_id: "grp-1",
      split_parent_id: null,
    },
    {
      id: "tx-2",
      description: "Airbnb 2/4 - João",
      original_description: "AIRBNB * HM9PXFFNR",
      amount: 300,
      date: "2026-07-10",
      installment_number: 2,
      total_installments: 4,
      split_group_id: "grp-1",
      split_parent_id: "tx-1",
    },
  ];

  it("reconhece a linha cheia da fatura como duplicata (parcelada)", () => {
    const dup = detectDuplicates(
      [{ transaction_value: 800, installment_current: 2, installment_total: 4, description: "AIRBNB * HM9PXFFNR", purchase_date: "2026-07-10" }],
      existing,
    );
    expect(dup.get(0)?.id).toBe("tx-1");
  });

  it("reconhece a linha cheia também sem parcelamento", () => {
    const oneOff = existing.map((t) => ({ ...t, installment_number: null, total_installments: null }));
    const dup = detectDuplicates(
      [{ transaction_value: 800, description: "AIRBNB * HM9PXFFNR", purchase_date: "2026-07-10" }],
      oneOff,
    );
    expect(dup.get(0)?.id).toBe("tx-1");
  });

  it("não casa quando o valor da fatura realmente difere do total dividido", () => {
    const dup = detectDuplicates(
      [{ transaction_value: 950, installment_current: 2, installment_total: 4, description: "AIRBNB * HM9PXFFNR", purchase_date: "2026-07-10" }],
      existing,
    );
    expect(dup.size).toBe(0);
  });

  it("uma linha da fatura não consome duas vezes o mesmo grupo", () => {
    const dup = detectDuplicates(
      [
        { transaction_value: 800, installment_current: 2, installment_total: 4, description: "AIRBNB * HM9PXFFNR", purchase_date: "2026-07-10" },
        { transaction_value: 800, installment_current: 2, installment_total: 4, description: "AIRBNB * HM9PXFFNR", purchase_date: "2026-07-10" },
      ],
      existing,
    );
    expect(dup.size).toBe(1);
  });
});

describe("detectAccountDuplicates com transação dividida", () => {
  // Extrato traz o PIX cheio (R$ 1.611,00); o sistema tem 1.500,08 + 110,92.
  const existing = [
    {
      id: "a",
      date: "2026-07-15",
      description: "PIX Luiz he19",
      original_description: "PIX ENVIADO LUIZ HE19",
      amount: 1500.08,
      split_group_id: "g1",
      split_parent_id: null,
    },
    {
      id: "b",
      date: "2026-07-15",
      description: "PIX Luiz he19 - Ingresso Eltinho",
      original_description: "PIX ENVIADO LUIZ HE19",
      amount: 110.92,
      split_group_id: "g1",
      split_parent_id: "a",
    },
  ];

  it("reconhece o lançamento cheio do extrato como já importado", () => {
    const dup = detectAccountDuplicates(
      [{ date: "2026-07-15", description: "PIX ENVIADO LUIZ HE19", amount: 1611.0 }],
      existing,
    );
    expect([...dup]).toEqual([0]);
  });

  it("não casa quando o extrato traz outro valor", () => {
    const dup = detectAccountDuplicates(
      [{ date: "2026-07-15", description: "PIX ENVIADO LUIZ HE19", amount: 1700 }],
      existing,
    );
    expect(dup.size).toBe(0);
  });

  it("consome o grupo uma vez só", () => {
    const dup = detectAccountDuplicates(
      [
        { date: "2026-07-15", description: "PIX ENVIADO LUIZ HE19", amount: 1611.0 },
        { date: "2026-07-15", description: "PIX ENVIADO LUIZ HE19", amount: 1611.0 },
      ],
      existing,
    );
    expect(dup.size).toBe(1);
  });

  it("segue funcionando sem id (chamadores antigos)", () => {
    const dup = detectAccountDuplicates(
      [{ date: "2026-07-15", description: "MERCADO", amount: 50 }],
      [{ date: "2026-07-15", description: "Mercado", original_description: "MERCADO", amount: 50 }],
    );
    expect([...dup]).toEqual([0]);
  });
});
