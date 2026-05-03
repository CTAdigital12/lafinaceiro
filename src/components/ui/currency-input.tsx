import * as React from "react";
import { NumericFormat, type NumericFormatProps } from "react-number-format";

import { Input } from "@/components/ui/input";

export interface CurrencyInputProps
  extends Omit<
    NumericFormatProps,
    "value" | "onValueChange" | "customInput" | "thousandSeparator" | "decimalSeparator" | "decimalScale"
  > {
  /** Numeric value in BRL. Pass `undefined` for empty. */
  value: number | undefined;
  /** Receives the parsed float; `undefined` when the field is empty. */
  onValueChange: (value: number | undefined) => void;
  /** Show the "R$ " prefix. Default true. */
  withPrefix?: boolean;
  /** Force fixed 2 decimal places (e.g. 1234.5 → "1.234,50"). Default false. */
  fixedDecimalScale?: boolean;
  /** Forwarded to the underlying input. */
  className?: string;
  /** Forwarded to the underlying input. */
  id?: string;
  /** Forwarded to the underlying input. */
  required?: boolean;
  /** Forwarded to the underlying input. */
  placeholder?: string;
  /** Forwarded to the underlying input. */
  disabled?: boolean;
  /** Forwarded to the underlying input. */
  autoFocus?: boolean;
  /** Forwarded to the underlying input. */
  name?: string;
}

/**
 * pt-BR currency input. Formats with `.` thousand separator and `,` decimal
 * separator, returns a parsed float via `onValueChange`. Uses
 * `inputMode="decimal"` so iOS shows the numeric keypad.
 *
 * Example:
 *   <CurrencyInput value={amount} onValueChange={setAmount} />
 *   // user types "1234,56" → setAmount(1234.56)
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onValueChange,
      withPrefix = true,
      fixedDecimalScale = false,
      placeholder,
      ...rest
    },
    ref,
  ) => {
    return (
      <NumericFormat
        getInputRef={ref}
        customInput={Input}
        value={value ?? ""}
        onValueChange={(values) => {
          onValueChange(values.floatValue);
        }}
        thousandSeparator="."
        decimalSeparator=","
        decimalScale={2}
        fixedDecimalScale={fixedDecimalScale}
        allowNegative={false}
        prefix={withPrefix ? "R$ " : undefined}
        inputMode="decimal"
        placeholder={placeholder ?? (withPrefix ? "R$ 0,00" : "0,00")}
        {...rest}
      />
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
