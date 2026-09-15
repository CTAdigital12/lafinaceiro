import { describe, it, expect } from "vitest";
import {
  reconcileSpreadsheet,
  parseSpreadsheetFile,
  ofxToSpreadsheetItems,
  orphanRows,
  type SpreadsheetItem,
  type SystemTransaction,
} from "@/lib/spreadsheetReconciliation";
import type { OFXTransaction } from "@/lib/ofxParser";

let nextId = 0;

const item = (
  date: string,
  amount: number,
  description = "Compra",
  overrides: Partial<SpreadsheetItem> = {},
): SpreadsheetItem => ({
  date,
  description,
  amount,
  isCredit: false,
  rowIndex: nextId++,
  ...overrides,
});

const tx = (
  date: string,
  amount: number,
  description = "Compra",
  overrides: Partial<SystemTransaction> = {},
): SystemTransaction => ({
  id: `tx-${nextId++}`,
  date,
  due_date: null,
  description,
  original_description: null,
  amount,
  is_refund: false,
  is_corporate_expense: false,
  category_id: null,
  status: "concluida",
  ...overrides,
});

describe("reconcileSpreadsheet — passada 1 (data + valor)", () => {
  it("casa data e valor iguais e não sobra nada dos dois lados", () => {
    const r = reconcileSpreadsheet(
      [item("2026-03-10", 150.9, "MERCADO SAO JOSE")],
      [tx("2026-03-10", 150.9, "Mercado São José")],
    );

    expect(r.matched).toHaveLength(1);
    expect(r.onlyInSpreadsheet).toHaveLength(0);
    expect(r.onlyInSystem).toHaveLength(0);
    expect(r.valueDiscrepancies).toHaveLength(0);
    expect(r.summary).toEqual({ total: 2, matched: 1, discrepancies: 0, missing: 0, extra: 0 });
  });

  it("aceita diferença de até R$ 0,05 como o mesmo lançamento", () => {
    const r = reconcileSpreadsheet([item("2026-03-10", 100.05)], [tx("2026-03-10", 100)]);

    expect(r.matched).toHaveLength(1);
    expect(r.valueDiscrepancies).toHaveLength(0);
  });

  it("acima da tolerância vira discrepância de valor, não casamento", () => {
    const r = reconcileSpreadsheet([item("2026-03-10", 100.06)], [tx("2026-03-10", 100)]);

    expect(r.matched).toHaveLength(0);
    expect(r.valueDiscrepancies).toHaveLength(1);
    expect(r.valueDiscrepancies[0].difference).toBeCloseTo(0.06, 2);
  });

  it("compara só a data, ignorando a hora que vier junto", () => {
    const r = reconcileSpreadsheet(
      [item("2026-03-10", 80)],
      [tx("2026-03-10T00:00:00+00:00", 80)],
    );

    expect(r.matched).toHaveLength(1);
  });

  it("não deixa duas linhas da planilha consumirem o mesmo lançamento", () => {
    const r = reconcileSpreadsheet(
      [item("2026-03-10", 40, "UBER"), item("2026-03-10", 40, "UBER")],
      [tx("2026-03-10", 40, "Uber")],
    );

    expect(r.matched).toHaveLength(1);
    expect(r.onlyInSpreadsheet).toHaveLength(1);
    expect(r.valueDiscrepancies).toHaveLength(0);
  });

  it("data diferente não casa nem vira discrepância", () => {
    const r = reconcileSpreadsheet([item("2026-03-11", 40)], [tx("2026-03-10", 40)]);

    expect(r.matched).toHaveLength(0);
    expect(r.valueDiscrepancies).toHaveLength(0);
    expect(r.onlyInSpreadsheet).toHaveLength(1);
    expect(r.onlyInSystem).toHaveLength(1);
  });
});

