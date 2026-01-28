

# Gerenciamento Completo de Parcelas

## Problema Identificado

Atualmente, ao clicar em uma transação parcelada na lista, o sistema abre o `InstallmentDetailsSheet` que apenas exibe informações e permite editar a categoria. Nao ha opcoes para:

- Editar valores individuais ou em lote
- Adicionar novas parcelas
- Remover parcelas futuras
- Editar datas de vencimento
- Editar descricao
- Duplicar a compra parcelada

## Solucao Proposta

### Novos Recursos no InstallmentDetailsSheet

**1. Acoes no Cabecalho**
- Botao "Editar Compra" - abre modal para editar dados gerais (descricao, categoria) aplicando a todas as parcelas
- Menu dropdown com acoes avancadas

**2. Acoes por Parcela Individual**
- Cada linha do cronograma tera um botao de menu (tres pontos) com:
  - "Editar esta parcela" - abre TransactionModal para a parcela especifica
  - "Excluir esta parcela" - remove apenas esta parcela (ajusta numeracao)
  - "Marcar como paga" / "Marcar como pendente" - alterna status

**3. Acoes em Lote (Footer)**
- "Adicionar Parcelas" - adiciona X novas parcelas ao final
- "Remover Parcelas Futuras" - remove todas as parcelas pendentes apos a atual
- "Editar Todas" - edita descricao/valor/categoria em lote

---

## Arquivos a Modificar

### 1. `src/hooks/useInstallmentGroup.ts`

Adicionar novas mutations:

```typescript
// Mutation: Atualizar uma parcela especifica
const updateSingleInstallment = useMutation({
  mutationFn: async ({ id, data }: { id: string; data: Partial<Transaction> }) => {
    const { error } = await supabase
      .from("transactions")
      .update(data)
      .eq("id", id);
    if (error) throw error;
  },
  onSuccess: () => { /* invalidar queries */ }
});

// Mutation: Excluir uma parcela
const deleteSingleInstallment = useMutation({
  mutationFn: async (id: string) => { ... },
  onSuccess: () => { /* recalcular numeracao se necessario */ }
});

// Mutation: Adicionar novas parcelas
const addInstallments = useMutation({
  mutationFn: async ({ count, baseData }: { count: number; baseData: any }) => {
    // Criar X novas parcelas com due_date incrementado
  }
});

// Mutation: Remover todas as parcelas pendentes
const deletePendingInstallments = useMutation({
  mutationFn: async () => {
    await supabase
      .from("transactions")
      .delete()
      .eq("installment_group_id", groupId)
      .eq("status", "pending");
  }
});

// Mutation: Atualizar todas as parcelas (descricao/valor/categoria)
const updateAllInstallments = useMutation({
  mutationFn: async (data: { description?: string; amount?: number; category_id?: string }) => {
    await supabase
      .from("transactions")
      .update(data)
      .eq("installment_group_id", groupId);
  }
});

// Mutation: Marcar como paga/pendente
const toggleInstallmentStatus = useMutation({
  mutationFn: async ({ id, newStatus }: { id: string; newStatus: "completed" | "pending" }) => {
    await supabase
      .from("transactions")
      .update({ status: newStatus })
      .eq("id", id);
  }
});
```

### 2. `src/components/InstallmentDetailsSheet.tsx`

Adicionar componentes de acao:

**Header atualizado:**
```tsx
<SheetHeader>
  <div className="flex items-start justify-between">
    <div>
      <SheetTitle>{baseDescription}</SheetTitle>
      <p className="text-sm text-muted-foreground">...</p>
    </div>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setShowEditAllModal(true)}>
          <Edit className="h-4 w-4 mr-2" />
          Editar Todas as Parcelas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setShowAddModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Parcelas
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="text-destructive"
          onClick={handleDeletePending}
        >
          <Trash className="h-4 w-4 mr-2" />
          Remover Parcelas Pendentes
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</SheetHeader>
```

**Linha de parcela com acoes:**
```tsx
{installments.map((installment, index) => (
  <div key={installment.id} className="flex items-center gap-3 p-3 ...">
    {/* Status Icon */}
    {/* Content */}
    {/* Amount */}
    
    {/* Menu de Acoes */}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleEditSingle(installment)}>
          <Edit className="h-4 w-4 mr-2" />
          Editar Parcela
        </DropdownMenuItem>
        {installment.status === "pending" ? (
          <DropdownMenuItem onClick={() => handleToggleStatus(installment.id, "completed")}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Marcar como Paga
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => handleToggleStatus(installment.id, "pending")}>
            <Clock className="h-4 w-4 mr-2" />
            Marcar como Pendente
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          className="text-destructive"
          onClick={() => handleDeleteSingle(installment.id)}
        >
          <Trash className="h-4 w-4 mr-2" />
          Excluir Parcela
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
))}
```

