"use client";

import { useMemo } from "react";
import { SorobanBalance } from "@/src/utils/sorobanMath";

interface FormattedBalanceProps {
  value: SorobanBalance;
  locale?: string;
  "aria-label"?: string;
}

const FALLBACK = "—";

export function FormattedBalance({
  value,
  locale = "en-US",
  "aria-label": ariaLabel,
}: FormattedBalanceProps) {
  const display = useMemo(() => {
    try {
      return value.toDisplay(locale);
    } catch {
      return FALLBACK;
    }
  }, [value, locale]);

  if (display === FALLBACK) {
    return (
      <span role="status" aria-label="Balance unavailable" className="text-muted-foreground">
        {FALLBACK}
      </span>
    );
  }

  return (
    <span
      role="text"
      aria-label={ariaLabel ?? `${display} tokens`}
      className="tabular-nums font-mono"
    >
      {display}
    </span>
  );
}
