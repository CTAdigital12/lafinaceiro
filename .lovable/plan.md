

## Corrigir Header cortado no mobile

O problema visível no screenshot é que o **Header** está cortado à direita — o avatar/perfil está parcialmente visível. O Header tem `px-6` (24px cada lado) + seletor de mês com `min-w-[160px]` + 3 botões à direita, totalizando mais de 390px.

### Alterações

**Arquivo: `src/components/layout/Header.tsx`**

1. Reduzir padding horizontal no mobile: `px-3 md:px-6`
2. Reduzir `min-w-[160px]` do seletor de mês para `min-w-[120px] md:min-w-[160px]`
3. Reduzir `gap-4` dos botões da direita para `gap-1 md:gap-4`
4. Esconder o botão de notificações (Bell) no mobile — já não tem funcionalidade visível

**Arquivo: `src/components/layout/MainLayout.tsx`**

5. Adicionar `overflow-x-hidden` ao container principal para prevenir qualquer scroll horizontal residual

