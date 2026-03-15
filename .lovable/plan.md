

## Corrigir overflow horizontal na página de Relatórios (mobile)

O problema está na barra de ações do tab "Despesas" (linhas 147-164) que tem os botões de navegação de mês + botão Exportar em uma única linha `flex` sem wrap, causando overflow horizontal em telas de 390px.

### Alterações em `src/pages/Reports.tsx`

1. **Barra de ações (linhas 147-164)**: Mudar para `flex-wrap` ou empilhar verticalmente no mobile (`flex-col sm:flex-row`), e esconder o texto "Exportar" no mobile (mostrar só o ícone)

2. **Ranking de despesas (linhas 208-244)**: Adicionar `overflow-hidden` no container e garantir que valores monetários longos não forcem overflow — usar `text-sm` no mobile e `whitespace-nowrap` com `min-w-0`

3. **Container raiz**: Adicionar `overflow-x-hidden` ao container principal para garantir que nenhum filho cause scroll horizontal