describe("reconcileSpreadsheet — desempate entre candidatos", () => {
  it("na mesma data e valor, escolhe a descrição mais parecida", () => {
    const certo = tx("2026-03-10", 60, "Posto Ipiranga");
    const errado = tx("2026-03-10", 60, "Farmácia Pague Menos");

    const r = reconcileSpreadsheet([item("2026-03-10", 60, "POSTO IPIRANGA")], [errado, certo]);

    expect(r.matched[0].transaction.id).toBe(certo.id);
    expect(r.onlyInSystem.map((t) => t.id)).toEqual([errado.id]);
  });

  it("usa a descrição original do banco quando ela existe", () => {
    const certo = tx("2026-03-10", 60, "Gasolina do mês", {
      original_description: "POSTO IPIRANGA LTDA",
    });
    const errado = tx("2026-03-10", 60, "Padaria");

    const r = reconcileSpreadsheet([item("2026-03-10", 60, "POSTO IPIRANGA LTDA")], [errado, certo]);

    expect(r.matched[0].transaction.id).toBe(certo.id);
  });

  it("o previsto é consumido antes de um concluído de descrição fraca", () => {
    const previsto = tx("2026-03-10", 200, "Assinatura prevista", { is_provisional: true });
    const concluido = tx("2026-03-10", 200, "Compra avulsa");

    const r = reconcileSpreadsheet([item("2026-03-10", 200, "NETFLIX")], [concluido, previsto]);

    expect(r.matched[0].transaction.id).toBe(previsto.id);
  });

  it("mas o bônus do previsto não vence uma descrição idêntica", () => {
    const previsto = tx("2026-03-10", 200, "Assinatura prevista", { is_provisional: true });
    const identico = tx("2026-03-10", 200, "NETFLIX");

    const r = reconcileSpreadsheet([item("2026-03-10", 200, "NETFLIX")], [previsto, identico]);

    expect(r.matched[0].transaction.id).toBe(identico.id);
  });
});

describe("reconcileSpreadsheet — sinal do crédito (matchCreditSign)", () => {
  it("desligado por padrão: em extrato, crédito casa com despesa comum", () => {
    const r = reconcileSpreadsheet(
      [item("2026-03-10", 90, "PAGAMENTO", { isCredit: true })],
      [tx("2026-03-10", 90, "Pagamento")],
    );

    expect(r.matched).toHaveLength(1);
  });

  it("ligado: crédito da fatura só casa com estorno", () => {
    const estorno = tx("2026-03-10", 90, "Estorno da compra", { is_refund: true });
    const compra = tx("2026-03-10", 90, "Compra");

    const r = reconcileSpreadsheet(
      [item("2026-03-10", 90, "ESTORNO", { isCredit: true })],
      [compra, estorno],
      { matchCreditSign: true },
    );

    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].transaction.id).toBe(estorno.id);
    expect(r.onlyInSystem.map((t) => t.id)).toEqual([compra.id]);
  });

  it("ligado: compra não casa com estorno nem vira discrepância", () => {
    const r = reconcileSpreadsheet(
      [item("2026-03-10", 90, "COMPRA")],
      [tx("2026-03-10", 90, "Estorno", { is_refund: true })],
      { matchCreditSign: true },
    );

    expect(r.matched).toHaveLength(0);
    expect(r.valueDiscrepancies).toHaveLength(0);
    expect(r.onlyInSpreadsheet).toHaveLength(1);
    expect(r.onlyInSystem).toHaveLength(1);
  });

  it("ligado: o filtro de sinal vale também na passada de discrepância", () => {
    const r = reconcileSpreadsheet(
      [item("2026-03-10", 90, "ESTORNO", { isCredit: true })],
      [tx("2026-03-10", 40, "Compra")],
      { matchCreditSign: true },
    );

    expect(r.valueDiscrepancies).toHaveLength(0);
    expect(r.onlyInSpreadsheet).toHaveLength(1);
    expect(r.onlyInSystem).toHaveLength(1);
  });
});

