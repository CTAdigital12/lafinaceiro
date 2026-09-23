// supabase/functions/add-member/index.ts
//
// Concede a outra conta acesso de leitura aos dados de quem chama.
//
// EXIGE AAL2. Sem isso esta função é um bypass completo do MFA: ela usa o
// cliente service-role, que ignora RLS — inclusive as 16 policies RESTRICTIVE
// de `aal2` criadas em 20260817120000_require_aal2_on_all_data.sql. Como o
// cadastro é aberto, quem tivesse apenas a SENHA do titular (sessão AAL1, que
// depois do A1 não lê uma única linha) podia chamar este endpoint com o e-mail
// de uma conta própria, ganhar `shared_access` permanente e depois ler tudo
// autenticado como si mesmo, em AAL2. O acesso sobrevive à troca de senha.
//
// É a mesma forma do bypass fechado no PR #65 (`add_shared_access_by_email`):
// service-role + ausência de FORCE RLS + nenhuma checagem de `aal`.
//
// Ao mexer aqui, lembre: `getUser()` NÃO valida `aal`. Ele aceita AAL1.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { readAal } from "../_shared/jwt.ts";
import { findUserByEmail, sameEmail } from "../_shared/findUserByEmail.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.slice("Bearer ".length).trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- AAL2 obrigatório -------------------------------------------------
    // Só depois de `getUser()`, que é quem confere a assinatura. Antes disso o
    // payload não vale nada. Ausência de claim reprova (fail-closed).
    const aal = readAal(jwt);
    if (aal !== "aal2") {
      console.warn(
        `[add-member] tentativa de conceder acesso com aal=${aal ?? "desconhecido"} user=${caller.id}`,
      );
      return new Response(
        JSON.stringify({
          error: "Esta operação exige autenticação em dois fatores. Saia e entre novamente informando o código do aplicativo.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { email, password } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "E-mail é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // `===` deixava "EU@Casa.com" passar pela trava, e o GoTrue não diferencia
    // caixa: o convite cairia sobre a própria conta de quem chamou.
    if (sameEmail(email, caller.email)) {
      return new Response(JSON.stringify({ error: "Você não pode adicionar a si mesmo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // A conta existe? Quem responde é `auth.users`, NÃO `public.profiles`.
    // `profiles` é espelho mantido por gatilho, e em 22/09/2026 apareceu vazia:
    // o convite caía no ramo "criar conta" e o `createUser` falhava porque o
    // e-mail já existia. Ver o cabeçalho de `_shared/findUserByEmail.ts`.
    const lookup = await findUserByEmail(email, async (page, perPage) => {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      return { users: data?.users ?? [], error };
    });

    // "Não consegui olhar" não é "não existe": seguir daqui tentaria criar uma
    // conta que talvez exista, que é exatamente o defeito antigo.
    if (lookup.status === "failed") {
      console.error(`[add-member] busca de conta falhou: ${lookup.reason}`);
      return new Response(
        JSON.stringify({ error: "Não foi possível verificar se esta conta já existe. Tente novamente." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let targetUserId: string;
    let contaCriadaAgora = false;
    // O e-mail como o GoTrue o guarda, não como veio do formulário: é ele que
    // vai para o espelho, se o espelho precisar ser reposto.
    let emailDaConta = email;

    if (lookup.status === "found") {
      targetUserId = lookup.user.id;
      emailDaConta = lookup.user.email ?? email;
    } else {
      // A conta realmente não existe — criar.
      if (!password || password.length < 6) {
        return new Response(JSON.stringify({ error: "Usuário não encontrado. Informe uma senha (mín. 6 caracteres) para criar a conta." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        // Se o GoTrue diz que o e-mail já existe DEPOIS de a busca ter dito que
        // não, a listagem mentiu — e a mensagem precisa dizer isso, senão a
        // investigação começa pelo lugar errado, como começou em 22/09/2026.
        const jaExiste = /already|exist|registered/i.test(createError.message);
        return new Response(
          JSON.stringify({
            error: jaExiste
              ? "Esta conta já existe, mas não apareceu na busca. Tente de novo; se persistir, confira a conta no painel de autenticação."
              : `Erro ao criar usuário: ${createError.message}`,
          }),
          { status: jaExiste ? 409 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      targetUserId = newUser.user.id;
      contaCriadaAgora = true;
    }

    // Repõe o espelho quando ele está faltando. Conta nova não passa por aqui:
    // o gatilho `on_auth_user_created` já cria o perfil. Isto cobre o caso de
    // 22/09/2026 — a conta existe, o perfil sumiu — para o convite não terminar
    // com o membro aparecendo sem nome nem e-mail na lista.
    if (!contaCriadaAgora) {
      const { error: perfilError } = await adminClient
        .from("profiles")
        .upsert(
          { id: targetUserId, email: emailDaConta },
          { onConflict: "id", ignoreDuplicates: true },
        );

      // Falhar aqui não desfaz o convite: o acesso é o que importa, e a lista
      // de membros é o único prejuízo.
      if (perfilError) {
        console.warn(`[add-member] não foi possível repor o perfil de ${targetUserId}: ${perfilError.message}`);
      }
    }

    // Check if shared_access already exists
    const { data: existing } = await adminClient
      .from("shared_access")
      .select("id")
      .eq("owner_id", caller.id)
      .eq("shared_with_user_id", targetUserId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Este usuário já tem acesso" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add shared_access
    const { data: access, error: accessError } = await adminClient
      .from("shared_access")
      .insert({ owner_id: caller.id, shared_with_user_id: targetUserId })
      .select("id")
      .single();

    if (accessError) {
      return new Response(JSON.stringify({ error: accessError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: access.id, created: contaCriadaAgora }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
