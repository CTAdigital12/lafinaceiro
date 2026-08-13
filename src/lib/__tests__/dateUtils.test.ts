import { describe, it, expect } from "vitest";
import { ptBR } from "date-fns/locale";
import {
  parseYmd,
  ymdToLocalDate,
  formatDateBR,
  formatYmd,
  invoicePeriodFromDueDate,
  todayYmd,
  endOfMonthYmd,
  startOfMonthYmd,
} from "@/lib/dateUtils";

/**
 * Estas funções existem para tirar o fuso do caminho: uma data "YYYY-MM-DD" do
 * banco não tem hora nem fuso, e `new Date("2026-03-05")` a interpreta como
 * meia-noite UTC — que, lida em horário local a oeste de Greenwich, é dia 4.
 *
 * Por isso todas as asserções abaixo são independentes de fuso: o resultado
 * tem que ser o mesmo aqui (UTC-3) e no CI (UTC). A suíte rodando nos dois
 * ambientes é, na prática, um teste de fuso cruzado.
 */
describe("parseYmd", () => {
  it("quebra a data sem passar por Date", () => {
    expect(parseYmd("2026-03-05")).toEqual({ year: 2026, month: 3, day: 5 });
  });

  it("aceita ISO completo, usando só a parte da data", () => {
    expect(parseYmd("2026-03-05T23:45:00Z")).toEqual({
      year: 2026,
      month: 3,
      day: 5,
    });
  });

  it.each([null, undefined, "", "05/03/2026", "2026-13-01", "2026-03-32"])(
    "devolve null para entrada inválida: %s",
    (entrada) => {
      expect(parseYmd(entrada as string)).toBeNull();
    },
  );
});

describe("ymdToLocalDate", () => {
  it("ancora ao meio-dia para sobreviver a qualquer fuso", () => {
    const d = ymdToLocalDate("2026-03-05");

    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2); // março, índice 0-11
    expect(d?.getDate()).toBe(5);
    expect(d?.getHours()).toBe(12);
  });

  it("mantém o dia no primeiro do mês, que é onde o erro aparecia", () => {
    // `new Date("2026-03-01").getMonth()` devolve 1 (fevereiro) em UTC-3.
    const d = ymdToLocalDate("2026-03-01");

    expect(d?.getMonth()).toBe(2);
    expect(d?.getDate()).toBe(1);
  });

  it("devolve null para entrada inválida", () => {
    expect(ymdToLocalDate(null)).toBeNull();
  });
});

describe("formatDateBR", () => {
  it("formata sem deslocar o dia", () => {
    expect(formatDateBR("2026-03-05")).toBe("05/03/2026");
    expect(formatDateBR("2026-01-01")).toBe("01/01/2026");
    expect(formatDateBR("2026-12-31")).toBe("31/12/2026");
  });

  it("devolve '-' para nulo ou inválido", () => {
    expect(formatDateBR(null)).toBe("-");
    expect(formatDateBR("qualquer coisa")).toBe("-");
  });
});

describe("formatYmd", () => {
  it("aplica o formato pedido sem deslocar o dia", () => {
    expect(formatYmd("2026-03-05", "dd/MM")).toBe("05/03");
    expect(formatYmd("2026-03-05", "dd/MM/yyyy")).toBe("05/03/2026");
  });

  it("respeita o locale", () => {
    expect(formatYmd("2026-03-05", "dd MMM yyyy", { locale: ptBR })).toBe(
      "05 mar 2026",
    );
  });

  it("devolve '-' para nulo ou inválido", () => {
    expect(formatYmd(null, "dd/MM")).toBe("-");
    expect(formatYmd("2026-13-40", "dd/MM")).toBe("-");
  });
});

describe("invoicePeriodFromDueDate", () => {
  it("resolve o ciclo pelo mês escrito na data", () => {
    expect(invoicePeriodFromDueDate("2026-03-01")).toEqual({ month: 3, year: 2026 });
    expect(invoicePeriodFromDueDate("2026-12-31")).toEqual({ month: 12, year: 2026 });
  });

  it("devolve null quando não há vencimento", () => {
    expect(invoicePeriodFromDueDate(null)).toBeNull();
  });
});

describe("todayYmd", () => {
  it("usa o dia local, não o dia em UTC", () => {
    const agora = new Date();
    const esperado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

    expect(todayYmd()).toBe(esperado);
  });

  it("sai no formato aceito por parseYmd", () => {
    expect(parseYmd(todayYmd())).not.toBeNull();
  });
});

describe("limites de mês", () => {
  it("fecha o mês no último dia real", () => {
    expect(endOfMonthYmd(2026, 1)).toBe("2026-01-31");
    expect(endOfMonthYmd(2026, 4)).toBe("2026-04-30");
    expect(endOfMonthYmd(2026, 2)).toBe("2026-02-28");
    expect(endOfMonthYmd(2028, 2)).toBe("2028-02-29"); // bissexto
  });

  it("abre o mês no dia 1", () => {
    expect(startOfMonthYmd(2026, 3)).toBe("2026-03-01");
    expect(startOfMonthYmd(2026, 12)).toBe("2026-12-01");
  });
});
