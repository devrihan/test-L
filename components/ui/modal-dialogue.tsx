"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Button } from "./button";

type ConfirmVariant = "default" | "destructive";

type ModalDialogueProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  trigger?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  confirmVariant?: ConfirmVariant;
  confirmLoading?: boolean;
  hideFooter?: boolean;
};

export function ModalDialogue({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  onCancel,
  onConfirm,
  confirmVariant = "default",
  confirmLoading = false,
  hideFooter = false,
}: ModalDialogueProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children ? <div className="py-2">{children}</div> : null}
        {!hideFooter ? (
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                onCancel?.();
                onOpenChange?.(false);
              }}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={confirmVariant}
              type="button"
              disabled={confirmLoading}
              onClick={() => onConfirm?.()}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
