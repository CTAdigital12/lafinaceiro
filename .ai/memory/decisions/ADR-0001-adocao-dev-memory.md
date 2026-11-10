---
id: ADR-0001
type: decision
title: Adoção do Dev Memory com .claude/skills versionado e hook de lembrete só local
status: approved
created_at: 2026-11-09
reviewed_at: 2026-11-09
owner: André Domingues
scope: project
files:
  - .gitignore
deps: []
related_prs: []
supersedes: []
review_required: false
---

## Contexto
O projeto tem um fluxo intenso de correções via PR (ex.: #131 a #138), mas o aprendizado de cada diagnóstico
fica espalhado em mensagens de commit e conversas privadas. O kit Dev Memory (repositório `gestor-de-ia`)
oferece memória versionada em `.ai/memory/`, validada no CI.

Duas particularidades daqui:
1. O `.gitignore` ignorava `.claude/` inteiro, porque `.claude/backups/` guarda dumps de transações reais.
2. O `.claude/settings.json` é **pessoal** (permissões com caminhos da máquina de quem desenvolve) e não é versionado.

## Decisão
- Instalar o kit sem alterar código da aplicação: `.ai/`, `scripts/dev-memory/`, `AGENTS.md`, `CLAUDE.md`
  (que importa o `AGENTS.md`), scripts `memory:*` no `package.json` e o workflow `dev-memory.yml`, separado do `ci.yml`.
- `.gitignore`: trocar `.claude/` por `.claude/*` + `!.claude/skills/`, versionando só o atalho `/close-task`.
  `backups/`, `settings.json` e `settings.local.json` continuam ignorados, o que foi confirmado com `git check-ignore`.
- Hook `Stop` (lembrete de `/close-task`): **só local**, em `.claude/settings.local.json` de cada pessoa. Ele não
  é versionado. A cobertura para todos é o `check-staleness` no PR.

## Alternativas consideradas
- **Não mexer no `.gitignore`:** sem o atalho `/close-task` versionado. O procedimento continuaria
  acessível pelo caminho, mas com menos uso na prática.
- **Versionar `.claude/settings.json` com o hook:** exporia permissões pessoais e caminhos de máquina.
- **Integrar os checks ao `ci.yml`:** mistura responsabilidades e arrisca o gate de testes, typecheck e lint, que tem baseline zero.

## Consequências
- (+) Memória revisada em PR, sem impacto no build, nos testes (o vitest só inclui `src/` e `supabase/functions/`)
  ou no lint da aplicação.
- (+) O CI da memória roda isolado, sem `npm ci`.
- (−) O lembrete automático depende de cada pessoa ativar o hook localmente.
- (−) A exceção no `.gitignore` exige cuidado: `.claude/skills/` nunca pode receber dados.

## Evidências
- Verificação do `.gitignore` num repositório isolado e no próprio projeto: só `.claude/skills/` passa a ser versionável.
- Kit copiado de `gestor-de-ia@5e6688d` (branch `fix/kit-portavel`), byte a byte idêntico.
- Resultados de testes, lint, typecheck e CI: ver `CURRENT_STATE.md` e o PR da instalação.

## Revisão / obsolescência
Revisar se `.claude/skills/` passar a conter algo além de atalhos de procedimento, se o `settings.json` do
projeto passar a ser compartilhado (aí o hook pode ser versionado) ou se o kit mudar o formato dos atalhos.
