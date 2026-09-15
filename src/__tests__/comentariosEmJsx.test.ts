import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Comentário `//` dentro de JSX não é comentário: é TEXTO, e o React o
 * renderiza na tela. Em 14/09/2026 três linhas explicando um `as const`
 * apareceram para o usuário no meio das duas telas de conciliação, em
 * produção. Nem o `tsc`, nem o `eslint`, nem o build pegam — para o
 * compilador aquilo é um nó de texto perfeitamente válido.
 *
 * A forma correta é envolver o texto numa expressão JSX de comentário.
 */

/**
 * Heurística conservadora: uma linha `//` está dentro de JSX quando a linha
 * de CÓDIGO anterior termina em `>` ou `}` e a próxima começa em `<` ou `{`.
 *
 * "Linha de código" pula os outros comentários do mesmo bloco — o vazamento
 * real tinha TRÊS linhas seguidas, e olhar só a linha imediatamente vizinha
 * fazia a varredura não enxergar nenhuma delas.
 *
 * Prefere deixar passar a acusar código legítimo: ignora `=>`, que termina em
 * `>` sem nada ter de JSX.
 */
export function comentariosVazandoEmJsx(codigo: string): number[] {
  const linhas = codigo.split("\n");
  const eComentario = (l: string) => l.trim().startsWith("//");
  const achados: number[] = [];

  linhas.forEach((linha, i) => {
    if (!eComentario(linha)) return;

    const codigoAntes = [...linhas.slice(0, i)].reverse().find((l) => l.trim() && !eComentario(l))?.trim() ?? "";
    const codigoDepois = linhas.slice(i + 1).find((l) => l.trim() && !eComentario(l))?.trim() ?? "";

    if (codigoAntes.endsWith("=>")) return;
    if (!/[>}]$/.test(codigoAntes)) return;
    if (!/^[<{]/.test(codigoDepois)) return;

    achados.push(i + 1);
  });

  return achados;
}

function arquivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTsx(caminho);
    return caminho.endsWith(".tsx") ? [caminho] : [];
  });
}

describe("comentário // dentro de JSX vira texto na tela", () => {
  it("reconhece o comentário que vazou nas telas de conciliação", () => {
    // Três linhas seguidas, como no caso real: cada uma tem outro comentário
    // por vizinho, e é isso que a primeira versão desta varredura não via.
    const codigo = [
      '<ScrollArea className="mt-3">',
      "  // `as const` faz `tab` ser a união que `filter` espera, em vez de",
      "  // `string` — o cast `as any` que estava aqui também",
      "  // engoliria um valor escrito errado no array.",
      '  {items.map((tab) => (',
      "    <TabsContent key={tab} />",
      "  ))}",
      "</ScrollArea>",
    ].join("\n");

    expect(comentariosVazandoEmJsx(codigo)).toEqual([2, 3, 4]);
  });

  it("não acusa comentário em código comum", () => {
    const codigo = [
      "const total = somar(a, b);",
      "// soma antes de formatar",
      "const texto = formatar(total);",
    ].join("\n");

    expect(comentariosVazandoEmJsx(codigo)).toEqual([]);
  });

  it("não acusa comentário logo depois de uma arrow function", () => {
    const codigo = [
      "const render = () =>",
      "  // devolve o rótulo já traduzido",
      "  <span>{rotulo}</span>",
    ].join("\n");

    expect(comentariosVazandoEmJsx(codigo)).toEqual([]);
  });

  it("nenhum componente do projeto renderiza um comentário", () => {
    const vazando = arquivosTsx("src")
      .map((arquivo) => ({ arquivo, linhas: comentariosVazandoEmJsx(readFileSync(arquivo, "utf8")) }))
      .filter(({ linhas }) => linhas.length > 0)
      .map(({ arquivo, linhas }) => `${arquivo}:${linhas.join(",")}`);

    expect(vazando).toEqual([]);
  });
});
