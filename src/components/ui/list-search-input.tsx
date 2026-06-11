import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ListSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/** Standard search field for lists: a left magnifier icon + input. */
export function ListSearchInput({
  value,
  onChange,
  placeholder = "Buscar...",
  className,
}: ListSearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  );
}
