

## Botão de Sincronização Global no Header

### Alterações

**1. `src/components/layout/Header.tsx`**
- Importar `RefreshCw` do lucide-react, `useQueryClient` do react-query, e `useState` do React
- Adicionar botão com ícone `RefreshCw` antes do sino de notificações
- `handleRefresh`: invalidar todas as queries, com estado `isRefreshing` para animar o ícone (`animate-spin`)
- `aria-label="Atualizar dados"` para acessibilidade

**2. `src/App.tsx`**
- Adicionar `refetchOnWindowFocus: true` nas `defaultOptions` do `QueryClient` para auto-refresh ao retornar ao app

