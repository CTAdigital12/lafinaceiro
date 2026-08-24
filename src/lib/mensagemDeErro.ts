/**
 * Texto de erro para mostrar ao usuário, a partir de um `catch`.
 *
 * O parâmetro de um `catch` é `unknown` — nada garante que seja um `Error`.
 * Antes disto os chamadores anotavam `catch (e: any)` e liam `e.message`
 * direto: quando o que era lançado NÃO fosse um Error (uma string, por
 * exemplo), a tela mostrava `undefined`.
 *
 * NÃO confundir com `getSafeErrorMessage` de `errorHandler.ts`. Aquele
 * SUBSTITUI a mensagem por um texto genérico de catálogo, de propósito, para
 * não vazar detalhe interno em fluxo de autenticação. Este aqui PRESERVA a
 * mensagem — é para os pontos onde ela já é escrita para o usuário final e
 * carrega informação que ele precisa, como "Este usuário já tem acesso" ou
 * "Esta operação exige autenticação em dois fatores". Trocar um pelo outro
 * apaga justamente o que a pessoa precisa ler.
 */
export function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Erro ao processar solicitação";
}
