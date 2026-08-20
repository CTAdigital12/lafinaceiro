import { describe, it, expect } from "vitest";
import {
  isFutureYmd,
  resolveStatus,
  installmentStatus,
} from "@/lib/transactionStatus";

const HOJE = "2026-08-20";

describe("isFutureYmd", () => {
  it("hoje não é futuro", () => {
    expect(isFutureYmd(HOJE, HOJE)).toBe(false);
  });

  it("ontem não é futuro", () => {
    expect(isFutureYmd("2026-08-19", HOJE)).toBe(false);
  });

  it("amanhã é futuro", () => {
    expect(isFutureYmd("2026-08-21", HOJE)).toBe(true);
  });

  it("compara por dia, não por hora — a virada de mês e de ano ordena certo", () => {
    expect(isFutureYmd("2026-09-01", "2026-08-31")).toBe(true);
    expect(isFutureYmd("2027-01-01", "2026-12-31")).toBe(true);
    expect(isFutureYmd("2026-08-09", "2026-08-10")).toBe(false);
  });
});

describe("resolveStatus", () => {
  it("data futura nunca nasce concluída", () => {
    expect(resolveStatus("completed", "2026-09-15", HOJE)).toBe("pending");
  });

  it("data de hoje respeita a escolha", () => {
    expect(resolveStatus("completed", HOJE, HOJE)).toBe("completed");
  });

  it("data passada respeita a escolha", () => {
    expect(resolveStatus("completed", "2026-07-01", HOJE)).toBe("completed");
  });

  it("nunca promove pendente para concluída", () => {
    expect(resolveStatus("pending", "2026-07-01", HOJE)).toBe("pending");
    expect(resolveStatus("pending", "2026-09-15", HOJE)).toBe("pending");
  });
});

describe("installmentStatus", () => {
  it("parcela que não é a primeira sempre nasce pendente", () => {
    expect(
      installmentStatus({
        isFirst: false,
        dateYmd: "2026-07-01", // passada, e ainda assim pendente
        chosen: "completed",
        todayYmd: HOJE,
      }),
    ).toBe("pending");
  });

  it("primeira parcela no passado herda o status escolhido", () => {
    // Regressão: compra no cartão feita hoje precisa entrar na fatura atual, e
    // para isso a primeira parcela tem que ser `completed` (countsTowardInvoice).
    expect(
      installmentStatus({
        isFirst: true,
        dateYmd: HOJE,
        chosen: "completed",
        todayYmd: HOJE,
      }),
    ).toBe("completed");
  });

  it("primeira parcela com data futura nasce pendente — o defeito do empréstimo", () => {
    // Caso real: "Empréstimo Reforma 8/26", R$ 1.500,00, data 15/08. Nasceu
    // "Concluída" porque o formulário tem esse padrão, ficou fora do saldo
    // enquanto 15/08 era futuro e derrubou a conta em 1.500,00 quando a data
    // chegou.
    expect(
      installmentStatus({
        isFirst: true,
        dateYmd: "2026-08-15",
        chosen: "completed",
        todayYmd: "2026-08-10",
      }),
    ).toBe("pending");
  });

  it("série inteira lançada com início futuro nasce toda pendente", () => {
    const parcelas = ["2026-09-15", "2026-10-15", "2026-11-15"].map((dateYmd, i) =>
      installmentStatus({
        isFirst: i === 0,
        dateYmd,
        chosen: "completed",
        todayYmd: HOJE,
      }),
    );

    expect(parcelas).toEqual(["pending", "pending", "pending"]);
  });
});
