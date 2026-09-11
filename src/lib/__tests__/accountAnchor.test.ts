import { describe, it, expect } from "vitest";
import { computedBalance, anchorInitialBalance } from "@/lib/accountAnchor";

/**
 * Esta é a rede que faltava antes de mexer no cadastro de conta.
 *
 * O saldo de uma conta é reancorado à mão de tempos em tempos (a Itaú
 * Personnalité já foi duas vezes, em jun e ago/2026), e um erro aqui não
 * aparece como tela quebrada: aparece como saldo errado semanas depois. Nada
 * prendia esse comportamento — a leitura morava no `useAccounts`, a escrita no
 * `handleSubmit` do modal, e nenhum teste tocava nos dois.
 *
 * O invariante que todos os casos abaixo cobram é o mesmo: gravar a âncora que
 * a função de escrita devolve tem que fazer a função de leitura mostrar
 * exatamente o valor digitado.
 */
const reancorar = (saldoDesejado: number, txNet: number) =>
  computedBalance(anchorInitialBalance(saldoDesejado, txNet), txNet);

describe("a volta: reancorar mostra o valor digitado", () => {
  it("conta nova, sem lançamento nenhum", () => {
    // txNet 0 não é um caso separado: é o mesmo cálculo com histórico vazio.
    expect(anchorInitialBalance(1000, 0)).toBe(1000);
    expect(reancorar(1000, 0)).toBe(1000);
  });

  it("conta no vermelho depois dos lançamentos", () => {
    expect(reancorar(-250, -3000)).toBe(-250);
  });

  it("saldo zerado com histórico grande", () => {
    expect(reancorar(0, 12345.67)).toBe(0);
  });

  it("o caso real da Itaú: saldo digitado acima do que os lançamentos dão", () => {
    // Números medidos em 11/09/2026: a conta exibia 4.289,86 de saldo real.
    const txNet = -1471.27;
    expect(reancorar(4289.86, txNet)).toBeCloseTo(4289.86, 2);
  });

  it("vale para qualquer combinação, inclusive centavos que não fecham em binário", () => {
    const casos: Array<[number, number]> = [
      [0.1, 0.2],
      [1933.07, -845.99],
      [5761.13, -1471.27],
      [100000, 99999.99],
      [-0.01, 0.03],
    ];

    for (const [saldo, txNet] of casos) {
      expect(reancorar(saldo, txNet)).toBeCloseTo(saldo, 2);
    }
  });
});

describe("editar a conta SEM mexer no campo de saldo não move a âncora", () => {
  it("o campo vem preenchido com o saldo exibido, então a âncora sai igual à que entrou", () => {
    // É o que acontece ao trocar só o nome ou o ícone: o formulário devolve o
    // mesmo `computed_balance` que carregou.
    const ancoraOriginal = 2000;
    const txNet = -734.51;
    const saldoExibido = computedBalance(ancoraOriginal, txNet);

    expect(anchorInitialBalance(saldoExibido, txNet)).toBeCloseTo(ancoraOriginal, 2);
  });

  it("continua valendo com histórico positivo", () => {
    const ancoraOriginal = -500;
    const txNet = 9800.45;
    const saldoExibido = computedBalance(ancoraOriginal, txNet);

    expect(anchorInitialBalance(saldoExibido, txNet)).toBeCloseTo(ancoraOriginal, 2);
  });
});

describe("reancorar de verdade: digitar um saldo NOVO", () => {
  it("a diferença digitada vira diferença na âncora, não no histórico", () => {
    const txNet = -1471.27;
    const ancoraAntes = anchorInitialBalance(4289.86, txNet);

    // O extrato do banco diz 4.500,00; a pessoa corrige o campo.
    const ancoraDepois = anchorInitialBalance(4500, txNet);

    expect(ancoraDepois - ancoraAntes).toBeCloseTo(210.14, 2);
    expect(computedBalance(ancoraDepois, txNet)).toBeCloseTo(4500, 2);
  });

  it("o histórico de lançamentos não é tocado pela reancoragem", () => {
    // Mesmo txNet dos dois lados: reancorar mexe só no ponto de partida.
    const txNet = 3000;
    expect(computedBalance(anchorInitialBalance(10, txNet), txNet)).toBe(10);
    expect(computedBalance(anchorInitialBalance(999, txNet), txNet)).toBe(999);
  });
});

describe("bordas que o formulário realmente produz", () => {
  it("campo de saldo vazio conta como zero", () => {
    // `balance` é `number | undefined` no modal; vazio vira `?? 0` antes daqui,
    // mas a função não pode explodir se o undefined escapar.
    expect(anchorInitialBalance(undefined as unknown as number, 500)).toBe(-500);
    expect(computedBalance(undefined as unknown as number, 500)).toBe(500);
  });

  it("conta sem lançamento nenhum: txNet ausente é o mesmo que zero", () => {
    expect(computedBalance(750, undefined as unknown as number)).toBe(750);
    expect(anchorInitialBalance(750, undefined as unknown as number)).toBe(750);
  });
});
