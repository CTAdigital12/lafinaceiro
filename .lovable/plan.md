

# Fix: CSV parsing no modulo de conciliacao por planilha

## Problema

O `parseSpreadsheetFile` usa `XLSX.read()` para parsear CSV, mas essa biblioteca nao detecta corretamente o delimitador `;` usado em CSVs brasileiros de bancos. Resultado: todas as colunas ficam concatenadas em uma so, a deteccao de data/descricao/valor falha, e nenhum item passa o filtro.

## Solucao

Tratar CSVs separadamente do XLSX. Para arquivos `.csv`, usar parsing manual com auto-deteccao de delimitador (`;`, `,`, `\t`), como ja e feito em `csvParser.ts` e `csvInvoiceParser.ts`. Manter o `XLSX.read()` apenas para arquivos `.xlsx`/`.xls`.

## Mudancas

### `src/lib/spreadsheetReconciliation.ts`

1. Adicionar funcao `detectDelimiter(line)` - conta ocorrencias de `;`, `,`, `\t` e escolhe o mais frequente
2. Adicionar funcao `parseCSVLine(line, delimiter)` - respeita aspas
3. No `parseSpreadsheetFile`, verificar extensao do arquivo:
   - Se `.csv`: ler como texto (`file.text()`), detectar delimitador, parsear manualmente linha a linha
   - Se `.xlsx`/`.xls`: manter o `XLSX.read()` atual
4. Tratar encoding: ler o CSV com fallback para Latin-1 caso UTF-8 produza caracteres invalidos

A logica de deteccao de colunas (datePatterns, descPatterns, amountPatterns) e as funcoes `parseDate`/`parseAmount` permanecem inalteradas.

