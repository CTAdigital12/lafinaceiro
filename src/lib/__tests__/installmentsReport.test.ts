import { describe, it, expect } from "vitest";
import {
  buildGroupKeyResolver,
  buildInstallmentGroups,
  buildInstallmentsOverview,
  buildMonthlyInstallments,
  earliestInstallmentMonth,
  installmentCompetenceMonth,
  isInstallmentRow,
  monthsBetween,
  stripInstallmentSuffix,
  usableHistoryWindows,
  type InstallmentRow,
} from "@/lib/installmentsReport";

const CURRENT = "2026-07";

const row = (overrides: Partial<InstallmentRow> & { id: string }): InstallmentRow => ({
  description: "Compra",
  amount: 100,
  date: "2026-07-10",
  due_date: "2026-07-10",
  status: "pending",
  is_refund: false,
  is_card_payment: false,
  is_corporate_expense: false,
  is_reimbursable: false,
  installment_group_id: "g1",
  installment_number: 1,
  total_installments: 3,
  split_group_id: null,
  split_parent_id: null,
  credit_card_id: "card-1",
  credit_cards: { id: "card-1", name: "Itaú", color: "from-orange-500 to-orange-600" },
  categories: { name: "Casa", icon: "🏠" },
  ...overrides,
});

/** Um parcelamento 3x de R$ 100, começando no mês corrente. */
const threeInstallments = (): InstallmentRow[] => [
  row({ id: "a1", description: "Sofá 1/3", installment_number: 1, date: "2026-07-10", due_date: "2026-07-10" }),
  row({ id: "a2", description: "Sofá 2/3", installment_number: 2, date: "2026-08-10", due_date: "2026-08-10" }),
  row({ id: "a3", description: "Sofá 3/3", installment_number: 3, date: "2026-09-10", due_date: "2026-09-10" }),
];

describe("installmentCompetenceMonth", () => {
  it("usa due_date no cartão e date fora dele", () => {
    expect(
      installmentCompetenceMonth(row({ id: "x", date: "2026-06-28", due_date: "2026-07-05" }))
    ).toBe("2026-07");
    expect(
      installmentCompetenceMonth(
        row({ id: "x", credit_card_id: null, credit_cards: null, date: "2026-06-28", due_date: "2026-07-05" })
      )
    ).toBe("2026-06");
  });
});

describe("isInstallmentRow", () => {
  it("exclui pagamento de fatura e compra à vista", () => {
    expect(isInstallmentRow(row({ id: "x" }))).toBe(true);
    expect(isInstallmentRow(row({ id: "x", is_card_payment: true }))).toBe(false);
    expect(isInstallmentRow(row({ id: "x", total_installments: 1 }))).toBe(false);
    expect(isInstallmentRow(row({ id: "x", total_installments: null }))).toBe(false);
  });
});

describe("buildGroupKeyResolver", () => {
  it("reamarra a parte secundária de um rateio ao grupo da primária", () => {
    const rows = [
      row({ id: "p", amount: 60, split_group_id: "s1" }),
      row({
        id: "s",
        amount: 40,
        installment_group_id: null, // a RPC não copia o grupo para a secundária
        split_group_id: "s1",
        split_parent_id: "p",
      }),
    ];
    const resolve = buildGroupKeyResolver(rows);
    expect(resolve(rows[0])).toBe("g1");
    expect(resolve(rows[1])).toBe("g1");
  });

  it("isola a secundária quando a primária não está no conjunto", () => {
    const orphan = row({ id: "s", installment_group_id: null, split_parent_id: "sumiu" });
    expect(buildGroupKeyResolver([orphan])(orphan)).toBe("avulso:s");
  });
});

