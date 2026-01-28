
# Corrigir Edição do Campo Descrição

## Diagnóstico

O Input de descrição está na linha 802-811 com a configuração correta:
```tsx
<Input
  value={item.description}
  onChange={(e) => handleDescriptionChange(index, e.target.value)}
  disabled={isRejected}  // Só desabilita para itens rejeitados
/>
```

Porém, o usuário não consegue digitar. Possíveis causas:
1. **Evento `onKeyDown` capturado** pelo Dialog ou ScrollArea
2. **CSS `user-select: none`** herdado de algum parent
3. **Conflito de foco** com o Command/Popover da categoria

## Solução

Adicionar propriedades explícitas para garantir que o Input seja editável:

```tsx
<Input
  value={item.description}
  onChange={(e) => handleDescriptionChange(index, e.target.value)}
  onKeyDown={(e) => e.stopPropagation()} // Prevenir que Dialog capture eventos
  className={cn(
    "h-7 text-sm font-medium flex-1 min-w-[200px]",
    isRejected && "line-through text-muted-foreground"
  )}
  placeholder="Descrição"
  disabled={isRejected}
/>
```

A chave é `onKeyDown={(e) => e.stopPropagation()}` que previne o Dialog de capturar os eventos de teclado.

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/modals/InvoiceReviewModal.tsx` | Adicionar `onKeyDown={(e) => e.stopPropagation()}` no Input de descrição (linha ~804) |

## Teste Esperado
- Clicar no campo de descrição
- Digitar/apagar texto
- Verificar que o texto é atualizado em tempo real
