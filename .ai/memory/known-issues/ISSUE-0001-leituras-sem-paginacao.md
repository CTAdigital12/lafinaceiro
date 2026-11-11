---
id: ISSUE-0001
type: known-issue
title: Leituras de transactions sem paginação que somam ou comparam o conjunto (latentes, não observadas)
status: open
created_at: 2026-11-11
reviewed_at: null
owner: André Domingues
symptom: "Quando o recorte passar de 1000 linhas, a leitura volta truncada sem erro (ver SOL-0001)"
affected_versions: ["main em 7aa1414"]
files:
  - src/hooks/useCategorizationRules.ts
  - src/hooks/useCreditCards.ts
  - src/hooks/usePendingInstallments.ts
  - src/hooks/useProjects.ts
  - src/components/accounts/AccountReconciliationModal.tsx
  - src/hooks/useCreditCardReconciliation.ts
deps:
  - name: "@supabase/supabase-js"
    version: "^2"
related_issues: []
review_required: false
---

## Sintoma
Nenhum observado até agora. É o mesmo mecanismo da [SOL-0001](../solutions/SOL-0001-postgrest-trunca-em-1000-sem-erro.md):
uma leitura sem `.range()` cujo recorte passe do teto do PostgREST (1000) volta cortada, com status 200, e o
resultado fica plausível, mas errado.

## Impacto
Triagem de 2026-11-11, feita lendo o código, das 22 leituras de `transactions` sem `.range()`/`fetchAllRows` e
sem filtro estreito na sintaxe (uma era falso positivo: `useTransactions` pagina de propósito, para a tela):

| Risco | Leitura | Por quê |
|---|---|---|
| **Alto** | `useCategorizationRules.ts:153` (prévia) | Todas as transações sem categoria, sem período; a contagem da prévia sai menor |
| **Alto** | `useCategorizationRules.ts:209` (aplicar regras) | Mesma leitura, mas **grava**: com mais de 1000, categoriza só as primeiras e dá como concluído |
| Médio | `useCreditCards.ts:351` | Soma de **todas** as parcelas pendentes por cartão, sem período |
| Médio | `usePendingInstallments.ts:48` | Lista de **todas** as parcelas pendentes de cartão, sem período |
| Médio | `useProjects.ts:41` | Soma de **todos** os lançamentos vinculados a qualquer projeto (gasto do projeto) |
| A avaliar | `AccountReconciliationModal.tsx:108` | Limitada à janela do extrato, mas **compara** com o banco; o risco cresce com extratos longos |
| A avaliar | `useCreditCardReconciliation.ts:101` | Todos os cartões num período, e **compara** totais com a fatura |

As outras 14 são estreitas pela lógica (um cartão num mês, um grupo de parcelas ou de divisão, uma janela de
datas) e ficam como estão, conforme "Quando NÃO reutilizar" da SOL-0001.

## Workaround
Nenhum necessário enquanto o volume de cada recorte ficar abaixo de 1000. O volume de produção **não foi medido**
nesta triagem (sem acesso ao banco). Antes de priorizar, vale contar as linhas reais de cada recorte.

## Causa (se conhecida)
Confirmada para o mecanismo (SOL-0001). Para estas leituras, o efeito é **latente**: não foi reproduzido com
dados reais.

**Cuidado ao corrigir `useCategorizationRules.ts:209`:** a consulta filtra por `category_id is null`, e o laço
categoriza essas mesmas linhas. Paginar lendo e gravando ao mesmo tempo desloca as páginas e pula linhas. Leia
tudo primeiro com `fetchAllRows` e grave depois.

## Critério de resolução
Cada leitura de risco alto ou médio passa a usar `fetchAllRows` com ordem estável, ou recebe um recorte estreito
justificado, com teste que imita o teto (modelo: `useCreditCardInvoiceSync.paginacao.test.tsx`) e que falha sem a
correção. As duas "a avaliar" são resolvidas com a mesma correção ou com uma justificativa registrada aqui. Quando
todas estiverem resolvidas, `status: resolved`.

## Evidências
- Busca por `.from("transactions")` + `.select(` sem `.range()`/`fetchAllRows` e sem `.single()`/`.limit()`/filtro por
  `id` em `src/` (excluindo testes): 22 resultados em `7aa1414`, cada um lido e classificado em 2026-11-11. A mesma
  busca em `c1f055e` dá 25: os 3 a mais são justamente as leituras que o PR #143 paginou ou removeu, o que indica que
  ela pega o padrão. **Limite:** consultas montadas em várias instruções (cliente em variável, `.from()` dinâmico)
  escapam dela.
- Mecanismo e correção de referência: SOL-0001 (aprovada) e ORG-0005 no `organization-knowledge`.
