import { supabase } from "@/integrations/supabase/client";

/**
 * Cabeçalhos autenticados para chamar uma edge function via `fetch`.
 *
 * O resto do app usa `supabase.functions.invoke`, que anexa o JWT da sessão
 * sozinho. Os dois pontos que sobem ARQUIVO montam o `fetch` na mão — e ambos
 * mandavam `VITE_SUPABASE_PUBLISHABLE_KEY` no `Authorization`. A chave
 * publicável não é um JWT de usuário: `parse-invoice` chama `getClaims()` nela,
 * não acha claims e devolve "Sessão inválida ou expirada". Resultado: importar
 * fatura ou extrato por PDF/imagem nunca funcionava; só o caminho de planilha,
 * que é todo local, funcionava.
 *
 * `apikey` continua sendo a chave publicável (é o que o gateway espera);
 * `Authorization` passa a ser o token da sessão, que é o que a função valida.
 *
 * Lança quando não há sessão: melhor falhar aqui, com mensagem clara, do que
 * mandar `Bearer undefined` e receber um 401 genérico.
 */
export async function edgeFunctionAuthHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    throw new Error("Sessão expirada. Entre novamente para importar o arquivo.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}
