
# Correção Robusta da Edição do Campo Descrição

## Diagnóstico Aprofundado

O problema persiste porque:

1. **FocusScope do Dialog** - O Radix Dialog usa `FocusScope` que pode interceptar eventos de teclado antes que cheguem ao Input
2. **Capture phase listeners** - O `stopPropagation()` só para eventos na fase de bubbling, não na fase de captura
3. **Command component** - Mesmo que o Popover da categoria esteja fechado, pode haver interferência de event handlers globais

## Solução Robusta

Precisamos de uma abordagem mais agressiva para garantir que o Input receba e processe os eventos:

### 1. Múltiplos Handlers de Eventos

```tsx
<Input
  value={item.description}
  onChange={(e) => handleDescriptionChange(index, e.target.value)}
  onKeyDown={(e) => e.stopPropagation()}
  onKeyUp={(e) => e.stopPropagation()}
  onKeyPress={(e) => e.stopPropagation()}
  onFocus={(e) => e.stopPropagation()}
  onClick={(e) => e.stopPropagation()}
  className={cn(
    "h-7 text-sm font-medium flex-1 min-w-[200px]",
    isRejected && "line-through text-muted-foreground"
  )}
  placeholder="Descrição"
  disabled={isRejected}
/>
```

### 2. Se Ainda Não Funcionar - Usar nativeEvent

Se os handlers básicos não funcionarem, precisamos parar o evento imediatamente:

```tsx
const stopAllPropagation = (e: React.SyntheticEvent) => {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
};

<Input
  value={item.description}
  onChange={(e) => handleDescriptionChange(index, e.target.value)}
  onKeyDown={stopAllPropagation}
  onKeyUp={stopAllPropagation}
  onKeyPress={stopAllPropagation}
  // ...
/>
```

### 3. Verificar se o Input Tem `readOnly` Implícito

Outra causa possível é CSS ou atributo que torne o input não-editável:

```tsx
// Adicionar style explícito para garantir editabilidade
style={{ pointerEvents: 'auto', userSelect: 'text' }}
```

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/modals/InvoiceReviewModal.tsx` | Adicionar múltiplos event handlers no Input de descrição e criar função `stopAllPropagation` |

---

## Mudança Específica

**Linha ~802-812** - Substituir o Input atual por:

```tsx
<Input
  value={item.description}
  onChange={(e) => handleDescriptionChange(index, e.target.value)}
  onKeyDown={(e) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  }}
  onKeyUp={(e) => e.stopPropagation()}
  onKeyPress={(e) => e.stopPropagation()}
  onFocus={(e) => e.stopPropagation()}
  onClick={(e) => e.stopPropagation()}
  className={cn(
    "h-7 text-sm font-medium flex-1 min-w-[200px]",
    isRejected && "line-through text-muted-foreground"
  )}
  placeholder="Descrição"
  disabled={isRejected}
  style={{ pointerEvents: 'auto', userSelect: 'text' }}
/>
```

---

## Teste Esperado

1. Abrir modal de revisão de fatura
2. Clicar no campo de descrição (ex: "IFD*EMPREENDIMENTOS PA")
3. Tentar apagar caracteres com Backspace/Delete
4. Tentar digitar novos caracteres
5. Verificar que o texto é atualizado em tempo real

Se ainda não funcionar, a próxima investigação seria verificar se há um overlay CSS bloqueando o input ou se o Dialog precisa de configuração especial.
