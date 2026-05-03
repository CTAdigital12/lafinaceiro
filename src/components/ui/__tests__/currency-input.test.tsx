import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurrencyInput } from "@/components/ui/currency-input";

const lastEmittedValue = (fn: Mock): unknown => {
  const calls = fn.mock.calls;
  return calls[calls.length - 1]?.[0];
};

describe("CurrencyInput", () => {
  it("renders empty state with R$ prefix and placeholder", () => {
    render(<CurrencyInput value={undefined} onValueChange={() => {}} />);
    const input = screen.getByPlaceholderText("R$ 0,00");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("formats a numeric value with pt-BR thousand+decimal separators", () => {
    render(<CurrencyInput value={1234.56} onValueChange={() => {}} />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;
    expect(input.value).toBe("R$ 1.234,56");
  });

  it("emits the parsed float when the user types digits without separators", () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value={undefined} onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "9750" } });

    // No comma typed → integer, no decimal inferred
    expect(lastEmittedValue(onValueChange)).toBe(9750);
  });

  it("parses pt-BR comma decimals correctly", () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value={undefined} onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "97,50" } });

    expect(lastEmittedValue(onValueChange)).toBe(97.5);
  });

  it("parses pt-BR thousand separators correctly", () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value={undefined} onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1.234,56" } });

    expect(lastEmittedValue(onValueChange)).toBe(1234.56);
  });

  it("emits undefined when the field is cleared", () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value={1234.56} onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });

    expect(onValueChange).toHaveBeenLastCalledWith(undefined);
  });

  it("uses inputMode=decimal so iOS shows the numeric keypad", () => {
    render(<CurrencyInput value={undefined} onValueChange={() => {}} />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;
    expect(input.inputMode).toBe("decimal");
  });

  it("hides the R$ prefix when withPrefix=false", () => {
    render(
      <CurrencyInput value={42} onValueChange={() => {}} withPrefix={false} />,
    );
    const input = screen.getByPlaceholderText("0,00") as HTMLInputElement;
    expect(input.value).toBe("42");
  });

  it("rejects negative values (allowNegative defaults to false)", () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value={undefined} onValueChange={onValueChange} />);
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "-100" } });

    // The lib strips the minus before emitting
    const lastValue = lastEmittedValue(onValueChange) as number | undefined;
    expect(lastValue ?? 0).not.toBeLessThan(0);
  });

  it("respects fixedDecimalScale by padding to 2 decimals", () => {
    render(
      <CurrencyInput
        value={1234.5}
        onValueChange={() => {}}
        fixedDecimalScale
      />,
    );
    const input = screen.getByPlaceholderText("R$ 0,00") as HTMLInputElement;
    expect(input.value).toBe("R$ 1.234,50");
  });
});
