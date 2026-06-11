import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/useListSearchSort";

interface ListSortButtonsProps<K extends string> {
  options: Array<{ key: K; label: string }>;
  activeField: K | null;
  direction: SortDirection;
  onSort: (field: K) => void;
  className?: string;
  label?: string;
}

/**
 * Sort controls for card/list layouts that have no table header. Mirrors the
 * <SortableHead> idiom (neutral glyph → active direction; toggle desc→asc→clear).
 */
export function ListSortButtons<K extends string>({
  options,
  activeField,
  direction,
  onSort,
  className,
  label = "Ordenar:",
}: ListSortButtonsProps<K>) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1 text-xs", className)}>
      {label && <span className="text-muted-foreground mr-1">{label}</span>}
      {options.map(({ key, label: optLabel }) => {
        const active = activeField === key;
        return (
          <Button
            key={key}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={() => onSort(key)}
          >
            {optLabel}
            {!active ? (
              <ArrowUpDown className="h-3 w-3 opacity-50" />
            ) : direction === "desc" ? (
              <ArrowDown className="h-3 w-3" />
            ) : (
              <ArrowUp className="h-3 w-3" />
            )}
          </Button>
        );
      })}
    </div>
  );
}
