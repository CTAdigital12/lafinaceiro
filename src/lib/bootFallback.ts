/**
 * Transforma uma falha de inicialização em algo LEGÍVEL na tela.
 *
 * Achado M10: sem isto, qualquer erro no carregamento dos módulos do App
 * — variável de ambiente faltando, chunk que não baixou, import quebrado —
 * deixava a página BRANCA E MUDA. Acontece antes de o React montar, então
 * nenhum ErrorBoundary alcança; só o console dizia o motivo, e apenas para
 * quem soubesse abri-lo.
 *
 * Escrito em DOM puro de propósito: neste ponto não dá para supor que o React
 * carregou. Mora em `src/lib` (convenção do repositório) para ser testável sem
 * subir o aplicativo.
 */
export function mostrarFalhaDeBoot(erro: unknown, raiz: HTMLElement | null): void {
  console.error("[boot] o aplicativo não iniciou:", erro);

  if (!raiz) return;

  const detalhe = erro instanceof Error ? erro.message : String(erro);

  const caixa = document.createElement("div");
  caixa.setAttribute("role", "alert");
  caixa.dataset.testid = "falha-de-boot";
  caixa.style.cssText =
    "max-width:34rem;margin:15vh auto 0;padding:1.5rem;font-family:system-ui,sans-serif;" +
    "line-height:1.5;color:#1f2937;background:#fff;border:1px solid #e5e7eb;border-radius:.75rem";

  const titulo = document.createElement("h1");
  titulo.textContent = "Não foi possível iniciar o aplicativo";
  titulo.style.cssText = "margin:0 0 .75rem;font-size:1.25rem";

  const texto = document.createElement("p");
  texto.textContent = detalhe;
  texto.style.cssText = "margin:0 0 1rem;color:#4b5563";

  const dica = document.createElement("p");
  dica.textContent =
    "Recarregue a página. Se continuar, o problema é de configuração do ambiente, não dos seus dados — nada foi perdido.";
  dica.style.cssText = "margin:0;font-size:.875rem;color:#6b7280";

  caixa.append(titulo, texto, dica);
  // `replaceChildren` e não `append`: se o App chegou a pintar meia tela antes
  // de quebrar, o que fica é a mensagem, não um híbrido confuso.
  raiz.replaceChildren(caixa);
}