### 3. Novo Componente: `src/components/modals/EditInstallmentsModal.tsx`

Modal para edicao em lote:

```tsx
interface EditInstallmentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installments: Transaction[];
  onSave: (data: { description?: string; amount?: number; category_id?: string }) => Promise<void>;
}

export function EditInstallmentsModal({ ... }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  
  // Checkboxes para indicar quais campos atualizar
  const [updateDescription, setUpdateDescription] = useState(false);
  const [updateAmount, setUpdateAmount] = useState(false);
  const [updateCategory, setUpdateCategory] = useState(false);
  
  return (
    <ResponsiveDialog title="Editar Todas as Parcelas">
      <form onSubmit={handleSubmit}>
        {/* Checkbox + Input para Descricao */}
        {/* Checkbox + Input para Valor */}
        {/* Checkbox + CategorySelector */}
        
        <p className="text-sm text-muted-foreground">
          As alteracoes serao aplicadas a todas as {installments.length} parcelas.
        </p>
        
        <Button type="submit">Salvar Alteracoes</Button>
      </form>
    </ResponsiveDialog>
  );
}
```

### 4. Novo Componente: `src/components/modals/AddInstallmentsModal.tsx`

Modal para adicionar parcelas:

```tsx
interface AddInstallmentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTotal: number;
  lastInstallment: Transaction;
  onAdd: (count: number) => Promise<void>;
}

export function AddInstallmentsModal({ ... }) {
  const [count, setCount] = useState(1);
  
  return (
    <ResponsiveDialog title="Adicionar Parcelas">
      <div className="space-y-4">
        <p>Adicionar novas parcelas ao final da compra parcelada.</p>
        
        <div className="space-y-2">
          <Label>Quantidade de Parcelas</Label>
          <Input 
            type="number" 
            min={1} 
            max={48}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        
        <div className="bg-muted/50 p-3 rounded-lg text-sm">
          <p>Total atual: {currentTotal} parcelas</p>
          <p>Novo total: {currentTotal + count} parcelas</p>
          <p>Valor por parcela: R$ {lastInstallment.amount}</p>
        </div>
        
        <Button onClick={() => onAdd(count)}>
          Adicionar {count} Parcela{count > 1 ? "s" : ""}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
```

---

## Fluxo de Uso Atualizado

1. **Visualizar parcelas**: Clicar em transacao parcelada abre o Sheet com todas as informacoes
2. **Editar uma parcela**: Menu (tres pontos) na linha, Editar Parcela, abre TransactionModal
3. **Marcar como paga**: Menu na linha, Marcar como Paga
4. **Editar todas**: Menu no cabecalho, Editar Todas as Parcelas, abre modal em lote
5. **Adicionar parcelas**: Menu no cabecalho, Adicionar Parcelas, escolhe quantidade
6. **Remover futuras**: Menu no cabecalho, Remover Parcelas Pendentes (com confirmacao)

---

## Interface Visual (Resumo)

```
┌──────────────────────────────────────────────────────────────┐
│  COMPRA PARCELADA XYZ                              [⋮ Menu] │
│  Cartao Nubank •1234                                         │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ Valor Total      │  │ Parcela Mensal   │                 │
│  │ R$ 1.200,00      │  │ R$ 100,00        │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
│  Progresso: ████████░░░░░░░░░░ 5/12 parcelas                │
│                                                              │
│  Cronograma de Parcelas                                      │
│  ┌────────────────────────────────────────────────────┬───┐ │
│  │ ✓ Parcela 1/12    Jan/25    R$ 100,00              │ ⋮ │ │
│  │ ✓ Parcela 2/12    Fev/25    R$ 100,00              │ ⋮ │ │
│  │ ● Parcela 3/12 [Atual]  Mar/25    R$ 100,00        │ ⋮ │ │
│  │ ○ Parcela 4/12    Abr/25    R$ 100,00              │ ⋮ │ │
│  │ ...                                                 │   │ │
│  └────────────────────────────────────────────────────┴───┘ │
│                                                              │
│  [        🏷️ Editar Categoria de Todas           ]          │
└──────────────────────────────────────────────────────────────┘
```

Menu de cada parcela (⋮):
- Editar Parcela
- Marcar como Paga / Pendente
- ──────────────
- Excluir Parcela

Menu do cabecalho (⋮):
- Editar Todas as Parcelas
- Adicionar Parcelas
- ──────────────
- Remover Parcelas Pendentes

