

## Funcionalidade: Projetos / Caixinhas

### 1. Schema do Banco de Dados

**Nova tabela `projects`** com migração SQL:
- `id`, `user_id`, `name`, `description`, `target_amount`, `status` (enum: active/completed/cancelled, default 'active'), `icon`, `color`, `created_at`, `updated_at`
- RLS: SELECT/INSERT/UPDATE/DELETE para `auth.uid() = user_id` + shared_access para SELECT e UPDATE
- Trigger `update_updated_at_column` reutilizado

**Alterar tabela `transactions`**:
- Adicionar coluna `project_id uuid NULLABLE` com FK para `projects.id ON DELETE SET NULL`

### 2. Hook `useProjects`

Novo arquivo `src/hooks/useProjects.ts`:
- Query: busca projetos do usuário com cálculo de `spent_amount` via query separada (soma transações vinculadas onde `type='expense'`, `is_refund=false`, `is_card_payment=false`, `is_provisional=false`, menos refunds)
- Mutations: create, update, delete com invalidação de queries
- Segue padrão de `useAccounts.ts`

**Atualizar `useTransactions`**:
- Adicionar `projects (id, name, icon, color)` ao select da query principal

### 3. Nova Página `/projects`

**Arquivo `src/pages/Projects.tsx`**:
- Grid de cards dos projetos ativos, cada card com:
  - Ícone + Nome
  - Gasto / Orçado formatado
  - `Progress` bar com cor dinâmica (verde <80%, amarela 80-99%, vermelha ≥100%)
- Botão "Novo Projeto" abre modal de criação (ResponsiveDialog)
- Ao clicar no card, abre `ProjectDetailSheet` (ResponsiveDialog)

**`ProjectDetailSheet`**:
- Saldo restante em destaque (Orçado - Gasto)
- Progress bar
- Lista de transações vinculadas (filtradas por `project_id`)
- Botão "Vincular Despesas" → abre modal de vinculação

**Modal de Vinculação** (`LinkTransactionsModal`):
- Lista transações dos últimos 90 dias sem `project_id`, tipo expense
- Checkboxes para seleção múltipla
- Botão confirma: UPDATE em lote `project_id = X`

### 4. Integração no TransactionModal

- Novo state `projectId` + select de projetos ativos
- No mobile, renderizar como lista inline (mesmo padrão dos outros selects com Command/Popover)
- Salvar `project_id` no create/update

### 5. Navegação

- `AppSidebar`: adicionar item `{ icon: FolderKanban, label: "Projetos", path: "/projects" }` após "Planejamento"
- `BottomNav`: adicionar nos `secondaryNavItems` (menu "Mais")
- `App.tsx`: adicionar `<Route path="/projects" element={<Projects />} />`

### 6. Regras de Cálculo (Segurança)

O total gasto será calculado no hook `useProjects` com filtros:
```
type === 'expense' AND is_card_payment !== true AND is_provisional !== true
```
Refunds (`is_refund === true`) com mesmo `project_id` são subtraídos do total.

### Arquivos a criar/editar

| Ação | Arquivo |
|------|---------|
| Criar | `src/hooks/useProjects.ts` |
| Criar | `src/pages/Projects.tsx` |
| Criar | `src/components/projects/ProjectCard.tsx` |
| Criar | `src/components/projects/ProjectDetailSheet.tsx` |
| Criar | `src/components/projects/ProjectModal.tsx` |
| Criar | `src/components/projects/LinkTransactionsModal.tsx` |
| Editar | `src/hooks/useTransactions.ts` — adicionar `projects` no select |
| Editar | `src/components/modals/TransactionModal.tsx` — campo projeto |
| Editar | `src/components/layout/AppSidebar.tsx` — nav item |
| Editar | `src/components/layout/BottomNav.tsx` — secondary nav item |
| Editar | `src/App.tsx` — rota /projects |
| Migration | Criar tabela `projects` + coluna `project_id` em transactions |

