import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useCategories, Category } from "@/hooks/useCategories";

interface CategorySelectorProps {
  value: string | null;
  type: "income" | "expense";
  currentCategory?: { id: string; name: string; icon: string | null; color: string | null } | null;
  onSelect: (categoryId: string) => void;
}

export function CategorySelector({ value, type, currentCategory, onSelect }: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const { incomeCategories, expenseCategories } = useCategories();
  
  const categories = type === "income" ? incomeCategories : expenseCategories;

  const handleSelect = (categoryId: string) => {
    onSelect(categoryId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 hover:bg-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          {currentCategory ? (
            <Badge variant="secondary" className="font-normal cursor-pointer hover:bg-secondary/80">
              {currentCategory.icon} {currentCategory.name}
              <ChevronDown className="ml-1 h-3 w-3" />
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal cursor-pointer">
              Selecionar
              <ChevronDown className="ml-1 h-3 w-3" />
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {categories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={category.name}
                  onSelect={() => handleSelect(category.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === category.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="mr-2">{category.icon}</span>
                  {category.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
