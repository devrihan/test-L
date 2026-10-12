"use client";

import * as React from "react";
import { Pin, PinOff } from "lucide-react";

import { Button } from "./button";
import { cn } from "../../lib/utils";

type PinButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "size" | "variant" | "onClick"
> & {
  pinned: boolean;
  onPinChange?: (next: boolean) => void;
};

export function PinButton({
  pinned,
  onPinChange,
  className,
  ...rest
}: PinButtonProps) {
  return (
    <Button
      {...rest}
      type="button"
      variant={pinned ? "default" : "outline"}
      size="icon"
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin" : "Pin"}
      onClick={() => onPinChange?.(!pinned)}
      className={cn(className)}
    >
      {pinned ? (
        <Pin className="h-4 w-4" />
      ) : (
        <PinOff className="h-4 w-4" />
      )}
    </Button>
  );
}
