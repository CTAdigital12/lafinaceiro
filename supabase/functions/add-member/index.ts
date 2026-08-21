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

    if (email === caller.email) {
      return new Response(JSON.stringify({ error: "Você não pode adicionar a si mesmo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if user exists in profiles
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let targetUserId: string;

    if (profile) {
      targetUserId = profile.id;
    } else {
      // User doesn't exist — create account
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
        return new Response(JSON.stringify({ error: `Erro ao criar usuário: ${createError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetUserId = newUser.user.id;
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

    return new Response(JSON.stringify({ success: true, id: access.id, created: !profile }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
