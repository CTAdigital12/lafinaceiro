import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const data = [
  { month: "Jan", receitas: 4500, despesas: 3200 },
  { month: "Fev", receitas: 5200, despesas: 3800 },
  { month: "Mar", receitas: 4800, despesas: 4100 },
  { month: "Abr", receitas: 5500, despesas: 3600 },
  { month: "Mai", receitas: 4900, despesas: 4200 },
  { month: "Jun", receitas: 6200, despesas: 4500 },
];

export function BalanceChart() {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground mb-2">{label}</p>
          {payload.map((item: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: item.color }}>
              {item.name}: R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-card animate-slide-up">
      <h3 className="text-lg font-semibold text-foreground mb-4">Balanço Mensal</h3>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => <span className="text-sm text-foreground capitalize">{value}</span>}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="receitas" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="despesas" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
