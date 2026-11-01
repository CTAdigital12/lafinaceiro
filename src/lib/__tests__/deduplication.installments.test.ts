import { describe, it, expect } from "vitest";
import { detectDuplicates, type ExistingTransaction } from "@/lib/deduplication";

/**
 * Dedup de parcela: valor + índice NÃO identificam uma compra.
 *
 * O ramo de parcela casava só por valor, sinal e `n/total`. Duas compras
 * diferentes de mesmo valor e mesmo índice na mesma fatura casavam CRUZADO: a
 * linha da compra B consumia a transação de A (B some, marcada duplicata) e a
 * linha de A, sem par livre, entrava como nova (A duplica). A soma da fatura
 * fica igual e as duas linhas ficam erradas.
 *
 * A data não entra como igualdade cheia de propósito — ver o comentário de
 * `monthDay` em deduplication.ts: o ANO é inferido pelo parser e erra por um na
 * última parcela de todo plano de 12+ meses.
 */

const parcela = (over: Partial<ExistingTransaction> & { id: string }): ExistingTransaction => ({
  description: "Assinatura 3/12",
  original_description: "NETFLIX.COM 3/12",
  amount: 89.9,
  date: "2026-01-05",
  installment_number: 3,
  total_installments: 12,
  ...over,
});

describe("detectDuplicates — parcela", () => {
  it("não casa a linha de uma compra com a parcela de outra de mesmo valor", () => {
    const existing = [parcela({ id: "netflix" })];

    // A fatura traz as duas; a do Spotify vem primeiro, e era ela que
    // consumia a transação da Netflix.
    const dup = detectDuplicates(
      [
        {
          transaction_value: 89.9,
          installment_current: 3,
          installment_total: 12,
          description: "SPOTIFY BR 3/12",
          purchase_date: "2026-03-20",
        },
        {
          transaction_value: 89.9,
          installment_current: 3,
          installment_total: 12,
          description: "NETFLIX.COM 3/12",
          purchase_date: "2026-01-05",
        },
      ],
      existing,
    );

    expect(dup.get(0)).toBeUndefined();
    expect(dup.get(1)?.id).toBe("netflix");
  });

  it("desempata pela data da compra entre duas parcelas da mesma loja", () => {
    // Duas compras de R$ 89,90 em 12x na MESMA loja: só a data as separa.
    const existing = [
      parcela({ id: "compra-05", date: "2026-01-05" }),
      parcela({ id: "compra-20", date: "2026-01-20" }),
    ];

    const dup = detectDuplicates(
      [
        {
          transaction_value: 89.9,
          installment_current: 3,
          installment_total: 12,
          description: "NETFLIX.COM 3/12",
          purchase_date: "2026-01-20",
        },
      ],
      existing,
    );

    expect(dup.get(0)?.id).toBe("compra-20");
  });

  it("ignora o marcador de parcela na comparação de descrição", () => {
    // A parcela projetada guarda a `original_description` da linha-MÃE, com o
    // marcador dela ("2/12"); a fatura seguinte traz "3/12".
    const existing = [parcela({ id: "netflix", original_description: "NETFLIX.COM 2/12" })];

    const dup = detectDuplicates(
      [
        {
          transaction_value: 89.9,
          installment_current: 3,
          installment_total: 12,
          description: "NETFLIX.COM 3/12",
          purchase_date: "2026-01-05",
        },
      ],
      existing,
    );

    expect(dup.get(0)?.id).toBe("netflix");
  });

  it("casa a parcela criada à mão, cuja descrição nunca bate com a da fatura", () => {
    // Guarda da regressão que exigir descrição sempre teria criado: sem
    // `original_description`, o lado existente é texto digitado pelo usuário.
    const existing = [
      parcela({ id: "manual", description: "Netflix 3/12", original_description: null }),
    ];

    const dup = detectDuplicates(
      [
        {
          transaction_value: 89.9,
          installment_current: 3,
          installment_total: 12,
          description: "NETFLIX.COM*ASSINATURA 3/12",
          purchase_date: "2026-01-05",
        },
      ],
      existing,
    );

    expect(dup.get(0)?.id).toBe("manual");
  });

  it("reconhece a parcela quando o banco muda o nome da loja entre faturas", () => {
    // Fatura de nov/2026 do Black: as 2/n foram gravadas com o nome que veio na
    // fatura de out, e a de nov trouxe o nome mais longo (cidade, sem truncar).
    const existing = [
      parcela({ id: "tstore", amount: 280.55, installment_number: 2, total_installments: 6, original_description: "Tstore Curitiba Parcela 1 de 6", date: "2026-10-03" }),
      parcela({ id: "servopa", amount: 480.75, installment_number: 2, total_installments: 4, original_description: "Servopa Parcela 1 de 4", date: "2026-09-10" }),
      parcela({ id: "amazon", amount: 100.05, installment_number: 5, total_installments: 5, original_description: "Amazonmktplc*amazo Parcela 1 de 5", date: "2026-07-02" }),
    ];

    const dup = detectDuplicates(
      [
        { transaction_value: 280.55, installment_current: 2, installment_total: 6, description: "Tstore Curitiba Curitiba Bra Parcela 2 de 6", purchase_date: "2026-10-03" },
        { transaction_value: 480.75, installment_current: 2, installment_total: 4, description: "Servopa Curitiba Bra Parcela 2 de 4", purchase_date: "2026-09-10" },
        { transaction_value: 100.05, installment_current: 5, installment_total: 5, description: "Amazonmktplc*amazocoe Pauk Parcela 5 de 5", purchase_date: "2026-07-02" },
      ],
      existing,
    );

    expect(dup.get(0)?.id).toBe("tstore");
    expect(dup.get(1)?.id).toBe("servopa");
    expect(dup.get(2)?.id).toBe("amazon");
  });

  it("descrição-base vazia não serve de prefixo para qualquer loja", () => {
    const existing = [parcela({ id: "vazia", original_description: "3/12" })];

    const dup = detectDuplicates(
      [
        {
          transaction_value: 89.9,
          installment_current: 3,
          installment_total: 12,
          description: "SPOTIFY BR 3/12",
          purchase_date: "2026-01-05",
        },
      ],
      existing,
    );

    expect(dup.get(0)).toBeUndefined();
  });

  it("reconhece a última parcela de um plano de 12x apesar do ano inferido errado", () => {
    // Compra de 06/10/2025 em 12x: a 12/12 cai na fatura de out/2026, o parser
    // infere 2026 para a data da compra e a linha gravada tem 2025.
    const existing = [
      parcela({
        id: "parcela-12",
        installment_number: 12,
        original_description: "PORTA3ACESSORIOS 11/12",
        date: "2025-10-06",
      }),
    ];

    const dup = detectDuplicates(
      [
        {
          transaction_value: 89.9,
          installment_current: 12,
          installment_total: 12,
          description: "PORTA3ACESSORIOS 12/12",
          purchase_date: "2026-10-06",
        },
      ],
      existing,
    );

    expect(dup.get(0)?.id).toBe("parcela-12");
  });
});
