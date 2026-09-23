// Procura uma conta por e-mail em `auth.users`, que é a FONTE DA VERDADE sobre
// a existência de uma conta.
//
// O `add-member` procurava em `public.profiles`. Em 22/09/2026 essa tabela
// apareceu VAZIA (causa nunca confirmada, ver a migration
// 20260922200000_repor_perfis_a_partir_de_auth_users.sql) e o convite quebrou:
// ninguém era encontrado, a função caía no ramo "criar conta", e o `createUser`
// falhava porque o e-mail já existia em `auth.users` — devolvendo
// "Erro ao criar usuário", que não aponta para a causa. `profiles` é um espelho
// mantido por gatilho; espelho quebrado não pode decidir se uma conta existe.
//
// FAIL-CLOSED, como o `readAal` de `jwt.ts`: "não consegui olhar" é um estado
// PRÓPRIO, nunca "não existe". Confundir os dois devolve exatamente o defeito
// original — tentar criar uma conta que já existe.

export interface AuthUserLike {
  id: string;
  email?: string | null;
}

export interface UserPage {
  users: AuthUserLike[];
  error?: unknown;
}

/** Uma página da listagem administrativa de usuários (1-based, como o GoTrue). */
export type ListUsersPage = (page: number, perPage: number) => Promise<UserPage>;

export type UserLookup =
  | { status: "found"; user: AuthUserLike }
  | { status: "not_found" }
  | { status: "failed"; reason: string };

export const DEFAULT_PER_PAGE = 200;

/**
 * Teto de páginas. Existe para o laço não ficar preso numa listagem que sempre
 * devolve página cheia; estourá-lo é `failed`, não `not_found`.
 */
export const DEFAULT_MAX_PAGES = 25;

/** Compara e-mail do jeito que o GoTrue trata: sem espaços nas pontas e sem caixa. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function findUserByEmail(
  email: string,
  listUsersPage: ListUsersPage,
  options: { perPage?: number; maxPages?: number } = {},
): Promise<UserLookup> {
  const alvo = email?.trim();
  if (!alvo) return { status: "failed", reason: "e-mail vazio" };

  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  for (let page = 1; page <= maxPages; page++) {
    let resultado: UserPage;
    try {
      resultado = await listUsersPage(page, perPage);
    } catch (err) {
      return { status: "failed", reason: err instanceof Error ? err.message : "listagem falhou" };
    }

    if (resultado.error) {
      const reason = resultado.error instanceof Error ? resultado.error.message : "listagem falhou";
      return { status: "failed", reason };
    }

    const encontrado = resultado.users.find((u) => sameEmail(u.email, alvo));
    if (encontrado) return { status: "found", user: encontrado };

    // Página incompleta é a última: aí sim a conta não existe.
    if (resultado.users.length < perPage) return { status: "not_found" };
  }

  return { status: "failed", reason: `mais de ${maxPages} páginas de usuários sem encontrar o e-mail` };
}
