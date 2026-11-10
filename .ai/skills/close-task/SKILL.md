---
name: close-task
description: Encerramento de tarefa do Dev Memory. Examina o diff real e decide se a tarefa gerou conhecimento durável (decisão, solução, problema conhecido, mudança de estado). Propõe registros em .ai/memory/ para revisão no PR, ou declara no-memory-change. Nunca publica transcrições, nunca faz commit, push ou merge.
---

# close-task — encerramento de tarefa

Procedimento canônico, válido para qualquer agente (Claude Code, Codex, Gemini CLI).
Os atalhos de cada ferramenta (`.claude/skills/`, `.gemini/commands/`) apenas apontam para este arquivo.

## Limites (não negociáveis)

- **Fonte de verdade = Git**, não a conversa. O histórico de chat não é prova de nada.
- **Nunca** copie trechos de chat, segredos, tokens, `.env`, credenciais ou dados pessoais para a memória.
- **Nunca** faça `git commit`, `git push`, merge ou publique em `organization-knowledge`. Você **propõe**; o humano revisa.
- **Nunca** invente causa raiz, resultado de teste, PR ou commit. Sem evidência → escreva "não verificado".
- Prefira **nenhum registro** a um registro vago. `no-memory-change` é um resultado válido e frequente.

## Entradas

Colete, sem pedir ao usuário o que puder obter sozinho:

1. Objetivo da tarefa: pedido do usuário, em uma frase.
2. Estado do Git:
   ```bash
   git branch --show-current
   git status --short
   git diff --stat HEAD            # mudanças não commitadas
   git log --oneline <base>..HEAD  # commits da branch (base = main ou a branch de origem)
   git diff <base>...HEAD --stat
   ```
3. Testes e validações **efetivamente executados** nesta tarefa, com o resultado. Se nenhum foi executado, registre isso.
4. Memória existente: `.ai/memory/INDEX.md`, `CURRENT_STATE.md` e os registros relacionados aos arquivos alterados:
   ```bash
   grep -rl "<caminho-alterado>" .ai/memory/
   ```

## Procedimento

### 1. Classifique o que a tarefa produziu

Responda a cada pergunta com **sim/não + evidência (arquivo, commit, comando)**:

| Pergunta | Se sim |
|---|---|
| Houve escolha técnica com alternativas e trade-offs que outra pessoa precisaria conhecer? | ADR (`.ai/templates/adr.md`) |
| Houve bug ou falha diagnosticada, com **causa raiz confirmada** e correção validada? | SOL (`.ai/templates/solution.md`) |
| Ficou um problema sem solução, com workaround ou risco conhecido? | ISSUE (`.ai/templates/known-issue.md`) |
| Mudou o que está verificado, em andamento, bloqueado ou decidido no projeto? | Atualizar `CURRENT_STATE.md` |
| Um registro existente ficou incorreto ou desatualizado por causa desta tarefa? | Atualizar, ou marcar `superseded` |

**Não gera memória:** typo, formatação, renomeação trivial, bump de dependência sem impacto, refactor
sem decisão, tentativa abandonada sem aprendizado, qualquer coisa que o diff e a mensagem de commit
já expliquem sozinhos.

### 2. Se nada se qualifica

Pare aqui e responda com a saída padrão, usando `Memórias propostas: 0` e o motivo em uma linha
(`no-memory-change: <motivo>`). **Não crie arquivo.**

### 3. Se algo se qualifica

1. **Procure duplicatas antes de criar:** busque no `INDEX.md` e por `grep` (título, tags, arquivos).
   Se já existe registro sobre o mesmo assunto, **atualize-o** ou crie um novo com `supersedes: [ID]`,
   e marque o antigo como `status: superseded`. Nunca duplique em silêncio.
2. **Próximo ID livre** do tipo:
   ```bash
   ls .ai/memory/decisions/ .ai/memory/solutions/ .ai/memory/known-issues/
   ```
3. **Copie o template** e preencha todas as seções com fatos verificáveis:
   - `files:` são os caminhos reais que o registro descreve (existem no diff ou no repositório).
   - `status`: ADR nasce `proposed`, salvo decisão já aprovada explicitamente pelo responsável.
     SOL nasce `proposed`; vira `verified` só com validação executada e registrada.
   - SOL sem causa raiz comprovada: `status: proposed`, `confidence: low`, e a seção
     "Causa raiz confirmada" diz explicitamente que não foi confirmada.
   - Erro exato: copie a mensagem **sanitizada**. Se não houver mensagem, declare.
4. **Regenere o índice** com `node scripts/dev-memory/cli.mjs build-index` (nunca edite `INDEX.md` à mão)
   e, se aplicável, atualize `CURRENT_STATE.md`.

### 4. Valide antes de entregar

```bash
node scripts/dev-memory/cli.mjs validate          # schema, IDs, files:, seções, segredos, links
node scripts/dev-memory/cli.mjs build-index --check
node scripts/dev-memory/cli.mjs check-staleness --base main   # registros afetados pelo diff
```

Todos os erros do `validate` precisam ser corrigidos. Cada aviso do `check-staleness` precisa ser resolvido de
uma destas formas: revisar o registro no mesmo PR; acrescentar a um commit o trailer
`Memory-Reviewed: <ID> <motivo>`; ou, se a tarefa não gerou memória, usar `No-Memory-Change: <motivo>`.
O detector de segredos não substitui revisão humana. Confira também se há nomes de clientes,
domínios internos ou dados pessoais.

### 5. Entregue a saída padrão

Mostre o resumo abaixo. Os arquivos de memória entram **no mesmo PR da tarefa**, para revisão humana.
**Não faça commit**: siga a regra de autorização do `AGENTS.md`.

### 6. Promoção organizacional (opcional)

Só sugira promover para `organization-knowledge` quando a solução for **genérica** (vale para outros
sistemas), estiver `verified`/`approved` com `confidence` medium/high e puder ser **sanitizada** sem
perder sentido. Liste o que precisaria ser removido ou generalizado. A promoção é uma **reescrita** a partir de
`../organization-knowledge/templates/solution.md`, sem `files:`, nomes de projeto/cliente ou caminhos,
feita em PR próprio daquele repositório (ver o README dele). Não escreva lá sem pedido explícito.

Se a tarefa **reaproveitou** uma solução organizacional (`ORG-NNNN`), cite-a na saída. Se o reuso revelou
um caso não coberto, proponha a atualização da `ORG-NNNN`.

## Saída padrão

```text
Memórias propostas: N            (0 → no-memory-change: <motivo>)
Arquivos alterados: [...]
Evidências: [PRs / commits / testes executados e resultados]
Itens que exigem revisão: [...]
Possíveis soluções reutilizáveis: [...]   (candidatas a organization-knowledge, ou "nenhuma")
Soluções reaproveitadas: [...]            (reused_solution_ids: ORG-NNNN, ou "nenhuma")
Resultado dos validadores: [...]
```
