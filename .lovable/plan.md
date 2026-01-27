
## Plano: Upload CSV para Fatura de Cartão + Página de Atividades

### Resumo

Implementar duas novas funcionalidades:
1. **Upload de CSV para Fatura de Cartão de Crédito** - Adicionar suporte a CSV no InvoiceImportModal
2. **Página de Atividades** - Nova página para visualizar e desfazer uploads/importações

---

## Parte 1: Upload de CSV como Fatura de Cartão de Crédito

### Situação Atual

- O `InvoiceImportModal` já suporta PDF, Excel e imagens
- Existe um parser CSV em `src/lib/csvParser.ts` usado apenas para extratos de conta
- O parser atual é básico, sem suporte a detecção de parcelas ou campos específicos de fatura

### Alterações Necessárias

#### 1.1 Estender o Parser CSV (`src/lib/csvParser.ts`)

Adicionar suporte para faturas de cartão de crédito:

| Funcionalidade | Descrição |
|----------------|-----------|
| Detecção de Parcelas | Regex para padrões como "3/10", "PARC 03/10" |
| Campos Específicos | Suporte a colunas: estabelecimento, data compra, valor |
| Formatos Brasileiros | Valores como "1.234,56" e datas "DD/MM/YYYY" |
| Inferência de Ano | Lógica similar ao parse-invoice para datas sem ano |

```text
Interface CSVInvoiceTransaction (nova):
┌────────────────────────────────────────┐
│ date: string (YYYY-MM-DD)              │
│ description: string                    │
│ amount: number                         │
│ installment_current?: number           │
│ installment_total?: number             │
└────────────────────────────────────────┘
```

#### 1.2 Atualizar InvoiceImportModal (`src/components/modals/InvoiceImportModal.tsx`)

| Alteração | Descrição |
|-----------|-----------|
| Aceitar CSV | Adicionar ".csv" na lista de extensões aceitas |
| Processar Localmente | Para CSV, usar parser local sem chamar edge function |
| Gerar Estrutura | Converter para formato `ImportedItem` compatível com ReviewModal |
| Parcelas Futuras | Gerar parcelas futuras igual ao fluxo PDF |

#### 1.3 Fluxo de Processamento

```text
CSV Upload Flow:
┌──────────────────┐     ┌────────────────────┐     ┌─────────────────────┐
│ Selecionar CSV   │────▶│ Parse Local (novo) │────▶│ InvoiceReviewModal  │
│ + Mês/Ano Fatura │     │ • Detectar colunas │     │ • Categorizar       │
└──────────────────┘     │ • Inferir ano      │     │ • Parcelas futuras  │
                         │ • Detectar parcelas│     │ • Salvar no DB      │
                         └────────────────────┘     └─────────────────────┘
```

---

## Parte 2: Página de Atividades com Desfazer

### Situação Atual

- Transações importadas já possuem campo `imported_at` (timestamp do upload)
- Todas as transações de um mesmo upload compartilham o mesmo `imported_at`
- Não existe página de atividades nem funcionalidade de desfazer

### Alterações Necessárias

#### 2.1 Nova Página de Atividades (`src/pages/Activities.tsx`)

| Funcionalidade | Descrição |
|----------------|-----------|
| Lista de Atividades | Agrupar transações por `imported_at` |
| Informações | Mostrar: tipo, quantidade, valor total, data/hora |
| Ação Desfazer | Deletar todas as transações do lote |
| Confirmação | Dialog de confirmação antes de deletar |

```text
┌──────────────────────────────────────────────────────────────────┐
│                     📋 Atividades                                │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 📥 Importação de Fatura - Nubank                             │ │
│ │ 27/01/2026 às 14:32                                          │ │
│ │ 45 transações • R$ 3.450,00 • Cartão de Crédito              │ │
│ │                                           [🗑️ Desfazer]      │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 📥 Importação de Extrato - Conta Corrente                    │ │
│ │ 25/01/2026 às 10:15                                          │ │
│ │ 23 transações • R$ 8.200,00 • Conta Bancária                 │ │
│ │                                           [🗑️ Desfazer]      │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

#### 2.2 Hook de Atividades (`src/hooks/useActivities.ts`)

```typescript
// Estrutura do hook
interface Activity {
  imported_at: string;
  transaction_count: number;
  total_amount: number;
  source_type: "credit_card" | "account";
  source_name: string;
  first_date: string;
  last_date: string;
}

// Funções:
// - useActivities(): lista atividades agrupadas por imported_at
// - undoActivity(imported_at): deleta todas as transações do lote
```

#### 2.3 Atualizar Navegação

| Arquivo | Alteração |
|---------|-----------|
| `src/components/layout/AppSidebar.tsx` | Adicionar item "Atividades" |
| `src/components/layout/BottomNav.tsx` | Adicionar ícone no menu mobile |
| `src/App.tsx` | Adicionar rota `/activities` |

#### 2.4 Funcionalidade de Desfazer

```sql
-- Query para deletar um lote de importação
DELETE FROM transactions 
WHERE imported_at = '2026-01-27T14:32:00.000Z' 
AND user_id = auth.uid();
```

**Importante:** O campo `imported_at` já está sendo populado corretamente em:
- `InvoiceReviewModal` para faturas de cartão
- `AccountReviewModal` para extratos de conta

---

## Resumo de Arquivos

| Arquivo | Ação |
|---------|------|
| `src/lib/csvParser.ts` | Modificar - adicionar suporte a faturas |
| `src/components/modals/InvoiceImportModal.tsx` | Modificar - aceitar/processar CSV |
| `src/pages/Activities.tsx` | Criar - nova página |
| `src/hooks/useActivities.ts` | Criar - hook para atividades |
| `src/components/layout/AppSidebar.tsx` | Modificar - adicionar navegação |
| `src/components/layout/BottomNav.tsx` | Modificar - adicionar navegação mobile |
| `src/App.tsx` | Modificar - adicionar rota |

---

## Considerações Técnicas

### CSV Parser Melhorado

O parser precisa lidar com:
- **Delimitadores**: Auto-detectar `;`, `,`, `\t`
- **Aspas**: Campos com `"texto, com vírgula"`
- **Formatos Numéricos**: `1.234,56` (BR) vs `1,234.56` (US)
- **Headers Dinâmicos**: Detectar colunas por nome

### Segurança

- RLS já protege operações de DELETE na tabela transactions
- Apenas o dono pode ver/deletar suas próprias atividades
- Validação `user_id = auth.uid()` em todas as queries

### Performance

- Query de atividades usa GROUP BY `imported_at` com índice existente
- Limite de 50 atividades mais recentes por padrão
- Paginação para histórico extenso

