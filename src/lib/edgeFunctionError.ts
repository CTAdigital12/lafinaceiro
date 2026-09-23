/**
 * O texto de erro de uma edge function, para mostrar na tela.
 *
 * As respostas de erro do `parse-invoice` têm DUAS formas, e os dois modais de
 * importação liam só uma (`data.error`):
 *
 *   { error: "Acesso não autorizado" }                    // frase
 *   { error: "feature_disabled", message: "Parse de …" }  // código + frase
 *
 * Na segunda forma a tela mostrava o CÓDIGO e jogava fora a frase escrita para
 * a pessoa. Não é hipótese: com o kill-switch da IA desligado, a tela dizia
 * "feature_disabled"; com o Gemini devolvendo JSON inválido, "invalid_ai_output".
 *
 * Aqui a frase vem primeiro. Quando só existe código, ele entra entre
 * parênteses depois do texto de reserva — é o que permite citá-lo ao procurar
 * nos logs, sem virar a mensagem principal.
 */

// Códigos são snake_case ASCII; qualquer coisa com espaço ou acento é frase.
const CODIGO = /^[a-z0-9]+(_[a-z0-9]+)*$/;

export function edgeFunctionErrorMessage(data: unknown, fallback: string): string {
  const corpo = (data ?? {}) as { error?: unknown; message?: unknown };

  const message = typeof corpo.message === "string" ? corpo.message.trim() : "";
  if (message) return message;

  const error = typeof corpo.error === "string" ? corpo.error.trim() : "";
  if (!error) return fallback;

  return CODIGO.test(error) ? `${fallback} (${error})` : error;
}
