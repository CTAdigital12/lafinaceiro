# AGENTS.md — La Financeiro

> Instruções para qualquer agente (Claude Code, Codex, Gemini CLI ou similar) neste repositório.
> `CLAUDE.md` importa este arquivo.
>
> **Este arquivo não substitui nada que já existia.** Precedência, da mais alta para a mais baixa:
> regras de segurança (`SECURITY_RULES.md` do usuário, `docs/security.md`) → [AI_CONTEXT.md](AI_CONTEXT.md)
> (fonte de verdade técnica: schema, regras de negócio, padrões) → este arquivo → memória técnica
> (`.ai/memory/`, `.claude-squad/lessons.md`), que é **evidência histórica**, não regra.

## 1. Antes de começar

- Leia as seções relevantes de [AI_CONTEXT.md](AI_CONTEXT.md), principalmente §3 (regras de negócio críticas)
  e §14 (armadilhas), antes de mexer em transações, faturas, parcelamentos ou investimentos.
- Antes de investigar um bug ou mudar arquitetura, consulte a memória técnica:
  - [.ai/memory/INDEX.md](.ai/memory/INDEX.md): decisões, soluções e problemas conhecidos deste projeto;
  - [.claude-squad/lessons.md](.claude-squad/lessons.md): lições L1–L7 de produção (migração, Supabase, Vercel);
  - `../organization-knowledge/INDEX.md`, quando clonado ao lado: soluções de outros projetos (`ORG-NNNN`).
- Trate registros como **hipótese a verificar**, não como garantia do estado atual: confira código, versões e testes.

## 2. Ao terminar uma tarefa

- Rode o procedimento [.ai/skills/close-task/SKILL.md](.ai/skills/close-task/SKILL.md) (Claude Code: `/close-task`;
  outros agentes: "execute `.ai/skills/close-task/SKILL.md`"). Ele propõe registros em `.ai/memory/` no mesmo PR,
  ou declara `no-memory-change`. Nunca crie registro vago só para ter registro.
- Se o `check-staleness` do PR avisar sobre um registro, revise-o ou acrescente o trailer
  `Memory-Reviewed: <ID> <motivo>`. Mudança sem memória: `No-Memory-Change: <motivo>`.
- Uma tarefa não está validada só porque o agente disse que está: mostre os comandos e os resultados.

## 3. O que nunca entra na memória

Transcrições de chat, segredos, tokens, `.env`, dados de transações reais (valores, estabelecimentos,
contas, extratos), dados pessoais e qualquer conteúdo de `.claude/backups/`. A memória vai para o Git e para o PR.

## 4. Convenções do repositório (observadas no histórico)

- Branches `fix/…`, `feat/…`, `chore/…`; commits `tipo(escopo): descrição` em português; tudo entra por PR em `main`.
- O pre-commit roda o gitleaks. **Nunca** use `--no-verify`.
- Os gates do CI bloqueiam: `npm test` (vitest), `npm run typecheck` e `npm run lint`, todos com baseline zero.
- Memória: `npm run memory:check` antes de pedir commit, quando mexer em `.ai/memory/`; `npm run memory:test`
  quando mexer em `scripts/dev-memory/`. Guia completo: [.ai/README.md](.ai/README.md).
