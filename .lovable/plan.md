
# Solução Definitiva para Edição do Campo Descrição

## Diagnóstico Final

Após investigação aprofundada e pesquisa sobre o Radix UI Dialog, o problema é causado por:

1. **Focus Trap do Dialog** - O Radix Dialog tem um mecanismo de focus trap que pode interceptar eventos
2. **Event Listeners na Fase de Captura** - O `stopPropagation()` só funciona na fase de bubbling, não na captura
3. **Possível Interferência do Command** - O componente `cmdk` usado no seletor de categoria pode ter listeners globais

## Solução: Input Nativo com Ref e Capture Phase Listener

A solução mais robusta é usar um `ref` para adicionar listeners diretamente no DOM na fase de captura:

```tsx
// Criar ref para o input
const inputRef = useRef<HTMLInputElement>(null);

// Usar useEffect para adicionar listener na fase de captura
useEffect(() => {
  const input = inputRef.current;
  if (!input) return;
  
  const stopCapture = (e: Event) => {
    e.stopPropagation();
  };
  
  input.addEventListener('keydown', stopCapture, true); // true = capture phase
  input.addEventListener('keyup', stopCapture, true);
  
  return () => {
    input.removeEventListener('keydown', stopCapture, true);
    input.removeEventListener('keyup', stopCapture, true);
  };
}, []);
```

## Abordagem Alternativa (Mais Simples)

Uma solução mais simples que costuma funcionar é usar um `<input>` HTML nativo em vez do componente `<Input>`:

```tsx
<input
  type="text"
  value={item.description}
  onChange={(e) => handleDescriptionChange(index, e.target.value)}
  className={cn(
    "h-7 text-sm font-medium flex-1 min-w-[200px] px-2 rounded border border-input bg-background",
    isRejected && "line-through text-muted-foreground"
  )}
  placeholder="Descrição"
  disabled={isRejected}
/>
```

## Plano de Implementação

| Arquivo | Mudança |
|---------|---------|
| `src/components/modals/InvoiceReviewModal.tsx` | Substituir `<Input>` por `<input>` HTML nativo com estilos compatíveis |

## Mudança Específica

**Linha 802-820** - Substituir o componente Input por input nativo:

```tsx
<input
  type="text"
  value={item.description}
  onChange={(e) => handleDescriptionChange(index, e.target.value)}
  className={cn(
    "flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-medium flex-1 min-w-[200px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
    isRejected && "line-through text-muted-foreground"
  )}
  placeholder="Descrição"
  disabled={isRejected}
/>
```

## Por que isso funciona?

O componente `<Input>` do shadcn usa `React.forwardRef` e pode ter comportamentos herdados ou wrapper elements que interferem. Usando o `<input>` HTML nativo, eliminamos qualquer possível interferência de componentes intermediários.

## Teste Esperado

1. Abrir modal de revisão de fatura
2. Clicar no campo "IFD*EMPREENDIMENTOS PA"
3. Usar Backspace para apagar caracteres
4. Digitar novo texto
5. Verificar que as alterações são aplicadas em tempo real

---

### Seção Técnica

**Causa raiz**: O Radix Dialog usa internamente um `FocusScope` que pode capturar eventos de teclado na fase de captura (antes de chegarem aos elementos filhos). O `stopPropagation()` em React só funciona na fase de bubbling.

**Solução escolhida**: Usar elemento `<input>` HTML nativo evita qualquer wrapper ou comportamento adicional que o componente `<Input>` possa ter, garantindo que o navegador trate o input de forma padrão.
