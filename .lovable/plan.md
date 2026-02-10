

# Correção: Parcelas não reconhecidas na importação de fatura

## Problema

O regex de detecção de parcelas usa `\b` (word boundary) que **não funciona** quando os números estão colados em letras:

- `electro04/10` -- entre `o` e `0` não há word boundary (ambos são `\w`)
- `COMER03/03` -- entre `R` e `0`, mesmo problema
- `E01/06` -- entre `E` e `0`, mesmo problema

O `\b` só detecta transição entre caractere alfanumérico e não-alfanumérico (espaço, pontuação, etc). Como letra e dígito são ambos alfanuméricos, o padrão falha silenciosamente.

## Solução

Substituir o primeiro padrão regex para não depender de `\b` antes dos dígitos. Usar um lookbehind ou simplesmente capturar os dígitos no final da string seguidos de `/`:

```typescript
const patterns = [
  /(\d{1,2})\s*\/\s*(\d{1,2})\s*$/,              // 04/10 no final da string
  /(\d{1,2})\s*\/\s*(\d{1,2})(?:\s|$|\))/,        // 04/10 seguido de espaço ou fim
  /\bPARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i,
  /\((\d{1,2})\s*\/\s*(\d{1,2})\)/,
  /\b(\d{1,2})\s*DE\s*(\d{1,2})\b/i,
];
```

A estratégia principal e mais segura: procurar o padrão `DD/DD` **no final da descrição** (com `$`), pois nas faturas de cartão o padrão de parcela quase sempre aparece no final. Isso evita falsos positivos com datas no meio da string.

Adicionalmente, aplicar a mesma correção no `extractInstallmentInfo` do edge function `migrate-installments` que tem o mesmo problema com `\b`.

## Arquivo a modificar

| Arquivo | Mudança |
|---------|---------|
| `src/lib/csvInvoiceParser.ts` | Atualizar os padrões regex na função `detectInstallments` para capturar parcelas coladas em texto |

## Mudança específica

### `src/lib/csvInvoiceParser.ts` - função `detectInstallments` (linhas 92-110)

Substituir os padrões por versões que funcionam sem word boundary:

```typescript
function detectInstallments(description: string): { current: number; total: number } | null {
  const patterns = [
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*$/,                    // 04/10 no final da string
    /(\d{1,2})\s*\/\s*(\d{1,2})(?=\s|\)|$)/,              // 04/10 seguido de espaço, ) ou fim
    /(?:^|[^\/\d])(\d{1,2})\s*\/\s*(\d{1,2})(?:[^\/\d]|$)/,  // DD/DD não precedido/seguido por / ou dígito
    /\bPARC(?:ELA)?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i,
    /\((\d{1,2})\s*\/\s*(\d{1,2})\)/,
    /\b(\d{1,2})\s*DE\s*(\d{1,2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      // Encontrar os grupos de captura corretos (pular grupos não-capturantes)
      const groups = match.filter((_, i) => i > 0 && match[i] !== undefined);
      const current = parseInt(groups[0], 10);
      const total = parseInt(groups[1], 10);
      if (current > 0 && total > 0 && current <= total && total <= 99) {
        return { current, total };
      }
    }
  }

  return null;
}
```

### Exemplos de validação

| Descrição | Regex atual | Regex corrigido |
|-----------|------------|-----------------|
| `ELECTROLUX electro04/10` | Nao detecta | 04/10 |
| `AMAZONMKTPLC*COMER03/03` | Nao detecta | 03/03 |
| `TURQUEZA TECIDOS E01/06` | Nao detecta | 01/06 |
| `Compra 3/10` | Detecta | Detecta |
| `PARC 5/12` | Detecta | Detecta |

## Seção Técnica

**Causa raiz**: O metacaractere `\b` em regex define uma transição entre `\w` (letras, dígitos, underscore) e `\W` (tudo o resto). Como tanto letras quanto dígitos são `\w`, não há boundary entre `o` e `0` em `electro04`. O regex simplesmente não encontra match.

**Risco de falso positivo**: Ao remover `\b`, poderíamos capturar datas (ex: `15/01/2025` capturaria `15/01`). A mitigação é priorizar matches no **final da string** e validar que `current <= total`.

