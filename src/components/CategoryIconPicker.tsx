import { cn } from "@/lib/utils";
import { CATEGORY_ICON_GROUPS, normalizeIcon as normalize } from "@/lib/categoryIcons";

const KNOWN_ICONS = new Set(CATEGORY_ICON_GROUPS.flatMap((g) => g.icons.map(normalize)));

interface CategoryIconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function CategoryIconPicker({ value, onChange }: CategoryIconPickerProps) {
  // Ícone gravado que não está na lista: mostra mesmo assim, senão editar a
  // categoria esconderia o ícone atual e qualquer clique o trocaria sem querer.
  const groups =
    value && !KNOWN_ICONS.has(normalize(value))
      ? [{ label: "Atual", icons: [value] }, ...CATEGORY_ICON_GROUPS]
      : CATEGORY_ICON_GROUPS;

  return (
    <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1 text-xs text-muted-foreground">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.icons.map((emoji) => {
              const selected = normalize(value) === normalize(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Ícone ${emoji}`}
                  aria-pressed={selected}
                  onClick={() => onChange(emoji)}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-all",
                    selected
                      ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                      : "bg-muted hover:bg-muted/80",
                  )}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
