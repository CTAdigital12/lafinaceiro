# Projeto: La Financeiro

App de gestão financeira pessoal e familiar: transações, cartões de crédito e faturas, contas bancárias,
orçamentos, investimentos e acesso compartilhado entre membros da família.

- **Fonte de verdade técnica:** [AI_CONTEXT.md](../../AI_CONTEXT.md) (schema, regras de negócio, fórmulas,
  padrões de segurança, código e mobile). Esta memória **não** repete o que está lá.
- **Lições de produção anteriores ao Dev Memory:** [.claude-squad/lessons.md](../../.claude-squad/lessons.md) (L1–L7).

## Stack (conforme README.md e package.json)
Vite + React 18 + TypeScript strict, Tailwind + shadcn/ui, TanStack React Query v5, React Router v6,
React Hook Form + Zod, Supabase (PostgreSQL, Auth, Storage, Edge Functions em Deno), OCR com Gemini via
Edge Function `parse-invoice`, PWA. Node do `.nvmrc` (24). Testes com vitest.

## Fluxo
PR para `main`. A Vercel faz preview em PRs e produção no merge. O CI (`ci.yml`) bloqueia por testes,
typecheck e lint, todos com baseline zero. O pre-commit roda o gitleaks.

## Limites da memória neste projeto
- Nunca registrar dados de transações reais, extratos, valores, estabelecimentos ou contas, nem nada de
  `.claude/backups/`.
- Registros descrevem **diagnósticos, decisões e correções**, com evidência de PR, commit ou teste.