describe("reconcileSpreadsheet — divisão por categoria", () => {
  const parte = (amount: number, over: Partial<SystemTransaction> = {}) =>
    tx("2026-03-10", amount, "Supermercado", {
      split_group_id: "grupo-1",
      ...over,
    });

  it("soma as partes numa linha só antes de comparar", () => {
    const primaria = parte(60, { split_parent_id: null });
    const filha = parte(40, { split_parent_id: primaria.id });

    const r = reconcileSpreadsheet([item("2026-03-10", 100, "SUPERMERCADO")], [primaria, filha]);

    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].transaction.amount).toBe(100);
    expect(r.matched[0].transaction.splitMemberIds).toEqual([primaria.id, filha.id]);
    expect(r.onlyInSystem).toHaveLength(0);
    // Duas linhas no banco, mas uma só na conciliação.
    expect(r.summary.total).toBe(2);
  });

  it("a linha representante conserva a descrição da parte primária", () => {
    const primaria = tx("2026-03-10", 60, "SUPERMERCADO 01/03", {
      split_group_id: "grupo-1",
      split_parent_id: null,
    });
    const filha = tx("2026-03-10", 40, "parte: limpeza", {
      split_group_id: "grupo-1",
      split_parent_id: primaria.id,
    });

    const r = reconcileSpreadsheet([item("2026-03-10", 100, "SUPERMERCADO")], [filha, primaria]);

    expect(r.matched[0].transaction.description).toBe("SUPERMERCADO 01/03");
  });

  it("sem o colapso a divisão apareceria como duas sobras — não aparece", () => {
    const primaria = parte(60, { split_parent_id: null });
    const filha = parte(40, { split_parent_id: primaria.id });

    const r = reconcileSpreadsheet([], [primaria, filha]);

    expect(r.onlyInSystem).toHaveLength(1);
    expect(r.onlyInSystem[0].amount).toBe(100);
  });
});

describe("reconcileSpreadsheet — passada 2 (mesma data, valor diferente)", () => {
  it("reporta a diferença com o sinal da planilha menos o sistema", () => {
    const r = reconcileSpreadsheet([item("2026-03-10", 80)], [tx("2026-03-10", 100)]);

    expect(r.valueDiscrepancies).toHaveLength(1);
    expect(r.valueDiscrepancies[0].difference).toBeCloseTo(-20, 2);
    expect(r.summary).toEqual({ total: 2, matched: 0, discrepancies: 1, missing: 0, extra: 0 });
  });

  it("um lançamento já casado na passada 1 não é oferecido como discrepância", () => {
    const r = reconcileSpreadsheet(
      [item("2026-03-10", 100, "IGUAL"), item("2026-03-10", 33, "OUTRA")],
      [tx("2026-03-10", 100, "IGUAL")],
    );

    expect(r.matched).toHaveLength(1);
    expect(r.valueDiscrepancies).toHaveLength(0);
    expect(r.onlyInSpreadsheet).toHaveLength(1);
  });

  it("entre dois candidatos na mesma data, pareia com o de valor mais próximo", () => {
    const proximo = tx("2026-03-10", 100.1, "Mercado");
    const distante = tx("2026-03-10", 5000, "Aluguel");

    const r = reconcileSpreadsheet([item("2026-03-10", 100, "MERCADO")], [distante, proximo]);

    expect(r.valueDiscrepancies).toHaveLength(1);
    expect(r.valueDiscrepancies[0].transaction.id).toBe(proximo.id);
    expect(r.onlyInSystem.map((t) => t.id)).toEqual([distante.id]);
  });
});

describe("reconcileSpreadsheet — casos de borda", () => {
  it("planilha vazia devolve tudo como sobra do sistema", () => {
    const r = reconcileSpreadsheet([], [tx("2026-03-10", 10), tx("2026-03-11", 20)]);

    expect(r.onlyInSystem).toHaveLength(2);
    expect(r.summary).toEqual({ total: 2, matched: 0, discrepancies: 0, missing: 0, extra: 2 });
  });

  it("sistema vazio devolve tudo como faltando", () => {
    const r = reconcileSpreadsheet([item("2026-03-10", 10)], []);

    expect(r.onlyInSpreadsheet).toHaveLength(1);
    expect(r.summary).toEqual({ total: 1, matched: 0, discrepancies: 0, missing: 1, extra: 0 });
  });

  it("valor vindo como texto do banco ainda é comparado como número", () => {
    const r = reconcileSpreadsheet(
      [item("2026-03-10", 150.9)],
      [tx("2026-03-10", "150.90" as unknown as number)],
    );

    expect(r.matched).toHaveLength(1);
  });
});

const csvFile = (content: string, name = "fatura.csv") =>
  new File([content], name, { type: "text/csv" });