describe("buildMonthlyInstallments", () => {
  it("separa realizado (mês atual incluso) de previsto", () => {
    const points = buildMonthlyInstallments(threeInstallments(), {
      currentMonth: CURRENT,
      monthsBack: 6,
    });

    expect(points.map((p) => p.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(points[0]).toMatchObject({ realizado: 100, previsto: 0, total: 100, isFuture: false });
    expect(points[1]).toMatchObject({ realizado: 0, previsto: 100, total: 100, isFuture: true });
    expect(points[2].isFuture).toBe(true);
  });

  it("soma as partes de uma parcela dividida sem contar a parcela duas vezes", () => {
    const rows = [
      row({ id: "p", description: "Airbnb 1/3", amount: 60, split_group_id: "s1" }),
      row({
        id: "s",
        description: "Airbnb 1/3 - João",
        amount: 40,
        installment_group_id: null,
        split_group_id: "s1",
        split_parent_id: "p",
      }),
    ];

    const [july] = buildMonthlyInstallments(rows, { currentMonth: CURRENT, monthsBack: 6 });
    expect(july.total).toBe(100);
    expect(july.count).toBe(1);
  });

  it("preenche meses sem parcela com zero", () => {
    const rows = [
      row({ id: "a", installment_number: 1, date: "2026-07-10", due_date: "2026-07-10" }),
      row({ id: "b", installment_number: 3, date: "2026-09-10", due_date: "2026-09-10" }),
    ];
    const points = buildMonthlyInstallments(rows, { currentMonth: CURRENT, monthsBack: 6 });
    expect(points.map((p) => [p.month, p.total])).toEqual([
      ["2026-07", 100],
      ["2026-08", 0],
      ["2026-09", 100],
    ]);
  });

  it("recorta o histórico na janela pedida", () => {
    const rows = [
      row({ id: "old", date: "2025-01-10", due_date: "2025-01-10" }),
      row({ id: "now", date: "2026-07-10", due_date: "2026-07-10" }),
    ];
    const points = buildMonthlyInstallments(rows, { currentMonth: CURRENT, monthsBack: 6 });
    expect(points[0].month).toBe("2026-01");
    expect(points[points.length - 1].month).toBe("2026-07");
  });

  it("abate estorno de parcela do mês", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "estorno", amount: 30, is_refund: true, installment_number: 1 }),
    ];
    const [july] = buildMonthlyInstallments(rows, { currentMonth: CURRENT, monthsBack: 6 });
    expect(july.total).toBe(70);
  });

  it("ignora quem não é parcelado", () => {
    expect(
      buildMonthlyInstallments([row({ id: "a", total_installments: 1 })], {
        currentMonth: CURRENT,
        monthsBack: 6,
      })
    ).toEqual([]);
  });
});

describe("earliestInstallmentMonth", () => {
  it("acha o primeiro mês com parcela e ignora quem não é parcelado", () => {
    const rows = [
      row({ id: "a", date: "2026-07-10", due_date: "2026-07-10" }),
      row({ id: "b", date: "2026-02-10", due_date: "2026-02-10" }),
      row({ id: "avista", total_installments: 1, date: "2024-01-10", due_date: "2024-01-10" }),
    ];
    expect(earliestInstallmentMonth(rows)).toBe("2026-02");
    expect(earliestInstallmentMonth([])).toBeNull();
  });
});

describe("monthsBetween", () => {
  it("conta meses inteiros", () => {
    expect(monthsBetween("2026-01", "2026-07")).toBe(6);
    expect(monthsBetween("2026-07", "2026-07")).toBe(0);
  });
});

describe("usableHistoryWindows", () => {
  const options = [6, 12, 24] as const;

  it("desabilita a janela que não acrescenta mês nenhum", () => {
    // Histórico começa em abr/26: só 3 meses antes do mês atual.
    const rows = [row({ id: "a", date: "2026-04-10", due_date: "2026-04-10" })];
    expect(usableHistoryWindows(options, rows, CURRENT)).toEqual([
      { months: 6, enabled: true }, // menor janela que cobre tudo
      { months: 12, enabled: false },
      { months: 24, enabled: false },
    ]);
  });

  it("libera as janelas cobertas pelo histórico", () => {
    // Histórico de 14 meses: 6m mostra parte, 12m mostra mais, 24m cobre tudo.
    const rows = [row({ id: "a", date: "2025-05-10", due_date: "2025-05-10" })];
    expect(usableHistoryWindows(options, rows, CURRENT)).toEqual([
      { months: 6, enabled: true },
      { months: 12, enabled: true },
      { months: 24, enabled: true },
    ]);
  });

  it("não desabilita nada quando não há parcelamento", () => {
    expect(usableHistoryWindows(options, [], CURRENT).every((o) => o.enabled)).toBe(true);
  });
});

