import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  groupCategoriesByParent,
  type Category,
} from "@/hooks/useCategories";

interface CategoryComboboxProps {
  categories: Category[];
  value: string;
  onChange: (categoryId: string) => void;
  /** Optional set of category ids to disable (e.g. categories already
   *  budgeted for the same period). */
  disabledIds?: Set<string>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  /** Whether the trigger should aria-label as combobox. Default true. */
  ariaCombobox?: boolean;
}

/**
 * Hierarchical category picker (parent → children) with search.
 * Shared between NewBudgetModal, EditBudgetModal, and any future budget UI.
 *
 * The categories prop should already be filtered by type (expense/income).
 */
export function CategoryCombobox({
  categories,
  value,
  onChange,
  disabledIds,
  placeholder = "Selecione uma categoria",
  searchPlaceholder = "Buscar categoria...",
  emptyMessage = "Nenhuma categoria encontrada.",
  className,
  disabled,
  ariaCombobox = true,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role={ariaCombobox ? "combobox" : undefined}
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span className="shrink-0">{selected.icon}</span>
              <span className="truncate">
                {selected.fullName || selected.name}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groupCategoriesByParent(categories).map((group, groupIndex) => (
              <CommandGroup
                key={groupIndex}
                heading={
                  group.parent
                    ? `${group.parent.icon} ${group.parent.name}`
                    : undefined
                }
              >
                {group.children.map((category) => {
                  const isDisabled = disabledIds?.has(category.id) ?? false;
                  return (
                    <CommandItem
                      key={category.id}
                      value={category.fullName || category.name}
                      disabled={isDisabled}
                      onSelect={() => {
                        if (isDisabled) return;
                        onChange(category.id);
                        setOpen(false);
                      }}
                      className={cn(
                        group.parent ? "pl-4" : "",
                        isDisabled && "opacity-50",
                      )}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === category.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="mr-2">{category.icon}</span>
                      <span className="flex-1 truncate">
                        {group.parent
                          ? category.name
                          : category.fullName || category.name}
                      </span>
                      {isDisabled && (
                        <span className="ml-auto text-xs text-muted-foreground shrink-0">
                          já no plano
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
