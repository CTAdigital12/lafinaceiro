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

/**
 * A mensagem de erro de uma chamada a `supabase.functions.invoke`, lida do
 * CORPO da resposta. Devolve `null` quando não houve erro.
 *
 * Motivo de existir: para qualquer status fora do 2xx, o `functions-js` devolve
 * `{ data: null, error: FunctionsHttpError }`, e a `message` desse erro é
 * sempre a mesma frase — **"Edge Function returned a non-2xx status code"**. O
 * corpo, onde está o texto escrito para a pessoa, fica guardado à parte (em
 * `response`, ou em `error.context` nas versões mais antigas).
 *
 * Quem faz `throw new Error(res.error.message)` mostra a frase genérica e joga
 * fora o recado. No `add-member` isso engolia TODOS os avisos que importam:
 * "Esta operação exige autenticação em dois fatores", "Usuário não encontrado.
 * Informe uma senha", "Você não pode adicionar a si mesmo", "Este usuário já
 * tem acesso". A pessoa via só "non-2xx status code" e não tinha o que fazer.
 */
const MENSAGEM_GENERICA = "Edge Function returned a non-2xx status code";

export interface InvokeResult {
  data?: unknown;
  error?: unknown;
  response?: { json?: () => Promise<unknown> } | null;
}

export async function edgeFunctionInvokeError(
  res: InvokeResult,
  fallback: string,
): Promise<string | null> {
  if (res.error) {
    const erro = res.error as { message?: unknown; context?: unknown };
    const corpo = await lerCorpo(res.response ?? erro.context);

    if (corpo !== null) return edgeFunctionErrorMessage(corpo, fallback);

    // Sem corpo legível: a `message` do FunctionsHttpError não acrescenta nada,
    // mas a de um erro de rede (FunctionsFetchError) sim.
    const message = typeof erro.message === "string" ? erro.message.trim() : "";
    return message && message !== MENSAGEM_GENERICA ? message : fallback;
  }

  // Função que responde 200 com `{ error: ... }` no corpo — forma que o
  // `parse-invoice` também usa.
  const data = res.data as { error?: unknown } | null | undefined;
  if (data && typeof data === "object" && data.error) {
    return edgeFunctionErrorMessage(data, fallback);
  }

  return null;
}

async function lerCorpo(fonte: unknown): Promise<unknown | null> {
  const resposta = fonte as { json?: () => Promise<unknown> } | null | undefined;
  if (!resposta || typeof resposta.json !== "function") return null;

  try {
    return await resposta.json();
  } catch {
    // Corpo vazio, já consumido ou que não é JSON.
    return null;
  }
}
