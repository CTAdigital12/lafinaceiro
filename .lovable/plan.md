

## Corrigir scroll do menu "Mais" no mobile

O problema é que o `nav` dentro do Sheet tem `overflow-y-auto` mas não tem uma altura máxima definida, então o conteúdo ultrapassa o espaço visível sem permitir scroll efetivo.

### Alteração

**Arquivo**: `src/components/layout/BottomNav.tsx`

- Substituir o `overflow-y-auto` do `nav` por um `ScrollArea` com altura calculada para ocupar o espaço disponível dentro do sheet
- Adicionar `data-vaul-no-drag` para evitar conflito de gestos com o Drawer
- Usar `h-[calc(70vh-80px)]` para descontar o header do sheet

