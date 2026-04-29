import { useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { usePrivacyMode } from "@/contexts/PrivacyContext";

export const MASKED_CURRENCY = "R$ ••••,••";

/**
 * Retorna um formatter de moeda que respeita o Modo Privacidade.
 * Quando o modo está ativo, retorna `R$ ••••,••` para qualquer valor.
 * Útil em props `formatter` / `tickFormatter` do Recharts e handlers.
 */
export function useFormatCurrency(): (value: number) => string {
  const { isHidden } = usePrivacyMode();
  return useCallback(
    (value: number) => (isHidden ? MASKED_CURRENCY : formatCurrency(value)),
    [isHidden]
  );
}
