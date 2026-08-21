// Shared JWT claim helpers for edge functions.
//
// Extraído de mfa-recovery-generate e mfa-recovery-verify, que carregavam
// cópias idênticas desta função. O defeito recorrente deste repositório é a
// mesma regra escrita em vários lugares com uma cópia incompleta — e uma
// checagem de `aal` é justamente o tipo de regra que não pode divergir entre
// dois arquivos.

// Decodifica o payload do JWT SEM verificar assinatura.
//
// Só chame DEPOIS de `getUser()`/`verify_jwt` terem validado a assinatura: o
// uso aqui é extrair a claim `aal`, que o `getUser()` não expõe.
//
// É fail-closed de propósito — devolve `null` em qualquer erro de parse, o que
// faz `requireAal2` reprovar.
//
// TODO(post-MVP): trocar por `supabase.auth.getClaims()` quando o Edge Runtime
// expuser essa API nativamente (hoje só existe no SDK do cliente).
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    // base64url -> base64
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Lê a claim `aal` do JWT já validado. Devolve `null` quando ausente ou
// malformada — nunca presume `aal2`.
export function readAal(jwt: string): string | null {
  const claims = decodeJwtPayload(jwt);
  return typeof claims?.aal === "string" ? claims.aal : null;
}
