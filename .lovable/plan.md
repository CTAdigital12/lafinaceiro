

# Conciliação inteligente de transações provisórias (recorrências)

## Problema

Quando uma recorrência gera uma transação provisória (ex: "Seguro Apartamento 1/4") e o pagamento real aparece no OFX com descrição diferente (ex: "SEGURO PORTO SEG"), o sistema trata ambas como itens distintos. Resultado: o OFX pareia com a transação real e a provisória fica órfã na aba "Apenas Sistema", duplicando o valor.

## Solução em duas frentes

### 1. Auto-detecção: Provisórias entram no matching com prioridade

**Arquivo:** `src/components/accounts/AccountReconciliationModal.tsx`

- Adicionar `is_provisional` e `recurring_rule_id` ao `SELECT` de `fetchSystemTransactions`

**Arquivo:** `src/lib/spreadsheetReconciliation.ts`

- Expandir `SystemTransaction` com `is_provisional?: boolean`
- No Pass 1 (date+amount match), quando há múltiplos candidatos, dar **prioridade a transações provisórias** no tiebreaker (se uma provisória tem boa similaridade, ela deve ser preferida sobre uma transação real, pois o objetivo é "consumir" a provisória com o dado real)

### 2. Ação manual: "Conciliar" provisória com item do banco

Quando uma provisória aparece na aba "Apenas Sistema" e existe um item na aba "Apenas Banco" que corresponde a ela (mesmo que com valor/data/descrição diferentes), o usuário precisa poder vinculá-los manualmente.

**Arquivo:** `src/components/accounts/AccountReconciliationModal.tsx`

- Na aba "Apenas Sistema", para transações provisórias, adicionar um botão **"Conciliar"** (além de "Excluir")
- Ao clicar em "Conciliar", abrir um mini-seletor mostrando os itens da aba "Apenas Banco" para o usuário escolher qual corresponde
- Ao confirmar: atualizar a transação provisória com os dados do item do banco (amount, description via `original_description`, `status: "completed"`, `is_provisional: false`) e re-rodar a reconciliação
- Transações provisórias na tabela terão um badge visual "Provisória" para fácil identificação

### 3. Identificação visual

- Na tabela de resultados, exibir um badge "Provisória" ao lado da descrição de transações com `is_provisional === true`
- Isso ajuda o usuário a entender rapidamente quais itens são previsões e podem ser conciliados/excluídos sem perda de dados reais

### Resumo de arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/lib/spreadsheetReconciliation.ts` | Adicionar `is_provisional` ao tipo `SystemTransaction`; priorizar provisórias no tiebreaker |
| `src/components/accounts/AccountReconciliationModal.tsx` | Buscar `is_provisional`; botão "Conciliar" para provisórias; badge visual; mini-seletor de itens do banco |

