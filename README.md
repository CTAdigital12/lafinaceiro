# La Financeiro

App de gestão financeira pessoal e familiar — controle de transações, cartões de crédito, contas bancárias, orçamentos, investimentos e acesso compartilhado entre membros da família.

Construído com Vite + React 18 + TypeScript, shadcn/ui sobre Tailwind, e Supabase como backend (PostgreSQL + Auth + Edge Functions).

## Stack

- **Build / runtime:** Vite 5, React 18, TypeScript strict
- **UI:** Tailwind CSS, shadcn/ui (Radix primitives), Lucide icons
- **Estado server:** TanStack React Query v5
- **Roteamento:** React Router v6
- **Forms:** React Hook Form + Zod
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **OCR / IA:** Google Gemini 2.5 Pro (via Edge Function `parse-invoice`)
- **PWA:** `vite-plugin-pwa`
- **Integração bancária:** Pluggy Connect

## Setup local

Pré-requisitos: [Bun](https://bun.sh) (recomendado) ou Node.js 20+.

```sh
# 1. Instala dependências
bun install

# 2. Copia o template de variáveis de ambiente
cp .env.example .env

# 3. Preenche o .env com as chaves do projeto Supabase
#    (ver seção "Env vars necessárias" abaixo)

# 4. Sobe o dev server (porta 8080)
bun dev
```

> O arquivo `.env.example` será adicionado na próxima fase da migração. Por enquanto, peça as variáveis para um maintainer.

## Env vars necessárias

Todas as variáveis prefixadas com `VITE_` são expostas ao bundle do frontend. Use somente chaves públicas (`anon` / `publishable`) — chaves de serviço (`service_role`) jamais entram no frontend.

- `VITE_SUPABASE_URL` — URL do projeto Supabase
- `VITE_SUPABASE_PUBLISHABLE_KEY` — chave pública anônima (anon / publishable)
- `VITE_SUPABASE_PROJECT_ID` — ID do projeto Supabase

## Deploy

Deploy via PR para `main`. Vercel faz auto-deploy de preview em PRs e produção em merges para `main`.

## Estrutura

Para detalhes sobre schema do banco, hooks, fluxos de usuário, regras de negócio e padrões mobile, consulte [`AI_CONTEXT.md`](./AI_CONTEXT.md) — fonte de verdade técnica do projeto.
