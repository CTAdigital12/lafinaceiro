---
id: ADR-0002
type: decision
title: Conhecimento novo vai para .ai/memory via close-task; lessons.md fica como fonte de leitura
status: proposed
created_at: 2026-11-09
reviewed_at: null
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
O `.claude-squad/lessons.md` já é uma memória compartilhada, com 7 lições de produção (L1–L7) e o ritual
"leia antes, escreva no fim". O Dev Memory tem o mesmo propósito, com schema, validação, índice e detecção
de obsolescência. Dois lugares onde escrever geram duplicação e dúvida sobre qual consultar.

## Decisão
- **Lições novas** vão para `.ai/memory/` (SOL, ADR ou ISSUE) pelo `close-task`, com status e evidência.
- O **`lessons.md` não é apagado nem alterado**: continua sendo leitura obrigatória (o `AGENTS.md` aponta para ele),
  e L1–L7 permanecem válidas como estão.
- Migrar L1–L7 para registros estruturados **não** faz parte desta decisão. Se for feito, cada lição vira um
  registro com evidência própria (commit/PR já citados nela), em PR separado.

## Alternativas consideradas
- **Continuar escrevendo nos dois:** duplicação e divergência sem alarme.
- **Migrar L1–L7 agora:** mais trabalho e risco de perder contexto na conversão, num PR que deveria só
  instalar o kit.
- **Manter só o `lessons.md`:** perde validação, índice, detecção de obsolescência e o check no PR.

## Consequências
- (+) Um único destino para conhecimento novo, validado no CI.
- (−) Durante a transição, conhecimento antigo e novo ficam em formatos diferentes.
- (−) A seção "Como atualizar este arquivo" do `lessons.md` fica desatualizada. Corrigir isso exige editar o
  arquivo, o que esta decisão deliberadamente não faz sem aprovação.

## Evidências
- `.claude-squad/lessons.md`: L1–L7 e a seção "Como atualizar este arquivo" (formato livre, sem validação).

## Revisão / obsolescência
Revisar quando a equipe decidir migrar L1–L7 ou se o `lessons.md` voltar a receber entradas novas.
