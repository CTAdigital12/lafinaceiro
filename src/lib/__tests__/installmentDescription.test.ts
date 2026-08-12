import { describe, it, expect } from "vitest";
import {
  stripInstallmentMarkers,
  buildInstallmentDescription,
} from "@/lib/installmentDescription";

/**
 * Os casos abaixo são descrições reais de faturas importadas — inclusive as
 * esquisitas, com o marcador colado no texto ("EC *SALLV02/02") e com espaços
 * de preenchimento do banco.
 */
describe("stripInstallmentMarkers", () => {
  it.each([
    ["ZP *ELO7 02/04", "ZP *ELO7"],
    ["MERCADO*MERCADOLIV TORNEIRA LAVABO 3/4", "MERCADO*MERCADOLIV TORNEIRA LAVABO"],
    ["EC *SALLV02/02", "EC *SALLV"],
    ["Airbnb * Hm9pxffnr01/04", "Airbnb * Hm9pxffnr"],
    ["CASAR PRESENTE RENAN *Pre*s01/04", "CASAR PRESENTE RENAN *Pre*s"],
  ])("remove o marcador solto: %s", (entrada, esperado) => {
    expect(stripInstallmentMarkers(entrada)).toBe(esperado);
  });

  it.each([
    ["ELECTROLUX electro lava-louças - Parcela 5/10", "ELECTROLUX electro lava-louças"],
    ["Porta3Acessorios - óculos - Parcela 6/10", "Porta3Acessorios - óculos"],
    [
      "Adiqplu*odontolus o limpeza André e Luísa Parcela 1 de 2",
      "Adiqplu*odontolus o limpeza André e Luísa",
    ],
  ])("remove o marcador escrito por extenso: %s", (entrada, esperado) => {
    expect(stripInstallmentMarkers(entrada)).toBe(esperado);
  });

  describe("preserva o texto depois de ' - ' (M13)", () => {
    it("mantém a observação escrita à mão", () => {
      // A regra antiga (`.replace(/\s+-\s+.*$/, '')`) devolvia
      // "Clinica Progiante Parcela 1 de 3": jogava fora a observação e
      // mantinha o marcador — o oposto do pretendido.
      expect(
        stripInstallmentMarkers("Clinica Progiante Parcela 1 de 3 - Placa bruxismo"),
      ).toBe("Clinica Progiante - Placa bruxismo");
    });

    it("mantém o complemento quando o marcador está no meio", () => {
      expect(stripInstallmentMarkers("AMAZON BR 02/10 - Triturador")).toBe(
        "AMAZON BR - Triturador",
      );
      expect(stripInstallmentMarkers("EVO*GHV Pet Shop  01/02 - exames")).toBe(
        "EVO*GHV Pet Shop - exames",
      );
    });
  });

  it("limpa descrição que já acumulou marcadores de várias operações", () => {
    // Caso real: cada caminho que tocou o grupo colou o seu sufixo.
    expect(
      stripInstallmentMarkers(
        "Clinica Progiante Parcela 1 de 3 - Placa bruxismo 2/3 - Parcela 2/3",
      ),
    ).toBe("Clinica Progiante - Placa bruxismo");
  });

  it("é idempotente — reaplicar não muda mais nada", () => {
    const uma = stripInstallmentMarkers("ZP *ELO7 02/04");
    expect(stripInstallmentMarkers(uma)).toBe(uma);
  });

  it("não confunde data com marcador de parcela", () => {
    expect(stripInstallmentMarkers("Aluguel 01/2026")).toBe("Aluguel 01/2026");
  });

  it("devolve string vazia sem estourar", () => {
    expect(stripInstallmentMarkers("")).toBe("");
  });
});

describe("buildInstallmentDescription", () => {
  it("numera a parcela a partir da descrição limpa", () => {
    expect(buildInstallmentDescription("ZP *ELO7 02/04", 3, 4)).toBe("ZP *ELO7 3/4");
  });

  it("não duplica marcador ao renumerar várias vezes", () => {
    const primeira = buildInstallmentDescription("AMAZON BR 02/10 - Triturador", 2, 10);
    const segunda = buildInstallmentDescription(primeira, 3, 10);

    expect(primeira).toBe("AMAZON BR - Triturador 2/10");
    expect(segunda).toBe("AMAZON BR - Triturador 3/10");
  });
});
