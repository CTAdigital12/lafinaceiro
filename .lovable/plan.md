

# Expandir Previsão por Mês para mostrar meses futuros

## Problema
O componente "Previsão por Mês" no dashboard de parcelas (cartoes de credito) tem duas limitacoes:
1. Mostra apenas 6 meses (`byMonth.slice(0, 6)`)
2. Inclui meses passados, empurrando meses futuros para fora da visualizacao

Se voce tem parcelas de jan/2025 ate jun/2026, so ve os 6 primeiros meses (jan-jun/2025), nunca chegando a 2026.

## Solucao
1. **Filtrar meses passados**: mostrar apenas meses a partir do mes atual
2. **Expandir limite**: aumentar de 6 para 12 meses, ou remover o limite e adicionar scroll
3. **Botao "ver mais"**: se houver mais de 6 meses, mostrar um botao para expandir a lista completa

## Alteracoes

### 1. `src/components/credit-cards/InstallmentsDashboard.tsx` - Componente `MonthlyBreakdown`
- Linha 73: filtrar `byMonth` para excluir meses anteriores ao mes atual antes do `slice`
- Adicionar estado para controlar expansao (6 meses iniciais, "ver mais" para mostrar todos)

```text
Antes:
  {byMonth.slice(0, 6).map((monthData) => { ... })}

Depois:
  // Filtrar apenas meses >= mes atual
  const currentMonth = format(new Date(), "yyyy-MM");
  const futureMonths = byMonth.filter(m => m.month >= currentMonth);
  const [expanded, setExpanded] = useState(false);
  const visibleMonths = expanded ? futureMonths : futureMonths.slice(0, 6);

  {visibleMonths.map((monthData) => { ... })}
  {futureMonths.length > 6 && (
    <Button variant="ghost" onClick={() => setExpanded(!expanded)}>
      {expanded ? "Ver menos" : `Ver mais ${futureMonths.length - 6} meses`}
    </Button>
  )}
```

### 2. Grafico de Evolucao (`InstallmentsEvolutionChart`)
O grafico ja mostra todos os meses ate a ultima parcela, entao nao precisa de alteracao -- ele ja deve estar mostrando 2026 corretamente.

## Resultado
- A previsao por mes mostrara marco/2026 em diante
- Meses ja passados (jan/2025, fev/2025, etc.) serao omitidos
- Um botao "Ver mais" permitira ver todos os meses futuros quando houver mais de 6

