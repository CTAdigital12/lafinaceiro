

# Adicionar seletor de categorias por clique no detalhe de despesas/receitas

## Problema
Atualmente, para navegar entre categorias no mobile, o usuario so pode usar as setas esquerda/direita, o que e pouco pratico quando ha muitas categorias.

## Solucao
Tornar o nome da categoria no cabecalho clicavel, abrindo um Popover com a lista de todas as categorias disponiveis para selecao rapida. As setas continuam funcionando normalmente.

## O que muda visualmente
- O nome da categoria no cabecalho ganha um icone de ChevronDown indicando que e clicavel
- Ao clicar no nome, abre uma lista (Popover) com todas as categorias ordenadas por valor, mostrando a bolinha colorida e o nome
- A categoria atual fica destacada com um check
- Ao selecionar uma categoria da lista, o detalhe muda para ela

## Secao tecnica

### Arquivos a alterar

**1. `src/components/dashboard/ParentCategoryDetailSheet.tsx`**
- Importar `Popover`, `PopoverContent`, `PopoverTrigger` e `Check` icon
- Adicionar estado `categoryListOpen` para controlar o popover
- No `headerContent`, envolver o nome da categoria com um `PopoverTrigger` que abre a lista
- Dentro do `PopoverContent`, renderizar `allParentCategories` como lista clicavel com bolinha colorida, nome, valor e check na categoria atual
- Ao clicar em um item, chamar `onParentCategoryChange` e fechar o popover

**2. `src/components/dashboard/CategoryDetailSheet.tsx`**
- Mesma abordagem: importar Popover, adicionar estado, envolver nome com trigger
- Renderizar `allCategories` como lista clicavel dentro do PopoverContent
- Ao clicar, chamar `onCategoryChange` e fechar o popover

### Estrutura do popover (ambos componentes)
```text
<Popover>
  <PopoverTrigger>
    [bolinha colorida] [nome da categoria] [ChevronDown]
  </PopoverTrigger>
  <PopoverContent>
    <ScrollArea maxHeight=300px>
      lista de categorias com:
        - bolinha colorida
        - nome
        - valor formatado
        - check se for a atual
    </ScrollArea>
  </PopoverContent>
</Popover>
```

O layout das setas permanece inalterado -- a unica mudanca e que a area central do cabecalho (nome) se torna clicavel.

