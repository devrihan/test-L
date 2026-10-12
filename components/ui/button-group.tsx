import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import { Button } from "./button"

const buttonGroupVariants = cva(
  "inline-flex w-fit items-center rounded-md shadow-xs [&>*]:rounded-none [&>*]:shadow-none [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md [&>*:not(:first-child)]:-ml-px",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical:
          "flex-col [&>*:first-child]:rounded-t-md [&>*:first-child]:rounded-l-none [&>*:last-child]:rounded-b-md [&>*:last-child]:rounded-r-none [&>*:not(:first-child)]:-mt-px [&>*:not(:first-child)]:ml-0",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
)

function ButtonGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      data-slot="button-group"
      role="group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation, className }))}
      {...props}
    />
  )
}

function ButtonGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="button-group-text"
      className={cn(
        "inline-flex h-9 items-center justify-center border border-input bg-background px-3 text-sm font-medium",
        className
      )}
      {...props}
    />
  )
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
}) {
  return (
    <div
      data-slot="button-group-separator"
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-border",
        orientation === "vertical" ? "h-6 w-px" : "h-px w-6",
        className
      )}
      {...props}
    />
  )
}

function ButtonGroupButton({
  ...props
}: React.ComponentProps<typeof Button>) {
  return <Button data-slot="button-group-button" {...props} />
}

export {
  ButtonGroup,
  ButtonGroupButton,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
}
