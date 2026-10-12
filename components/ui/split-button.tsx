"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "../../lib/utils";

type SplitButtonProps = Omit<React.ComponentProps<typeof Button>, "children"> & {
  label: React.ReactNode;
  onAction?: () => void;
  menuContent: React.ReactNode;
  menuAlign?: "start" | "center" | "end";
};

export function SplitButton({
  label,
  onAction,
  menuContent,
  menuAlign = "end",
  variant = "default",
  size = "default",
  disabled,
  className,
  ...rest
}: SplitButtonProps) {
  return (
    <div className={cn("inline-flex isolate", className)}>
      <Button
        {...rest}
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={onAction}
        className="rounded-r-none focus:z-10"
      >
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            size={size}
            disabled={disabled}
            aria-label="More options"
            className="-ms-px rounded-l-none px-2 focus:z-10"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={menuAlign}>
          {menuContent}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
