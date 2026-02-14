
# Corrigir scroll no mobile dentro de Drawers

## Problema
O componente Drawer (vaul) intercepta eventos de toque para o gesto de "arrastar para fechar". O Radix `ScrollArea` usa um Viewport customizado que nao sinaliza corretamente ao vaul que o usuario esta tentando rolar conteudo, nao fechar o drawer. Resultado: scroll trava em qualquer area dentro de um Drawer no mobile.

## Solucao
Adicionar o atributo `data-vaul-no-drag` no Viewport do `ScrollArea`. Esse atributo e reconhecido nativamente pelo vaul e diz "nao intercepte toques neste elemento". Como o `ScrollArea` e um componente global usado em todo o app, essa unica alteracao resolve o problema em todos os locais de uma vez.

Adicionalmente, aplicar o mesmo atributo no container de conteudo do `ResponsiveDialog`, que usa `overflow-y-auto` diretamente.

## O que muda
- Scroll volta a funcionar normalmente dentro de Drawers no mobile
- A lista de categorias no seletor rola corretamente
- Listas de transacoes, modais com conteudo longo e todas as areas scrollaveis dentro de Drawers funcionam
- Nenhuma mudanca visual

## Secao tecnica

### Arquivos a alterar

**1. `src/components/ui/scroll-area.tsx`**
- Adicionar `data-vaul-no-drag` ao `ScrollAreaPrimitive.Viewport`
- Isso resolve globalmente qualquer `ScrollArea` dentro de um Drawer

Antes:
```text
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
```

Depois:
```text
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]" data-vaul-no-drag>
```

**2. `src/components/ui/responsive-dialog.tsx`**
- Adicionar `data-vaul-no-drag` ao `div` com `overflow-y-auto` dentro do `DrawerContent`

Antes:
```text
<div className={cn("px-4 pb-8 overflow-y-auto", className)}>
```

Depois:
```text
<div className={cn("px-4 pb-8 overflow-y-auto", className)} data-vaul-no-drag>
```

**3. `src/components/dashboard/ParentCategoryDetailSheet.tsx`**
- Adicionar `data-vaul-no-drag` ao container de conteudo dentro do Drawer (`<div className="px-4 pb-6">`)

**4. `src/components/dashboard/CategoryDetailSheet.tsx`**
- Mesma alteracao: adicionar `data-vaul-no-drag` ao container de conteudo dentro do Drawer

### Por que funciona
O vaul (>=0.9) reconhece o atributo `data-vaul-no-drag` e para de interceptar eventos de toque em elementos que o possuem. Como o `ScrollArea` e o componente padrao de scroll do app, corrigir no Viewport resolve todas as instancias de uma vez.
