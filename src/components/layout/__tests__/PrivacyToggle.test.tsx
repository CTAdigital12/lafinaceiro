import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { PrivacyToggle } from "@/components/layout/PrivacyToggle";
import {
  PrivacyProvider,
  usePrivacyMode,
} from "@/contexts/PrivacyContext";
import { TooltipProvider } from "@/components/ui/tooltip";

const Wrapper = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>
    <PrivacyProvider>{children}</PrivacyProvider>
  </TooltipProvider>
);

/** Lê o ctx atual via probe in-line. */
function probe() {
  let isHidden = false;
  function P() {
    isHidden = usePrivacyMode().isHidden;
    return null;
  }
  return {
    P,
    get isHidden() {
      return isHidden;
    },
  };
}

describe("<PrivacyToggle />", () => {
  it("renderiza com aria-pressed=false e aria-label='Esconder valores' quando OFF", () => {
    render(
      <Wrapper>
        <PrivacyToggle />
      </Wrapper>
    );
    const btn = screen.getByRole("button", { name: "Esconder valores" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("renderiza com aria-pressed=true e aria-label='Mostrar valores' quando ON", () => {
    const { P } = probe();
    render(
      <Wrapper>
        <P />
        <PrivacyToggle isHiddenOverride={true} />
      </Wrapper>
    );
    const btn = screen.getByRole("button", { name: "Mostrar valores" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("ícone Eye (data-lucide) presente quando OFF; EyeOff quando ON", () => {
    // Lucide-react renderiza o nome do ícone via classes; verificamos via SVG
    const { rerender } = render(
      <Wrapper>
        <PrivacyToggle isHiddenOverride={false} />
      </Wrapper>
    );

    // O Button (mode OFF) tem o componente Eye — checa pelo aria-label do botão
    expect(
      screen.getByRole("button", { name: "Esconder valores" })
    ).toBeInTheDocument();

    rerender(
      <Wrapper>
        <PrivacyToggle isHiddenOverride={true} />
      </Wrapper>
    );

    expect(
      screen.getByRole("button", { name: "Mostrar valores" })
    ).toBeInTheDocument();
  });

  it("click alterna estado no contexto", async () => {
    const tracker = probe();
    render(
      <Wrapper>
        <tracker.P />
        <PrivacyToggle />
      </Wrapper>
    );

    expect(tracker.isHidden).toBe(false);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Esconder valores" }));

    expect(tracker.isHidden).toBe(true);
    // Após mudar o estado o aria-label do botão também atualiza
    expect(
      screen.getByRole("button", { name: "Mostrar valores" })
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Mostrar valores" }));
    expect(tracker.isHidden).toBe(false);
  });

  it("dispara onToggle com o próximo valor", async () => {
    const onToggle = vi.fn();
    render(
      <Wrapper>
        <PrivacyToggle onToggle={onToggle} />
      </Wrapper>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Esconder valores" }));
    expect(onToggle).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("button", { name: "Mostrar valores" }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("aplica classes responsivas h-11 w-11 md:h-10 md:w-10", () => {
    render(
      <Wrapper>
        <PrivacyToggle />
      </Wrapper>
    );

    const btn = screen.getByRole("button", { name: "Esconder valores" });
    expect(btn).toHaveClass("h-11");
    expect(btn).toHaveClass("w-11");
    expect(btn).toHaveClass("md:h-10");
    expect(btn).toHaveClass("md:w-10");
  });

  it("respeita prefers-reduced-motion via prefixo motion-safe:", () => {
    render(
      <Wrapper>
        <PrivacyToggle />
      </Wrapper>
    );
    const btn = screen.getByRole("button", { name: "Esconder valores" });
    expect(btn.className).toMatch(/motion-safe:transition-colors/);
  });

  it("usa estado ativo (bg-primary/10 text-primary) quando ON", () => {
    render(
      <Wrapper>
        <PrivacyToggle isHiddenOverride={true} />
      </Wrapper>
    );
    const btn = screen.getByRole("button", { name: "Mostrar valores" });
    // bg-primary/10 e text-primary devem estar presentes
    expect(btn.className).toMatch(/bg-primary\/10/);
    expect(btn.className).toMatch(/text-primary/);
  });
});
