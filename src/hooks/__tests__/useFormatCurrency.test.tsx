import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ReactNode } from "react";
import {
  useFormatCurrency,
  MASKED_CURRENCY,
} from "@/hooks/useFormatCurrency";
import {
  PrivacyProvider,
  usePrivacyMode,
} from "@/contexts/PrivacyContext";

const wrapper = ({ children }: { children: ReactNode }) => (
  <PrivacyProvider>{children}</PrivacyProvider>
);

const NBSP = "\u00A0";
const norm = (s: string) => s.replace(new RegExp(NBSP, "g"), " ");

// Eslint react-hooks/rules-of-hooks exige que hooks customizados comecem com "use".
// Esses helpers agregam dois hooks num único renderHook.
function useFmtAndCtx() {
  const fmt = useFormatCurrency();
  const ctx = usePrivacyMode();
  return { fmt, ctx };
}

describe("useFormatCurrency", () => {
  it("retorna uma função formatter", () => {
    const { result } = renderHook(() => useFormatCurrency(), { wrapper });
    expect(typeof result.current).toBe("function");
  });

  it("retorna valor formatado em BRL quando OFF", () => {
    const { result } = renderHook(() => useFormatCurrency(), { wrapper });
    expect(norm(result.current(1234.56))).toBe("R$ 1.234,56");
    expect(norm(result.current(0))).toBe("R$ 0,00");
    expect(norm(result.current(-100))).toMatch(/-\s?R\$\s?100,00/);
  });

  it("retorna R$ ••••,•• quando ON, para qualquer valor", () => {
    const { result } = renderHook(useFmtAndCtx, { wrapper });

    act(() => result.current.ctx.setHidden(true));

    expect(result.current.fmt(0)).toBe(MASKED_CURRENCY);
    expect(result.current.fmt(1000)).toBe(MASKED_CURRENCY);
    expect(result.current.fmt(-9999.99)).toBe(MASKED_CURRENCY);
  });

  it("re-renderiza/atualiza quando contexto muda", () => {
    const { result, rerender } = renderHook(useFmtAndCtx, { wrapper });

    expect(norm(result.current.fmt(50))).toBe("R$ 50,00");

    act(() => result.current.ctx.toggle());
    rerender();

    expect(result.current.fmt(50)).toBe(MASKED_CURRENCY);

    act(() => result.current.ctx.toggle());
    rerender();

    expect(norm(result.current.fmt(50))).toBe("R$ 50,00");
  });

  it("MASKED_CURRENCY exporta o literal esperado", () => {
    expect(MASKED_CURRENCY).toBe("R$ ••••,••");
  });
});
