import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePrivacyMode } from "@/contexts/PrivacyContext";

interface PrivacyToggleProps {
  /**
   * Força o estado visual (útil em testes/storybook). Se passado, ignora o context.
   */
  isHiddenOverride?: boolean;
  /**
   * Callback opcional disparado após o toggle, com o próximo valor.
   */
  onToggle?: (next: boolean) => void;
  className?: string;
}

export function PrivacyToggle({
  isHiddenOverride,
  onToggle,
  className,
}: PrivacyToggleProps) {
  const { isHidden, toggle } = usePrivacyMode();
  const active = isHiddenOverride ?? isHidden;

  const label = active ? "Mostrar valores" : "Esconder valores";
  const Icon = active ? EyeOff : Eye;

  const handleClick = () => {
    toggle();
    onToggle?.(!active);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClick}
          aria-pressed={active}
          aria-label={label}
          className={cn(
            "h-11 w-11 md:h-10 md:w-10 motion-safe:transition-colors motion-safe:duration-150",
            active
              ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
            className
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
