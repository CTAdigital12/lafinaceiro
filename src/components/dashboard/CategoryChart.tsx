import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from "recharts";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface CategoryChartProps {
  title: string;
  data: CategoryData[];
  onCategoryClick?: (category: CategoryData) => void;
  onViewAllClick?: () => void;
}

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.1))" }}
      />
    </g>
  );
};

export function CategoryChart({ title, data, onCategoryClick, onViewAllClick }: CategoryChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const hasData = data.length > 0 && !(data.length === 1 && data[0].name === "Sem dados");

  // Get top 4 categories
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const top4 = sortedData.slice(0, 4);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const percentage = ((item.value / total) * 100).toFixed(1);
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground text-sm">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">{percentage}%</p>
        </div>
      );
    }
    return null;
  };

  const handlePieClick = (data: any, index: number) => {
    if (onCategoryClick && hasData) {
      onCategoryClick(sortedData[index]);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm animate-slide-up">
      <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Chart Column - 60% */}
        <div className="md:col-span-3 h-[220px] flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
                onClick={handlePieClick}
                style={{ cursor: hasData ? "pointer" : "default" }}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color} 
                    strokeWidth={0} 
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* List Column - 40% */}
        <div className="md:col-span-2 flex flex-col justify-center">
          {hasData ? (
            <>
              <ul className="space-y-3">
                {top4.map((item, index) => {
                  const percentage = ((item.value / total) * 100).toFixed(0);
                  return (
                    <li 
                      key={index} 
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded-md p-1.5 -mx-1.5 transition-colors"
                      onClick={() => onCategoryClick?.(item)}
                    >
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-foreground truncate flex-1 text-xs">
                        {item.name}
                      </span>
                      <span className="text-muted-foreground font-medium text-xs">
                        {percentage}%
                      </span>
                    </li>
                  );
                })}
              </ul>
              
              {sortedData.length > 4 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground justify-start p-0 h-auto"
                  onClick={onViewAllClick}
                >
                  Ver todas ({sortedData.length})
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Nenhuma transação registrada
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
