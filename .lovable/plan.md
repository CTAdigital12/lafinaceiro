
# Mostrar Controles de Edição Sempre Visíveis

## Problema
Os controles de edição (categoria, corporate, notas) estão ocultos quando um item não está marcado para importação (`include_in_import = false`). Isso impede o usuário de:
- Escolher categoria para duplicatas antes de forçar a inclusão
- Adicionar notas a qualquer item
- Marcar itens como corporativos independente do status

## Solução
Remover a condição `{item.include_in_import && ...}` que oculta os controles, mantendo-os sempre visíveis com comportamento ajustado:

| Status | Controles |
|--------|-----------|
| **Novo** (incluído) | Visíveis, habilitados |
| **Duplicado** (desmarcado) | Visíveis, habilitados |
| **Rejeitado** | Visíveis, desabilitados (cinza) |

## Mudança Técnica

### Antes (linha 888)
```tsx
{item.include_in_import && (
  <>
    <div className="flex items-center gap-2 flex-wrap">
      {/* Categoria, Corporate, Notes */}
    </div>
  </>
)}
```

### Depois
```tsx
<div className={cn(
  "flex items-center gap-2 flex-wrap",
  isRejected && "opacity-50 pointer-events-none"
)}>
  {/* Categoria, Corporate, Notes - sempre visíveis */}
</div>
```

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/modals/InvoiceReviewModal.tsx` | Remover condição `item.include_in_import &&`, adicionar classe condicional para itens rejeitados |

## Resultado Esperado
- Usuário pode editar categoria/notas de QUALQUER item
- Itens rejeitados mostram controles desabilitados (não clicáveis)
- Workflow: editar primeiro → depois marcar para importar
