"use client";

import * as React from "react";
import { Send } from "lucide-react";

import { Button } from "./button";
import { Textarea } from "./textarea";
import { cn } from "../../lib/utils";

type ChatbarProps = {
  value: string;
  onChange: (next: string) => void;
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  sendLabel?: string;
  rows?: number;
};

export function Chatbar({
  value,
  onChange,
  onSend,
  placeholder = "Type a message…",
  disabled,
  className,
  leading,
  trailing,
  sendLabel = "Send",
  rows = 1,
}: ChatbarProps) {
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-md border bg-background p-2 shadow-xs",
        "focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring",
        className,
      )}
    >
      {leading ? <div className="flex items-center">{leading}</div> : null}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(
          "min-h-9 flex-1 resize-none border-0 bg-transparent shadow-none",
          "focus-visible:ring-0 focus-visible:border-transparent",
        )}
      />
      {trailing ? <div className="flex items-center">{trailing}</div> : null}
      <Button
        type="button"
        size="icon"
        disabled={disabled || !value.trim()}
        onClick={submit}
        aria-label={sendLabel}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
