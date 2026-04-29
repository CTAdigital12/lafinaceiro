import { Card, CardContent } from "@/components/ui/card";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { usePrivacyMode } from "@/contexts/PrivacyContext";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";

interface ChartDataItem {
  label: string;
  planned: number;
  actual: number;
  variance: number;
}

function CustomTooltip({ active, payload, label }: any) {
  const fmt = useFormatCurrency();
  if (!active || !payload?.length) return null;
  const planned = payload.find((p: any) => p.dataKey === "planned")?.value || 0;
  const actual = payload.find((p: any) => p.dataKey === "actual")?.value || 0;
  const variance = payload.find((p: any) => p.dataKey === "variance")?.value || 0;

  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg text-sm space-y-1">
      <p className="font-semibold text-foreground capitalize">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Orçado:</span>
        <span className="font-medium text-primary">{fmt(planned)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Realizado:</span>
        <span className="font-medium text-amber-500">{fmt(actual)}</span>
      </div>
      <div className="border-t border-border pt-1 flex justify-between gap-4">
        <span className="text-muted-foreground">Variação:</span>
        <span className={`font-semibold ${variance > 0 ? "text-destructive" : variance < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
          {variance > 0 ? "+" : ""}{variance}%
        </span>
      </div>
    </div>
  );
}

export function BudgetChart({ data }: { data: ChartDataItem[] }) {
  const { isHidden } = usePrivacyMode();
  return (
    <Card>
      <CardContent className="pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Evolução Orçado vs Realizado (6 meses)
        </h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis
                yAxisId="currency"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => isHidden ? "••" : `${(v / 1000).toFixed(0)}k`}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                className="text-muted-foreground"
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value: string) => {
                  const labels: Record<string, string> = {
                    planned: "Orçado",
                    actual: "Realizado",
                    variance: "Variação %",
                  };
                  return labels[value] || value;
                }}
              />
              <Bar yAxisId="currency" dataKey="planned" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} barSize={20} />
              <Bar yAxisId="currency" dataKey="actual" fill="hsl(var(--chart-4, 45 93% 47%))" radius={[3, 3, 0, 0]} barSize={20} />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="variance"
                stroke="hsl(var(--chart-5, 280 65% 60%))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
