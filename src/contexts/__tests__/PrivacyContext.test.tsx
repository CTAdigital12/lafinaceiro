import { describe, it, expect, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { ReactNode } from "react";
import {
  PrivacyProvider,
  usePrivacyMode,
} from "@/contexts/PrivacyContext";

const STORAGE_KEY = "lafinaceiro:privacy-mode";

const wrapper = ({ children }: { children: ReactNode }) => (
  <PrivacyProvider>{children}</PrivacyProvider>
);

describe("PrivacyContext", () => {
  it("usePrivacyMode lança erro com mensagem clara fora do Provider", () => {
    // Suprime o error boundary do React no console
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function Boom() {
      usePrivacyMode();
      return null;
    }

    expect(() => render(<Boom />)).toThrow(
      /usePrivacyMode must be used within PrivacyProvider/
    );

    spy.mockRestore();
  });

  it("default isHidden = false", () => {
    const { result } = renderHook(() => usePrivacyMode(), { wrapper });
    expect(result.current.isHidden).toBe(false);
  });

  it("toggle() alterna estado", () => {
    const { result } = renderHook(() => usePrivacyMode(), { wrapper });

    expect(result.current.isHidden).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.isHidden).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isHidden).toBe(false);
  });

  it("setHidden(true) força true; setHidden(false) força false", () => {
    const { result } = renderHook(() => usePrivacyMode(), { wrapper });

    act(() => result.current.setHidden(true));
    expect(result.current.isHidden).toBe(true);

    act(() => result.current.setHidden(true)); // idempotente
    expect(result.current.isHidden).toBe(true);

    act(() => result.current.setHidden(false));
    expect(result.current.isHidden).toBe(false);
  });

  it("persiste em localStorage quando isHidden muda", () => {
    const { result } = renderHook(() => usePrivacyMode(), { wrapper });

    // Após o mount, o initial effect já gravou "false"
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");

    act(() => result.current.toggle());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");

    act(() => result.current.toggle());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("hidrata do localStorage no mount quando valor é 'true'", () => {
    window.localStorage.setItem(STORAGE_KEY, "true");

    const { result } = renderHook(() => usePrivacyMode(), { wrapper });

    expect(result.current.isHidden).toBe(true);
  });

  it("hidrata do localStorage no mount quando valor é 'false'", () => {
    window.localStorage.setItem(STORAGE_KEY, "false");

    const { result } = renderHook(() => usePrivacyMode(), { wrapper });

    expect(result.current.isHidden).toBe(false);
  });

  it("ignora valores inválidos no localStorage e usa default", () => {
    window.localStorage.setItem(STORAGE_KEY, "garbage");

    const { result } = renderHook(() => usePrivacyMode(), { wrapper });

    expect(result.current.isHidden).toBe(false);
  });

  it("propaga isHidden para componentes consumidores", () => {
    function Probe() {
      const { isHidden, toggle } = usePrivacyMode();
      return (
        <button onClick={toggle} data-testid="probe">
          {isHidden ? "ON" : "OFF"}
        </button>
      );
    }

    render(
      <PrivacyProvider>
        <Probe />
      </PrivacyProvider>
    );

    expect(screen.getByTestId("probe")).toHaveTextContent("OFF");
    act(() => screen.getByTestId("probe").click());
    expect(screen.getByTestId("probe")).toHaveTextContent("ON");
  });
});
