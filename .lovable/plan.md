
# Corrigir seletor de categoria no modal de recorrencias

## Problema identificado

O `CategorySelector` no `RecurringRuleModal` nao funciona por dois motivos:

1. **Prop `currentCategory` nao fornecida**: O componente `CategorySelector` usa a prop `currentCategory` para exibir a categoria selecionada. No `RecurringRuleModal`, essa prop nao e passada, entao o botao sempre mostra "Selecionar" e o usuario nao tem feedback visual da selecao.

2. **Popover dentro de Drawer no mobile**: O `CategorySelector` usa `Popover` (Radix Portal), que conflita com o `Drawer` do `ResponsiveDialog` no mobile, impedindo a interacao.

## Solucao

Substituir o `CategorySelector` por um `Select` simples (mesmo padrao usado para conta e cartao no proprio modal), listando as categorias agrupadas por pai. Isso resolve ambos os problemas de uma vez.

## Secao tecnica

### Arquivo a alterar
- `src/components/modals/RecurringRuleModal.tsx`

### Mudanca
Substituir o bloco do `CategorySelector` por um `Select` nativo do projeto que:
- Filtra categorias por tipo (income/expense) usando o hook `useCategories`
- Agrupa subcategorias sob o pai com `SelectGroup` e `SelectLabel`
- Exibe icone + nome da categoria
- Funciona corretamente tanto no desktop quanto no mobile (sem Portal/Popover)

### Codigo aproximado da mudanca
```tsx
// Adicionar import de useCategories
const { incomeCategories, expenseCategories } = useCategories();
const categories = type === "income" ? incomeCategories : expenseCategories;

// No JSX, substituir CategorySelector por:
<Select value={categoryId || ""} onValueChange={(v) => setCategoryId(v || null)}>
  <SelectTrigger>
    <SelectValue placeholder="Selecione a categoria" />
  </SelectTrigger>
  <SelectContent>
    {categories.filter(c => !c.parent_id).map(parent => {
      const children = categories.filter(c => c.parent_id === parent.id);
      if (children.length > 0) {
        return (
          <SelectGroup key={parent.id}>
            <SelectLabel>{parent.icon} {parent.name}</SelectLabel>
            {children.map(child => (
              <SelectItem key={child.id} value={child.id}>
                {child.icon} {child.name}
              </SelectItem>
            ))}
          </SelectGroup>
        );
      }
      return (
        <SelectItem key={parent.id} value={parent.id}>
          {parent.icon} {parent.name}
        </SelectItem>
      );
    })}
  </SelectContent>
</Select>
```

### Impacto
- Nenhum outro arquivo e afetado
- O `CategorySelector` original continua funcionando onde ja e usado (ex: lista de transacoes, que nao esta dentro de Drawer)