describe("parseSpreadsheetFile — CSV", () => {
  it("lê cabeçalho em português, data DD/MM/AAAA e valor em R$", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(["Data;Descrição;Valor", "10/03/2026;MERCADO SAO JOSE;R$ 1.234,56"].join("\n")),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      date: "2026-03-10",
      description: "MERCADO SAO JOSE",
      amount: 1234.56,
      isCredit: false,
    });
  });

  it("guarda o sinal: valor negativo vira crédito com valor positivo", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(["Data;Descrição;Valor", "10/03/2026;ESTORNO PARCIAL;-0,16"].join("\n")),
    );

    expect(items[0].amount).toBe(0.16);
    expect(items[0].isCredit).toBe(true);
  });

  it("detecta vírgula como separador quando é ela que domina a linha", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(["date,description,amount", "2026-03-10,UBER TRIP,25.90"].join("\n")),
    );

    expect(items[0]).toMatchObject({ date: "2026-03-10", description: "UBER TRIP", amount: 25.9 });
  });

  it("acha as colunas fora de ordem pelo nome do cabeçalho", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(["Valor;Estabelecimento;Data compra", "89,90;NETFLIX;10/03/2026"].join("\n")),
    );

    expect(items[0]).toMatchObject({ date: "2026-03-10", description: "NETFLIX", amount: 89.9 });
  });

  it("cabeçalho desconhecido cai na ordem data, descrição, valor", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(["col1;col2;col3", "10/03/2026;PADARIA;12,00"].join("\n")),
    );

    expect(items[0]).toMatchObject({ date: "2026-03-10", description: "PADARIA", amount: 12 });
  });

  it("respeita aspas: separador dentro do campo não corta a descrição", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(['Data;Descrição;Valor', '10/03/2026;"LOJA A; FILIAL B";50,00'].join("\n")),
    );

    expect(items[0].description).toBe("LOJA A; FILIAL B");
    expect(items[0].amount).toBe(50);
  });

  it("descarta linha sem data, sem descrição ou com valor zero", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(
        [
          "Data;Descrição;Valor",
          ";SEM DATA;10,00",
          "10/03/2026;;10,00",
          "10/03/2026;VALOR ZERO;0,00",
          "10/03/2026;VALIDA;10,00",
        ].join("\n"),
      ),
    );

    expect(items.map((i) => i.description)).toEqual(["VALIDA"]);
  });

  it("rowIndex aponta a linha do arquivo, contando o cabeçalho", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(["Data;Descrição;Valor", "10/03/2026;PRIMEIRA;10,00", "11/03/2026;SEGUNDA;20,00"].join("\n")),
    );

    expect(items.map((i) => i.rowIndex)).toEqual([1, 2]);
  });

  it("arquivo só com cabeçalho devolve lista vazia", async () => {
    expect(await parseSpreadsheetFile(csvFile("Data;Descrição;Valor"))).toEqual([]);
  });

  it("aceita ano de dois dígitos e data já em ISO", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(["Data;Descrição;Valor", "10/03/26;DOIS DIGITOS;10,00", "2026-03-11;ISO;20,00"].join("\n")),
    );

    expect(items.map((i) => i.date)).toEqual(["2026-03-10", "2026-03-11"]);
  });

  it("valor no formato americano não é confundido com o brasileiro", async () => {
    const items = await parseSpreadsheetFile(
      csvFile(["Data;Descrição;Valor", "10/03/2026;IMPORTADO;1,234.56"].join("\n")),
    );

    expect(items[0].amount).toBe(1234.56);
  });
});

describe("ofxToSpreadsheetItems — a direção do extrato não pode se perder", () => {
  const ofx: OFXTransaction[] = [
    { id: "o1", date: "2026-08-06", description: "PIX QRS NIC BR06 08", amount: 40, type: "expense" },
    { id: "o2", date: "2026-08-10", description: "PIX TRANSF RAIZHE 10 08", amount: 93.9, type: "income" },
  ];

  it("traduz saída do OFX em débito e entrada em crédito", () => {
    const items = ofxToSpreadsheetItems(ofx);

    expect(items[0].isCredit).toBe(false);
    expect(items[1].isCredit).toBe(true);
  });

  it("conserva o valor em módulo e numera as linhas na ordem do arquivo", () => {
    const items = ofxToSpreadsheetItems(ofx);

    expect(items.map((i) => i.amount)).toEqual([40, 93.9]);
    expect(items.map((i) => i.rowIndex)).toEqual([0, 1]);
  });

  /**
   * O bug real: com `isCredit` fixo em `false`, uma ENTRADA do extrato chegava
   * à tela indistinguível de uma saída. Quem incluísse sem marcar o extorno
   * gravava despesa, e o saldo errava em duas vezes o valor.
   */
  it("não achata entrada e saída de mesmo valor na mesma direção", () => {
    const mesmoValor: OFXTransaction[] = [
      { id: "o3", date: "2026-08-25", description: "PIX TRANSF Rulhan 25 08", amount: 54, type: "income" },
      { id: "o4", date: "2026-08-25", description: "DEV PIX Rulhan Rafa25 08", amount: 54, type: "expense" },
    ];

    const items = ofxToSpreadsheetItems(mesmoValor);

    expect(items[0].isCredit).toBe(true);
    expect(items[1].isCredit).toBe(false);
    expect(items[0].isCredit).not.toBe(items[1].isCredit);
  });

  it("carregar a direção não muda o matching da conciliação de conta", () => {
    // `matchCreditSign` fica desligado em extrato de conta. Se carregar
    // `isCredit` passasse a filtrar por sinal, toda entrada deixaria de casar.
    const system = [tx("2026-08-10", 93.9, "PIX TRANSF RAIZHE 10 08", { id: "t1" })];

    const result = reconcileSpreadsheet(ofxToSpreadsheetItems(ofx), system);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].transaction.id).toBe("t1");
  });
});