describe("stripInstallmentSuffix", () => {
  it("tira só a marcação da parcela", () => {
    expect(stripInstallmentSuffix("Sofá 2/3", 3)).toBe("Sofá");
    expect(stripInstallmentSuffix("Airbnb 1/3 - João", 3)).toBe("Airbnb - João");
    // Não confunde com outros números da descrição.
    expect(stripInstallmentSuffix("Plano 12/2026 1/3", 3)).toBe("Plano 12/2026");
  });
});

describe("buildInstallmentGroups", () => {
  it("resume progresso, valor da parcela e quanto falta", () => {
    const [group] = buildInstallmentGroups(threeInstallments(), { currentMonth: CURRENT });

    expect(group).toMatchObject({
      key: "g1",
      description: "Sofá",
      cardName: "Itaú",
      totalInstallments: 3,
      paidCount: 1,
      remainingCount: 2,
      installmentAmount: 100,
      totalAmount: 300,
      remainingAmount: 200,
      nextMonth: "2026-08",
      lastMonth: "2026-09",
      isActive: true,
    });
  });

  it("junta as partes de um rateio numa linha só", () => {
    const rows = [
      row({ id: "p", description: "Airbnb 1/3", amount: 60, split_group_id: "s1" }),
      row({
        id: "s",
        description: "Airbnb 1/3 - João",
        amount: 40,
        installment_group_id: null,
        split_group_id: "s1",
        split_parent_id: "p",
      }),
    ];
    const groups = buildInstallmentGroups(rows, { currentMonth: CURRENT });
    expect(groups).toHaveLength(1);
    expect(groups[0].totalAmount).toBe(100);
  });

  it("usa o nº da parcela quando as antigas não estão cadastradas", () => {
    // Fatura importada no meio do parcelamento: só existe a 7/10 em diante.
    const rows = [
      row({ id: "a", installment_number: 7, total_installments: 10, date: "2026-07-10", due_date: "2026-07-10" }),
      row({ id: "b", installment_number: 8, total_installments: 10, date: "2026-08-10", due_date: "2026-08-10" }),
    ];
    const [group] = buildInstallmentGroups(rows, { currentMonth: CURRENT });
    expect(group.paidCount).toBe(7);
    expect(group.remainingCount).toBe(1);
  });

  it("marca como quitado o parcelamento sem parcela futura", () => {
    const rows = [
      row({ id: "a", installment_number: 3, date: "2026-05-10", due_date: "2026-05-10" }),
    ];
    const [group] = buildInstallmentGroups(rows, { currentMonth: CURRENT });
    expect(group.isActive).toBe(false);
    expect(group.remainingAmount).toBe(0);
    expect(group.nextMonth).toBeNull();
  });
});

describe("buildInstallmentsOverview", () => {
  it("resume mês atual, aberto, média futura e pico", () => {
    const rows = threeInstallments();
    const points = buildMonthlyInstallments(rows, { currentMonth: CURRENT, monthsBack: 6 });
    const groups = buildInstallmentGroups(rows, { currentMonth: CURRENT });
    const overview = buildInstallmentsOverview(points, groups, { currentMonth: CURRENT });

    expect(overview).toMatchObject({
      currentMonthAmount: 100,
      currentMonthCount: 1,
      openAmount: 300,
      nextMonthsAverage: 100,
      nextMonthsWindow: 2,
      activeGroups: 1,
      monthsUntilFree: 2,
    });
    expect(overview.peak?.month).toBe("2026-07");
  });

  it("não conta mês passado no total em aberto", () => {
    const rows = [
      row({ id: "old", installment_number: 1, date: "2026-05-10", due_date: "2026-05-10" }),
      row({ id: "now", installment_number: 2, date: "2026-07-10", due_date: "2026-07-10" }),
    ];
    const points = buildMonthlyInstallments(rows, { currentMonth: CURRENT, monthsBack: 6 });
    const groups = buildInstallmentGroups(rows, { currentMonth: CURRENT });
    const overview = buildInstallmentsOverview(points, groups, { currentMonth: CURRENT });

    expect(overview.openAmount).toBe(100);
    expect(overview.monthsUntilFree).toBe(0);
  });
});
