---
id: ADR-0002
type: decision
title: Conhecimento novo vai para .ai/memory via close-task; lessons.md congelado como registro da migração
status: approved
created_at: 2026-11-09
reviewed_at: 2026-11-09
owner: André Domingues
scope: project
files:
  - .claude-squad/lessons.md
deps: []
related_prs: []
supersedes: []
review_required: false
---

## Contexto
O `.claude-squad/lessons.md` tem 7 lições de produção (L1–L7) e o ritual "leia antes, escreva no fim".
O Dev Memory tem o mesmo propósito, com schema, validação, índice e detecção de obsolescência. Dois lugares
para escrever geram duplicação e instruções conflitantes: o `AGENTS.md` manda o conhecimento novo para
`.ai/memory/`, enquanto o `lessons.md` pede para escrever nele.

Na prática, as 7 lições vêm todas da migração Lovable → Supabase próprio (abril de 2026). O arquivo foi
criado num único commit (`1128478`, 28/04/2026) e nunca mais mudou, apesar de 86 PRs mergeados desde então.
O ritual de escrita não pegou.

## Decisão
- **Lições novas** vão para `.ai/memory/` (SOL, ADR ou ISSUE) pelo `close-task`, com status e evidência.
- O **`lessons.md` fica congelado** como registro da migração: ganha uma nota no topo e na seção "Como atualizar
  este arquivo" apontando para `.ai/memory/`. **Nenhuma lição é apagada ou reescrita**; L1–L7 continuam válidas e
  de leitura recomendada (o `AGENTS.md` aponta para elas).
- **Não migrar L1–L7 para registros SOL do projeto:** a migração terminou, e o custo da conversão não se paga.
  As lições **genéricas** (aplicáveis a outros projetos) podem ser promovidas ao `organization-knowledge`, desde que
  reproduzidas antes. É o caminho para L1, L4 e, se reproduzível, L2.

## Alternativas consideradas
- **Continuar escrevendo nos dois:** duplicação e divergência sem alarme.
- **Manter só o `lessons.md`:** perde validação, índice, detecção de obsolescência e o gatilho do `close-task`,
  justamente o que faltou para o ritual funcionar.
- **Migrar L1–L7 para SOL do projeto:** muito trabalho para conhecimento de um evento já concluído.
- **Não editar o `lessons.md` (versão anterior desta decisão):** deixaria duas instruções conflitantes ativas.

## Consequências
- (+) Um único destino para conhecimento novo, validado no CI, e sem instruções conflitantes.
- (+) O registro da migração continua íntegro e consultável.
- (−) Conhecimento antigo (texto livre) e novo (registros) ficam em formatos diferentes.

## Evidências
- `git log -- .claude-squad/lessons.md`: um único commit (`1128478`, 28/04/2026), sem alterações posteriores.
- Origens citadas nas lições: commits `ed4875f`, `2f611a9`, `bad4d7f`, `76c9e4b`, `002ae88`, `1e222c3` e o PR #1,
  todos da migração.
- Aprovada pelo responsável em 2026-11-09.

## Revisão / obsolescência
Revisar se houver nova migração de dados (L1–L6 voltariam a ser operacionais) ou se o `lessons.md` voltar a
receber entradas novas.
