
# Relatório Detalhado: Despesas vs Fatura Paga

## Objetivo

Criar um novo componente que exiba um relatório detalhado comparando:
- Total de despesas registradas no sistema
- Valor total pago ao banco
- Identificação precisa de onde está a diferença de R$ 282,06

## Arquivos a Criar

### 1. `src/components/credit-cards/InvoiceDiscrepancyReport.tsx`

Novo componente que mostrará:

**Seção 1: Resumo Geral**
```
┌─────────────────────────────────────────────────────────────┐
│  COMPARATIVO: DESPESAS vs PAGAMENTOS                        │
├─────────────────────────────────────────────────────────────┤
│  Despesas Brutas (sistema)       R$ 40.552,51   (141 trans) │
│  Estornos (deduzidos)           -R$    100,79   (16 trans)  │
│  ═══════════════════════════════════════════════════════════│
│  Total Líquido (sistema)         R$ 40.451,72               │
│                                                              │
│  Pagamentos Realizados                                       │
│    → Corporativo                 R$ 28.586,73               │
│    → Pessoal                     R$ 12.147,05               │
│  ───────────────────────────────────────────────────────────│
│  Total Pagamentos                R$ 40.733,78               │
│                                                              │
│  DIFERENÇA (Pagamentos - Sistema)  R$ 282,06  ⚠️            │
└─────────────────────────────────────────────────────────────┘
```

**Seção 2: Análise por Categoria (Empresa vs Pessoal)**
```
┌─────────────────────────────────────────────────────────────┐
│  DETALHAMENTO                   DESPESAS    PAGTO    DIFF   │
├─────────────────────────────────────────────────────────────┤
│  Corporativo                                                 │
│    Despesas brutas              R$ 28.680,63                │
│    Estornos corporativos        R$     0,00                 │
│    Líquido corporativo          R$ 28.680,63                │
│    Pagamento empresa           -R$ 28.586,73                │
│    → Diferença                              -R$ 93,90  ✓    │
│                                                              │
│  Pessoal                                                     │
│    Despesas brutas              R$ 11.871,88                │
│    Estornos pessoais           -R$    100,79                │
│    Líquido pessoal              R$ 11.771,09                │
│    Pagamento pessoal           -R$ 12.147,05                │
│    → Diferença                             +R$ 375,96  ⚠️   │
│                                                              │
│  SOMA DAS DIFERENÇAS                        +R$ 282,06      │
└─────────────────────────────────────────────────────────────┘
```

**Seção 3: Investigação da Diferença**

Listar as possíveis causas:
- Transações faltando no sistema
- Transações marcadas com categoria errada (pessoal/corporativo)
- Pagamentos registrados com valor incorreto

**Seção 4: Lista de Transações Detalhada**

Tabela expansível com:
- Data | Descrição | Categoria | Valor | Origem (Importada/Manual) | Tipo (Pessoal/Corporativo)
- Filtros por tipo, origem, e busca por texto
- Ordenação por valor para encontrar discrepâncias

**Seção 5: Lista de Pagamentos**

Tabela mostrando todos os pagamentos (`is_card_payment = true`):
- Data | Descrição | Valor | Tipo (Pessoal/Corporativo)

## Arquivos a Modificar

### 2. `src/components/credit-cards/ReconciliationDetailModal.tsx`

Adicionar uma nova aba "Relatório de Divergência" que mostrará o componente `InvoiceDiscrepancyReport`.

### 3. `src/hooks/useCreditCardReconciliation.ts`

Adicionar campos extras ao retorno:
- `grossExpenses` (despesas brutas, sem deduzir estornos)
- `corporateGross` / `personalGross` (despesas brutas por tipo)
- `paymentsByType` (pagamentos separados por pessoal/corporativo)

## Fluxo de Uso

1. Usuário acessa **Cartões de Crédito**
2. Clica no cartão na seção **Conciliação de Faturas**
3. No modal, vai para a aba **"Relatório de Divergência"**
4. Visualiza a análise completa e pode:
   - Expandir seções para ver transações
   - Filtrar/buscar transações específicas
   - Exportar relatório em CSV

## Detalhes Técnicos

O componente usará os dados já disponíveis do hook `useCreditCardReconciliation`, adicionando cálculos extras para:

```typescript
// Calcular totais brutos (antes de deduzir estornos)
const grossExpenses = transactions
  .filter(t => !t.is_refund && !t.is_card_payment && t.status === 'completed')
  .reduce((sum, t) => sum + Number(t.amount), 0);

// Separar pagamentos por tipo
const corporatePayments = transactions
  .filter(t => t.is_card_payment && t.is_corporate_expense)
  .reduce((sum, t) => sum + Number(t.amount), 0);

const personalPayments = transactions
  .filter(t => t.is_card_payment && !t.is_corporate_expense)
  .reduce((sum, t) => sum + Number(t.amount), 0);
```

## Resultado Esperado

Após implementação, você poderá:

1. **Ver exatamente** onde está a diferença de R$ 282,06
2. **Identificar** que o pagamento pessoal (R$ 12.147,05) está R$ 375,96 maior que as despesas pessoais líquidas
3. **Entender** que você cobriu R$ 93,90 de despesas corporativas
4. **Investigar** se há transações mal categorizadas ou faltando

| Análise | Despesas | Pagamentos | Diferença |
|---------|----------|------------|-----------|
| Corporativo | R$ 28.680,63 | R$ 28.586,73 | -R$ 93,90 |
| Pessoal | R$ 11.771,09 | R$ 12.147,05 | +R$ 375,96 |
| **Total** | R$ 40.451,72 | R$ 40.733,78 | **+R$ 282,06** |

A diferença mostra que você pagou R$ 282,06 a mais do que as despesas registradas no sistema, sugerindo que há transações faltando ou valores incorretos.
