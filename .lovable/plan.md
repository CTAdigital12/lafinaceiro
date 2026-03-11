

# Fix: Conciliação com tiebreaker por descrição

## Problema

O `reconcileSpreadsheet` faz matching greedy por data+valor. Quando há múltiplas transações na mesma data com o mesmo valor (ex: dois PIX de R$500 em 23/02), ele pode parear o item OFX com a transação errada do sistema, deixando a transação correta como "apenas no sistema".

No screenshot: 100 conciliados, 0 apenas banco, 3 apenas sistema — todos os itens OFX foram consumidos, mas 3 transações do sistema ficaram órfãs porque foram "roubadas" por outros itens OFX de mesma data/valor.

## Solução

Adicionar **similaridade de descrição como tiebreaker** no Pass 1 do `reconcileSpreadsheet`. Em vez de pegar o primeiro match por data+valor, coletar todos os candidatos e escolher o que tem descrição mais similar.

### Arquivo: `src/lib/spreadsheetReconciliation.ts`

**Pass 1 modificado:**
1. Para cada item do spreadsheet, coletar TODOS os candidatos do sistema com mesma data+valor (dentro da tolerância)
2. Se houver múltiplos candidatos, calcular similaridade de descrição (normalizada) entre o item e cada candidato, usando `original_description` quando disponível
3. Escolher o candidato com maior similaridade
4. Se houver apenas 1 candidato, usar diretamente (sem overhead)

**Nova função auxiliar:** `descriptionSimilarity(a: string, b: string): number`
- Normaliza ambas as strings (lowercase, remove acentos, colapsa espaços)
- Calcula overlap de palavras (Jaccard index simples)
- Retorna 0-1

### Impacto
- Sem mudanças na interface ou no modal
- A lógica é genérica, beneficia também a conciliação de cartões de crédito
- Sem regressão: quando há apenas 1 candidato, o comportamento é idêntico ao atual

