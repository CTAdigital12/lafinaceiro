

# Corrigir seletor de categorias no mobile

## Problema
O Popover do Radix usa um Portal que renderiza o conteudo fora do Drawer (vaul). No mobile, o Drawer captura foco e cliques, impedindo que o Popover funcione corretamente. O popover abre mas fecha imediatamente ou nao responde a cliques.

## Solucao
No mobile, substituir o Popover por uma lista expansivel inline (sem Portal), que funciona perfeitamente dentro do Drawer. No desktop (Sheet), manter o Popover como esta, pois funciona normalmente.

## O que muda
- No mobile: ao clicar no nome da categoria, uma lista aparece logo abaixo do cabecalho (inline, sem portal), com animacao suave
- No desktop: comportamento continua identico (Popover com portal)
- A experiencia visual e praticamente a mesma nos dois casos

## Secao tecnica

### Arquivos a alterar

**1. `src/components/dashboard/ParentCategoryDetailSheet.tsx`**
- Separar o `headerContent` em duas versoes:
  - Desktop: manter Popover atual (com Portal)
  - Mobile: usar um estado `categoryListOpen` com renderizacao condicional de uma `div` inline contendo a lista de categorias (sem Popover/Portal)
- O trigger no mobile continua sendo o botao com o nome da categoria + ChevronDown
- A lista inline usa a mesma estrutura visual (ScrollArea com botoes de categoria, check na atual)

**2. `src/components/dashboard/CategoryDetailSheet.tsx`**
- Mesma abordagem: no mobile, trocar Popover por lista inline expansivel

### Estrutura no mobile (ambos componentes)
```text
<DrawerHeader>
  [seta esquerda] [botao com nome da categoria + ChevronDown] [seta direita]
  {categoryListOpen && (
    <div className="border rounded-lg mt-2">
      <ScrollArea className="h-[250px]">
        lista de categorias (mesma estrutura visual do popover)
      </ScrollArea>
    </div>
  )}
</DrawerHeader>
```

### Por que funciona
O Drawer do vaul nao interfere com elementos renderizados dentro dele (inline). O problema era exclusivamente o Portal do Popover, que renderiza fora da arvore do Drawer.
