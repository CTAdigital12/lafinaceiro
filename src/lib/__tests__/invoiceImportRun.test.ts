import { describe, it, expect, vi } from "vitest";
import {
  runImportRows,
  buildRowLabel,
  type PreparedRow,
} from "../invoiceImportRun";

type Lancamento = { id: string; installment_group_id?: string | null };

const linha = (id: string, extra?: Partial<Lancamento>): PreparedRow<Lancamento> => ({
  transaction: { id, ...extra },
  label: `linha ${id}`,
});

describe("runImportRows", () => {
  it("grava tudo e não reporta falha quando nada dá errado", async () => {
    const create = vi.fn().mockResolvedValue(undefined);

    const resultado = await runImportRows([linha("a"), linha("b")], create);

    expect(resultado.succeeded).toBe(2);
    expect(resultado.failed).toEqual([]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  // O ponto do módulo: uma linha ruim não pode travar as boas nem derrubar a
  // importação inteira. Se o laço parasse na primeira falha, "c" nunca seria
  // tentada e `succeeded` seria 1.
  it("segue depois de uma falha e ainda tenta as linhas seguintes", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("violação de política"))
      .mockResolvedValueOnce(undefined);

    const resultado = await runImportRows([linha("a"), linha("b"), linha("c")], create);

    expect(create).toHaveBeenCalledTimes(3);
    expect(resultado.succeeded).toBe(2);
    expect(resultado.failed).toHaveLength(1);
  });

  it("devolve QUAL linha falhou e com que mensagem", async () => {
    const create = vi.fn(async (t: Lancamento) => {
      if (t.id === "b") throw new Error("duplicate key value violates unique constraint");
    });

    const resultado = await runImportRows([linha("a"), linha("b")], create);

    expect(resultado.failed).toEqual([
      {
        transaction: { id: "b" },
        label: "linha b",
        message: "duplicate key value violates unique constraint",
      },
    ]);
  });

  it("não lança, mesmo com todas as linhas falhando", async () => {
    const create = vi.fn().mockRejectedValue(new Error("sem conexão"));

    const resultado = await runImportRows([linha("a"), linha("b")], create);

    expect(resultado.succeeded).toBe(0);
    expect(resultado.failed.map((f) => f.label)).toEqual(["linha a", "linha b"]);
  });

  // O que é lançado num `catch` é `unknown`; antes de `mensagemDeErro` um throw
  // que não fosse Error virava `undefined` na tela.
  it("usa o texto de fallback quando o que foi lançado não é um Error", async () => {
    const create = vi.fn().mockRejectedValue("caiu");

    const resultado = await runImportRows([linha("a")], create);

    expect(resultado.failed[0].message).toBe("Erro ao processar solicitação");
  });

  it("avança o progresso também nas linhas que falham, para a barra não congelar", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce(undefined);
    const onProgress = vi.fn();

    await runImportRows([linha("a"), linha("b")], create, onProgress);

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("não chama o progresso quando não há linha nenhuma", async () => {
    const onProgress = vi.fn();

    const resultado = await runImportRows([], vi.fn(), onProgress);

    expect(resultado).toEqual({ succeeded: 0, failed: [] });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("grava uma de cada vez, em ordem", async () => {
    const emVoo: string[] = [];
    const ordem: string[] = [];
    const create = vi.fn(async (t: Lancamento) => {
      emVoo.push(t.id);
      expect(emVoo).toHaveLength(1);
      await Promise.resolve();
      ordem.push(t.id);
      emVoo.pop();
    });

    await runImportRows([linha("a"), linha("b"), linha("c")], create);

    expect(ordem).toEqual(["a", "b", "c"]);
  });

  // É o que torna o "tentar de novo" seguro: a linha devolvida é a MESMA que
  // falhou, com o installment_group_id já sorteado. Regravar a partir dela põe
  // a parcela de volta no grupo dela, em vez de abrir um grupo novo.
  it("devolve o mesmo objeto de lançamento, para a retentativa preservar o grupo de parcelas", async () => {
    const original = linha("b", { installment_group_id: "grupo-1" });
    const create = vi.fn(async (t: Lancamento) => {
      if (t.id === "b") throw new Error("falhou");
    });

    const primeira = await runImportRows([linha("a"), original], create);
    expect(primeira.failed[0].transaction).toBe(original.transaction);

    const gravadas: Lancamento[] = [];
    const segunda = await runImportRows(primeira.failed, async (t) => {
      gravadas.push(t);
    });

    expect(segunda.failed).toEqual([]);
    expect(gravadas).toEqual([{ id: "b", installment_group_id: "grupo-1" }]);
  });
});

describe("buildRowLabel", () => {
  // `formatCurrency` usa `Intl.NumberFormat`, que separa "R$" do número com um
  // espaço INSEPARÁVEL (U+00A0), não com o espaço comum. Os dois são idênticos
  // na tela, então o `\u00A0` está escrito por extenso aqui — com o espaço
  // comum o teste falha com "expected X to be X", que não diz nada.
  it("identifica a linha por descrição, data e valor", () => {
    expect(
      buildRowLabel({ description: "NETFLIX.COM", date: "2026-09-12", amount: 44.9 }),
    ).toBe("NETFLIX.COM — 2026-09-12 — R$\u00A044,90");
  });

  // Parcela futura carrega a data de compra da linha original: sem o número,
  // 3/10 e 4/10 sairiam com rótulos idênticos na lista de falhas.
  it("distingue parcelas futuras que compartilham a data de compra", () => {
    const base = { description: "SHOPEE", date: "2026-09-12", amount: 100 };

    expect(
      buildRowLabel({ ...base, installmentNumber: 3, totalInstallments: 10 }),
    ).not.toBe(buildRowLabel({ ...base, installmentNumber: 4, totalInstallments: 10 }));

    expect(
      buildRowLabel({ ...base, installmentNumber: 4, totalInstallments: 10 }),
    ).toBe("SHOPEE (parcela 4/10) — 2026-09-12 — R$\u00A0100,00");
  });

  it("omite a parcela quando falta o número ou o total", () => {
    const base = { description: "IFOOD", date: "2026-09-01", amount: 30 };
    const semParcela = "IFOOD — 2026-09-01 — R$\u00A030,00";

    expect(buildRowLabel({ ...base, installmentNumber: 2, totalInstallments: null })).toBe(semParcela);
    expect(buildRowLabel({ ...base, installmentNumber: null, totalInstallments: 5 })).toBe(semParcela);
    expect(buildRowLabel(base)).toBe(semParcela);
  });
});
