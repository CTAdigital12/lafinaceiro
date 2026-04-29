import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from "recharts";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Currency } from "@/components/ui/currency";

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface AllCategoriesListProps {
  data: CategoryData[];
  total: number;
  onCategoryClick?: (category: CategoryData) => void;
}

export function AllCategoriesList({ data, total, onCategoryClick }: AllCategoriesListProps) {
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  return (
    <ScrollArea className="h-[300px]">
      <ul className="space-y-2 pr-4">
        {sortedData.map((item, index) => {
          const percentage = ((item.value / total) * 100).toFixed(1);
          return (
            <li 
              key={index} 
              className="flex items-center gap-3 text-sm cursor-pointer hover:bg-muted/50 rounded-md p-2 transition-colors"
              onClick={() => onCategoryClick?.(item)}
            >
              <span 
                className="w-3 h-3 rounded-full shrink-0" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-foreground truncate flex-1">
                {item.name}
              </span>
              <span className="text-muted-foreground text-xs shrink-0">
                <Currency value={item.value} />
              </span>
              <span className="text-muted-foreground font-medium text-xs shrink-0 w-12 text-right">
                {percentage}%
              </span>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
