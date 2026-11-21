import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryIconPicker } from "../CategoryIconPicker";
import { CATEGORY_ICON_GROUPS } from "@/lib/categoryIcons";

const allIcons = CATEGORY_ICON_GROUPS.flatMap((g) => g.icons);

describe("CategoryIconPicker", () => {
  it("não repete ícone entre os grupos", () => {
    expect(new Set(allIcons).size).toBe(allIcons.length);
  });

  it("oferece os ícones aplicados na revisão de 11/2026", () => {
    for (const icon of ["🍱", "💼", "🎥", "🧾", "🚧", "🛫", "🩹", "🔑", "🧺", "🔄", "💵", "❓"]) {
      expect(allIcons).toContain(icon);
    }
  });

  it("marca o ícone atual e avisa a troca", () => {
    const onChange = vi.fn();
    render(<CategoryIconPicker value="🍱" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Ícone 🍱" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ícone 💼" }));
    expect(onChange).toHaveBeenCalledWith("💼");
  });

  it("reconhece o ícone gravado sem o seletor de variação", () => {
    render(<CategoryIconPicker value={"🍽"} onChange={() => {}} />);

    expect(screen.queryByText("Atual")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ícone 🍽️" })).toHaveAttribute("aria-pressed", "true");
  });

  it("mostra o ícone gravado que não está na lista, selecionado", () => {
    render(<CategoryIconPicker value="🦄" onChange={() => {}} />);

    expect(screen.getByText("Atual")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ícone 🦄" })).toHaveAttribute("aria-pressed", "true");
  });
});
