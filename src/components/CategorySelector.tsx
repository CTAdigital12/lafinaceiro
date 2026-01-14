import { useState, useMemo } from "react";
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
  const { incomeCategories, expenseCategories, categories: allCategories } = useCategories();
  
  const categories = type === "income" ? incomeCategories : expenseCategories;

  // Find full category info from enriched categories
  const selectedCategory = useMemo(() => {
    if (!value) return null;
    return allCategories.find(c => c.id === value) || null;
  }, [value, allCategories]);

  // Group categories by parent for display
  const groupedCategories = useMemo(() => {
    const parentCategories = categories.filter(c => !c.parent_id);
    const childCategories = categories.filter(c => c.parent_id);
    
    // Create groups: parent categories that have children
    const groups: { parent: Category | null; children: Category[] }[] = [];
    
    parentCategories.forEach(parent => {
      const children = childCategories.filter(c => c.parent_id === parent.id);
      if (children.length > 0) {
        groups.push({ parent, children });
      } else {
        // Parent without children - add as standalone
        groups.push({ parent: null, children: [parent] });
      }
    });
    
    // Add orphan children (shouldn't happen but just in case)
    const groupedChildIds = groups.flatMap(g => g.children.map(c => c.id));
    const orphans = childCategories.filter(c => !groupedChildIds.includes(c.id));
    if (orphans.length > 0) {
      groups.push({ parent: null, children: orphans });
    }
    
    return groups;
  }, [categories]);

  const handleSelect = (categoryId: string) => {
    onSelect(categoryId);
    setOpen(false);
  };

  // Build display text for selected category
  const getDisplayText = () => {
    if (!currentCategory) return null;
    
    // Try to get enriched info
    if (selectedCategory?.parentName) {
      return (
        <>
          <span className="text-muted-foreground">{selectedCategory.parentIcon || selectedCategory.parentName} </span>
          <span className="text-muted-foreground mx-0.5">&gt;</span>
          <span> {currentCategory.icon} {currentCategory.name}</span>
        </>
      );
    }
    
    return (
      <>
        {currentCategory.icon} {currentCategory.name}
      </>
    );
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
              {getDisplayText()}
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
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            {groupedCategories.map((group, index) => (
              <CommandGroup 
                key={group.parent?.id || `group-${index}`} 
                heading={group.parent ? (
                  <span className="flex items-center gap-1">
                    {group.parent.icon} {group.parent.name}
                  </span>
                ) : undefined}
              >
                {group.children.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={category.fullName || category.name}
                    onSelect={() => handleSelect(category.id)}
                    className={cn(group.parent && "pl-4")}
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
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
