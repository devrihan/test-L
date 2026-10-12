"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "./button";
import { Input } from "./input";
import { cn } from "../../lib/utils";

type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
};

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: StepperProps) {
  const clamp = (n: number) => {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={disabled || (min !== undefined && value <= min)}
        onClick={() => onChange(clamp(value - step))}
        aria-label="Decrement"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(clamp(next));
        }}
        className={cn(
          "w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          inputClassName,
        )}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => onChange(clamp(value + step))}
        aria-label="Increment"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
