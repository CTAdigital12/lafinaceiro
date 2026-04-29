import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ReactNode } from "react";
import { Currency } from "@/components/ui/currency";
import {
  PrivacyProvider,
  usePrivacyMode,
} from "@/contexts/PrivacyContext";

const Wrapper = ({ children }: { children: ReactNode }) => (
  <PrivacyProvider>{children}</PrivacyProvider>
);

/** Helper que dá acesso ao toggle do contexto a partir do teste. */
function useTogglerRef() {
  let toggle: () => void = () => {};
  let setHidden: (v: boolean) => void = () => {};

  function Probe() {
    const ctx = usePrivacyMode();
    toggle = ctx.toggle;
    setHidden = ctx.setHidden;
    return null;
  }

  return {
    Probe,
    fire: () => act(() => toggle()),
    setHidden: (v: boolean) => act(() => setHidden(v)),
  };
}

// Helper pra normalizar NBSP (U+00A0) que o Intl.NumberFormat insere entre "R$" e o valor
const NBSP = "\u00A0";
const norm = (s: string | null) => (s ?? "").replace(new RegExp(NBSP, "g"), " ");

describe("<Currency />", () => {
  it("renderiza valor formatado em BRL quando privacy OFF", () => {
    render(
      <Wrapper>
        <Currency value={1234.56} />
      </Wrapper>
    );
    expect(norm(screen.getByText(/R\$/).textContent)).toBe("R$ 1.234,56");
  });

  it("renderiza R$ ••••,•• quando privacy ON", () => {
    const { Probe, setHidden } = useTogglerRef();
    render(
      <Wrapper>
        <Probe />
        <Currency value={1234.56} />
      </Wrapper>
    );

    setHidden(true);

    const el = screen.getByLabelText("Valor oculto");
    expect(el).toHaveTextContent("R$ ••••,••");
  });

  it("valor 0 renderiza R$ 0,00 quando OFF e mascarado quando ON", () => {
    const { Probe, fire } = useTogglerRef();
    const { container } = render(
      <Wrapper>
        <Probe />
        <Currency value={0} />
      </Wrapper>
    );

    expect(norm(container.textContent)).toBe("R$ 0,00");
    fire();
    expect(container.textContent).toBe("R$ ••••,••");
  });

  it("valor negativo (-100) é formatado quando OFF e mascarado igual quando ON", () => {
    const { Probe, fire } = useTogglerRef();
    const { container } = render(
      <Wrapper>
        <Probe />
        <Currency value={-100} />
      </Wrapper>
    );

    // pt-BR: "-R$ 100,00" (com NBSP entre R$ e número)
    const off = norm(container.textContent);
    expect(off).toMatch(/-\s?R\$\s?100,00/);

    fire();
    expect(container.textContent).toBe("R$ ••••,••");
  });

  it("hiddenOverride={true} força modo oculto independente do contexto OFF", () => {
    render(
      <Wrapper>
        <Currency value={500} hiddenOverride />
      </Wrapper>
    );
    expect(screen.getByLabelText("Valor oculto")).toHaveTextContent(
      "R$ ••••,••"
    );
  });

  it("hiddenOverride={false} força modo visível independente do contexto ON", () => {
    const { Probe, setHidden } = useTogglerRef();
    render(
      <Wrapper>
        <Probe />
        <Currency value={500} hiddenOverride={false} />
      </Wrapper>
    );

    setHidden(true);
    // Mesmo com contexto hidden, o override força visível
    expect(screen.queryByLabelText("Valor oculto")).toBeNull();
    expect(norm(screen.getByText(/R\$/).textContent)).toBe("R$ 500,00");
  });

  it("aplica className passada (modo OFF e ON)", () => {
    const { Probe, setHidden } = useTogglerRef();
    const { container, rerender } = render(
      <Wrapper>
        <Probe />
        <Currency value={10} className="text-rose-600 minha-classe" />
      </Wrapper>
    );

    expect(container.firstChild as HTMLElement).toHaveClass("minha-classe");
    expect(container.firstChild as HTMLElement).toHaveClass("text-rose-600");

    setHidden(true);
    rerender(
      <Wrapper>
        <Probe />
        <Currency value={10} className="text-rose-600 minha-classe" />
      </Wrapper>
    );

    expect(screen.getByLabelText("Valor oculto")).toHaveClass("minha-classe");
    expect(screen.getByLabelText("Valor oculto")).toHaveClass("text-rose-600");
  });

  it("maskedText customizado funciona", () => {
    render(
      <Wrapper>
        <Currency value={10} hiddenOverride maskedText="*** PRIVADO ***" />
      </Wrapper>
    );
    expect(screen.getByLabelText("Valor oculto")).toHaveTextContent(
      "*** PRIVADO ***"
    );
  });
});
