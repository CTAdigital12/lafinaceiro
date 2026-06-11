import * as React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/useListSearchSort";

interface SortableHeadProps<K extends string> {
  field: K;
  label: React.ReactNode;
  activeField: K | null;
  direction: SortDirection;
  onSort: (field: K) => void;
  className?: string;
  align?: "left" | "right";
}

/**
 * A <TableHead> whose label is a clickable sort toggle. Shows a neutral
 * up/down glyph when inactive and the active direction otherwise — matching the
 * Transactions page idiom. Pair with `useListSearchSort`.
 */
export function SortableHead<K extends string>({
  field,
  label,
  activeField,
  direction,
  onSort,
  className,
  align = "left",
}: SortableHeadProps<K>) {
  const active = activeField === field;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "flex items-center gap-1 hover:text-primary transition-colors select-none",
          align === "right" && "ml-auto flex-row-reverse",
          active && "text-primary font-semibold"
        )}
      >
        {label}
        {!active ? (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        ) : direction === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUp className="h-3 w-3" />
        )}
      </button>
    </TableHead>
  );
}