describe("orphanRows — lançamento sem conta que casou com o extrato", () => {
  const extrato = [item("2026-08-25", 54, "DEV PIX Rulhan Rafa25 08")];

  it("aponta o lançamento órfão que casou, em vez de deixá-lo passar por conciliado", () => {
    const orfao = tx("2026-08-25", 54, "DEV PIX Rulhan Rafa25 08", { id: "orfao", account_id: null });

    const encontrados = orphanRows(reconcileSpreadsheet(extrato, [orfao]));

    expect(encontrados.map((t) => t.id)).toEqual(["orfao"]);
  });

  it("não aponta lançamento que já tem conta", () => {
    const comConta = tx("2026-08-25", 54, "DEV PIX Rulhan Rafa25 08", { account_id: "conta-1" });

    expect(orphanRows(reconcileSpreadsheet(extrato, [comConta]))).toHaveLength(0);
  });

  /**
   * A conciliação de FATURA não busca `account_id`, então lá o campo chega
   * `undefined`. Se `orphanRows` tratasse ausência como órfão, toda linha de
   * cartão viraria um falso alarme.
   */
  it("não confunde coluna não buscada (undefined) com conta vazia (null)", () => {
    const semColuna = tx("2026-08-25", 54, "DEV PIX Rulhan Rafa25 08");

    expect(semColuna.account_id).toBeUndefined();
    expect(orphanRows(reconcileSpreadsheet(extrato, [semColuna]))).toHaveLength(0);
  });

  it("também aponta o órfão que casou com divergência de valor", () => {
    const orfao = tx("2026-08-25", 50, "DEV PIX Rulhan Rafa25 08", { id: "orfao", account_id: null });

    const r = reconcileSpreadsheet(extrato, [orfao]);

    expect(r.valueDiscrepancies).toHaveLength(1);
    expect(orphanRows(r).map((t) => t.id)).toEqual(["orfao"]);
  });

  /**
   * O caso que gerou a duplicata em 14/09/2026: o órfão só é alcançável se a
   * busca o trouxer. Se ele ficar de fora, o item do extrato cai em
   * "apenas no banco" e a tela oferece INCLUIR o que já existe.
   */
  it("sem o órfão na busca, o item do extrato vira falso 'apenas no banco'", () => {
    const semOrfao = reconcileSpreadsheet(extrato, []);

    expect(semOrfao.onlyInSpreadsheet).toHaveLength(1);
    expect(orphanRows(semOrfao)).toHaveLength(0);
  });

  it("leva todas as partes de uma divisão colapsada, não só a primária", () => {
    const grupo = "g1";
    const primaria = tx("2026-08-25", 30, "DEV PIX Rulhan Rafa25 08", {
      id: "p", account_id: null, split_group_id: grupo, split_parent_id: null,
    });
    const parte = tx("2026-08-25", 24, "DEV PIX Rulhan Rafa25 08 - parte", {
      id: "s", account_id: null, split_group_id: grupo, split_parent_id: "p",
    });

    const encontrados = orphanRows(reconcileSpreadsheet(extrato, [primaria, parte]));

    expect(encontrados).toHaveLength(1);
    expect(encontrados[0].splitMemberIds.sort()).toEqual(["p", "s"]);
  });
});
