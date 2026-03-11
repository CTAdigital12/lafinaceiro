

# Corrigir Saldo da Conta Corrente

## Problema Identificado

O saldo do sistema (-442,84) diverge do banco (69,15) por dois motivos:

1. **Parcelas pendentes contabilizadas no saldo**: As 4 parcelas do "Seguro Apartamento" (4 × 231,02 = 924,08) foram criadas como pendentes. Embora o `createTransaction` não atualize o saldo diretamente, o lançamento do OFX "SISDEB PORTO SEGURO" (mesmo valor, mesma data) foi importado como lançamento separado e subtraiu do saldo, duplicando o efeito.

2. **Drift acumulado**: O saldo incremental depende de todas as importações anteriores terem sido perfeitas. Qualquer lançamento manual que não passou pelo `AccountReviewModal` não atualiza o saldo, causando divergência.

## Solucao (3 partes)

### 1. Extrair saldo do OFX (BALAMT)

**Arquivo: `src/lib/ofxParser.ts`**

Criar nova interface `OFXParseResult` e funcao `parseOFXWithBalance` que retorna `{ transactions, balance }`. Extrair o valor de `<BALAMT>` dentro de `<LEDGERBAL>`.

### 2. Mostrar saldo do banco e permitir sincronizacao

**Arquivo: `src/components/modals/AccountImportModal.tsx`**

- Alterar `onImportComplete` para aceitar `bankBalance?: number` como segundo parametro
- Ao processar OFX, extrair o saldo e passar junto

**Arquivo: `src/pages/Accounts.tsx`**

- Adaptar state para receber `bankBalance` do callback

**Arquivo: `src/components/modals/AccountReviewModal.tsx`**

- Receber prop `bankBalance?: number`
- Apos importar, se `bankBalance` existe:
  - Mostrar banner: "Saldo do banco: R$ 69,15 | Saldo do sistema: R$ -442,84"
  - Botao "Sincronizar saldo" que define `current_balance = bankBalance`
  - Botao "Manter saldo atual" que ignora
- Se nao tem bankBalance (CSV/PDF), manter comportamento atual (incremental)

### 3. Converter previstos em realizados durante importacao

**Arquivo: `src/components/modals/AccountReviewModal.tsx`**

Na inicializacao dos `reviewItems`, alem de checar duplicatas por descricao, checar se existe uma transacao pendente na mesma conta com mesma data e mesmo valor (tolerancia 0.05). Se sim:

- Marcar o item como "match de previsto" (novo flag `matchedPendingId`)
- Na UI, mostrar badge "Previsto encontrado" com descricao do previsto
- Ao importar, em vez de criar nova transacao, fazer UPDATE na pendente: `status: 'completed'`, `description: item.description`, `original_description: item.original_description`
- NAO contar no `balanceChange` (pois o previsto ja estava no sistema, mas sem impacto no saldo armazenado — o update para completed tambem nao altera saldo diretamente, porem se usarmos o bankBalance do OFX isso se resolve automaticamente)

### Secao Tecnica

```text
Fluxo de importacao OFX atualizado:

OFX File
  ├─ parseOFXWithBalance()
  │    ├─ transactions[] (como antes)
  │    └─ balance: 69.15 (de <BALAMT>)
  │
  ├─ AccountImportModal
  │    └─ onImportComplete(items, bankBalance=69.15)
  │
  └─ AccountReviewModal
       ├─ Detectar duplicatas (como antes)
       ├─ Detectar matches de previstos (date + amount)
       ├─ Importar:
       │    ├─ Novos → createTransaction
       │    ├─ Previstos → updateTransaction (completed)
       │    └─ Duplicatas → skip
       └─ Saldo:
            └─ Mostrar comparacao banco vs sistema
                 ├─ "Sincronizar" → set current_balance = 69.15
                 └─ "Manter" → incremental (como antes)
```

### Arquivos alterados

1. `src/lib/ofxParser.ts` — nova funcao `parseOFXWithBalance`
2. `src/components/modals/AccountImportModal.tsx` — passar bankBalance
3. `src/pages/Accounts.tsx` — receber e repassar bankBalance
4. `src/components/modals/AccountReviewModal.tsx` — matching de previstos, UI de sincronizacao de saldo

