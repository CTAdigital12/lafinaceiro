import { cn, formatCurrency } from "@/lib/utils";
import { usePrivacyMode } from "@/contexts/PrivacyContext";
import { MASKED_CURRENCY } from "@/hooks/useFormatCurrency";

interface CurrencyProps {
  value: number;
  className?: string;
  /**
   * Se passado, ignora o estado do PrivacyContext (útil em testes/storybook).
   */
  hiddenOverride?: boolean;
  /**
   * Texto exibido quando os valores estão ocultos.
   * @default "R$ ••••,••"
   */
  maskedText?: string;
}

/**
 * Renderiza um valor monetário em BRL respeitando o Modo Privacidade.
 * Quando ativo, substitui o número por `R$ ••••,••`.
 */
export function Currency({
  value,
  className,
  hiddenOverride,
  maskedText = MASKED_CURRENCY,
}: CurrencyProps) {
  const { isHidden } = usePrivacyMode();
  const hidden = hiddenOverride ?? isHidden;

  if (hidden) {
    return (
      <span
        className={cn("font-mono tracking-wider tabular-nums", className)}
        aria-label="Valor oculto"
      >
        {maskedText}
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>{formatCurrency(value)}</span>
  );
}
