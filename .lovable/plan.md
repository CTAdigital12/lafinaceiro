
# Correção: Conciliação de Faturas - Modal Desaparecendo e Botões Invisíveis

## Diagnóstico

### Problema 1: Modal desaparece ao mudar de mês

**Causa raiz**: O estado `selectedCardForAction` é definido como um objeto `CardReconciliation` que vem do array `reconciliation.cards`. Quando o usuário muda de mês:

1. O hook `useCreditCardReconciliation` dispara um refetch
2. Novos objetos `CardReconciliation` são criados
3. O React re-renderiza o componente
4. A condição `{selectedCardForAction && ...}` pode falhar brevemente durante a transição
5. O modal é desmontado

**Problema adicional**: Os modais são renderizados condicionalmente com `{selectedCardForAction && <Modal ...>}`. Quando `selectedCardForAction` muda para `null` durante a transição, os modais desaparecem.

### Problema 2: Botões de fechar/abrir não aparecem

Analisando o código em `ReconciliationCard.tsx` (linhas 294-314), os botões **estão sendo renderizados**:

```tsx
{isClosed ? (
  <Button onClick={() => handleReopenInvoice(card)}>
    <Unlock /> Reabrir
  </Button>
) : (
  <Button onClick={() => handleCloseInvoice(card)}>
    <Lock /> Fechar Fatura
  </Button>
)}
```

**Possível causa**: O layout flexível pode estar escondendo os botões em telas menores, ou os botões estão sendo renderizados mas não visíveis devido ao espaço disponível.

---

## Solucao Proposta

### Correcao 1: Preservar estado do modal durante mudanca de periodo

O problema e que o estado `closeModalOpen` e `reopenModalOpen` sao resetados quando o periodo muda. Precisamos:

1. Manter os modais abertos com valores de `month` e `year` capturados no momento do clique
2. Nao depender de `selectedCardForAction` para a renderizacao condicional do modal

**Modificar `ReconciliationCard.tsx`:**

```tsx
// Ao inves de guardar o card inteiro, guardar os dados necessarios
const [closeModalData, setCloseModalData] = useState<{
  open: boolean;
  creditCardId: string;
  creditCardName: string;
  month: number;
  year: number;
  totalAmount: number;
} | null>(null);

const [reopenModalData, setReopenModalData] = useState<{
  open: boolean;
  creditCardId: string;
  creditCardName: string;
  month: number;
  year: number;
} | null>(null);

const handleCloseInvoice = (card: CardReconciliation) => {
  // Capturar month/year ATUAIS no momento do clique
  setCloseModalData({
    open: true,
    creditCardId: card.creditCardId,
    creditCardName: card.creditCardName,
    month, // do props
    year,  // do props
    totalAmount: card.transactionsTotal,
  });
};

// E renderizar assim:
{closeModalData && (
  <CloseInvoiceModal
    open={closeModalData.open}
    onOpenChange={(open) => !open && setCloseModalData(null)}
    creditCardId={closeModalData.creditCardId}
    creditCardName={closeModalData.creditCardName}
    month={closeModalData.month}
    year={closeModalData.year}
    totalAmount={closeModalData.totalAmount}
  />
)}
```

### Correcao 2: Garantir visibilidade dos botoes

O layout atual usa `flex-wrap` mas pode nao estar acomodando os botoes corretamente. 

**Modificar o layout dos botoes:**

```tsx
<div className="flex items-center justify-between gap-2 flex-wrap">
  <div className="flex items-center gap-2">
    <InvoiceStatusBadge status={invoiceStatus} />
    <span className="text-sm font-medium">{card.creditCardName}</span>
  </div>
  {/* Mover botoes para linha separada em mobile */}
  <div className="flex items-center gap-2 flex-shrink-0">
    {isClosed ? (
      <Button ...>Reabrir</Button>
    ) : (
      <Button ...>Fechar Fatura</Button>
    )}
    <Button ...>Detalhes</Button>
  </div>
</div>
```

### Correcao 3: Sincronizar periodo no hook useInvoiceCycles

O hook `useInvoiceCycles` no `ReconciliationCard.tsx` esta sendo chamado **sem parametros de periodo**:

```tsx
const { getInvoiceStatus } = useInvoiceCycles(); // SEM month/year!
```

Isso faz com que ele busque TODOS os ciclos de fatura e filtre localmente. Quando o usuario muda de mes, o hook pode retornar status incorreto temporariamente.

**Correcao:**

```tsx
const { getInvoiceStatus } = useInvoiceCycles({ month, year });
```

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/credit-cards/ReconciliationCard.tsx` | Refatorar estado dos modais para capturar dados no momento do clique; adicionar month/year ao useInvoiceCycles; melhorar layout dos botoes |

---

## Mudancas Especificas

### ReconciliationCard.tsx

**Linha 146-149**: Substituir estados separados por objetos completos:

```tsx
// ANTES
const [closeModalOpen, setCloseModalOpen] = useState(false);
const [reopenModalOpen, setReopenModalOpen] = useState(false);
const [selectedCardForAction, setSelectedCardForAction] = useState<CardReconciliation | null>(null);

// DEPOIS
const [closeModalData, setCloseModalData] = useState<{
  creditCardId: string;
  creditCardName: string;
  month: number;
  year: number;
  totalAmount: number;
} | null>(null);

const [reopenModalData, setReopenModalData] = useState<{
  creditCardId: string;
  creditCardName: string;
  month: number;
  year: number;
} | null>(null);
```

**Linha 151**: Passar periodo para o hook:

```tsx
// ANTES
const { getInvoiceStatus } = useInvoiceCycles();

// DEPOIS  
const { getInvoiceStatus } = useInvoiceCycles({ month, year });
```

**Linhas 165-173**: Atualizar handlers:

```tsx
const handleCloseInvoice = (card: CardReconciliation) => {
  setCloseModalData({
    creditCardId: card.creditCardId,
    creditCardName: card.creditCardName,
    month,
    year,
    totalAmount: card.transactionsTotal,
  });
};

const handleReopenInvoice = (card: CardReconciliation) => {
  setReopenModalData({
    creditCardId: card.creditCardId,
    creditCardName: card.creditCardName,
    month,
    year,
  });
};
```

**Linhas 376-398**: Atualizar renderizacao dos modais:

```tsx
{/* Close Invoice Modal */}
{closeModalData && (
  <CloseInvoiceModal
    open={true}
    onOpenChange={(open) => !open && setCloseModalData(null)}
    creditCardId={closeModalData.creditCardId}
    creditCardName={closeModalData.creditCardName}
    month={closeModalData.month}
    year={closeModalData.year}
    totalAmount={closeModalData.totalAmount}
  />
)}

{/* Reopen Invoice Modal */}
{reopenModalData && (
  <ReopenInvoiceModal
    open={true}
    onOpenChange={(open) => !open && setReopenModalData(null)}
    creditCardId={reopenModalData.creditCardId}
    creditCardName={reopenModalData.creditCardName}
    month={reopenModalData.month}
    year={reopenModalData.year}
  />
)}
```

---

## Teste Esperado

1. Navegar para /credit-cards
2. Na seção "Conciliacao de Faturas", ver os botoes "Fechar Fatura" ao lado de cada cartao
3. Clicar em "Fechar Fatura" - modal deve abrir
4. Enquanto modal esta aberto, clicar nas setas para mudar de mes
5. O modal deve permanecer aberto com os dados do mes original
6. Fechar o modal e verificar que os dados foram salvos no mes correto

