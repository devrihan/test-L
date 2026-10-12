import * as React from "react"

import { cn } from "../../lib/utils"

function TypographyH1({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="typography-h1"
      className={cn(
        "scroll-m-20 text-[3rem]/[3.3rem] font-bold tracking-[-0.015em] text-balance",
        className
      )}
      {...props}
    />
  )
}

function TypographyH2({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="typography-h2"
      className={cn(
        "scroll-m-20 text-[1.875rem]/[2.25rem] font-semibold tracking-[-0.005em] first:mt-0",
        className
      )}
      {...props}
    />
  )
}

function TypographyH3({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="typography-h3"
      className={cn(
        "scroll-m-20 text-[1.5rem]/[1.875rem] font-semibold tracking-[-0.0025em]",
        className
      )}
      {...props}
    />
  )
}

function TypographyH4({ className, ...props }: React.ComponentProps<"h4">) {
  return (
    <h4
      data-slot="typography-h4"
      className={cn("scroll-m-20 text-[1.25rem]/[1.625rem] font-semibold", className)}
      {...props}
    />
  )
}

function TypographyP({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="typography-p"
      className={cn("text-[1rem]/[1.5rem] [&:not(:first-child)]:mt-6", className)}
      {...props}
    />
  )
}

function TypographyBlockquote({
  className,
  ...props
}: React.ComponentProps<"blockquote">) {
  return (
    <blockquote
      data-slot="typography-blockquote"
      className={cn("mt-6 border-l-2 pl-6 text-[1rem]/[1.6rem] italic", className)}
      {...props}
    />
  )
}

function TypographyList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="typography-list"
      className={cn("my-6 ml-6 list-disc text-[1rem]/[1.6rem] [&>li]:mt-2", className)}
      {...props}
    />
  )
}

function TypographyInlineCode({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      data-slot="typography-inline-code"
      className={cn(
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-[0.875rem]/[1.225rem] font-medium",
        className
      )}
      {...props}
    />
  )
}

function TypographyLead({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="typography-lead"
      className={cn("text-[1.25rem]/[1.75rem] text-muted-foreground", className)}
      {...props}
    />
  )
}

function TypographyLarge({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="typography-large"
      className={cn("text-[1.125rem]/[1.4625rem] font-semibold", className)}
      {...props}
    />
  )
}

function TypographySmall({ className, ...props }: React.ComponentProps<"small">) {
  return (
    <small
      data-slot="typography-small"
      className={cn("text-[0.875rem]/[1.225rem] font-medium", className)}
      {...props}
    />
  )
}

function TypographyMuted({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="typography-muted"
      className={cn("text-[0.875rem]/[1.225rem] text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  TypographyBlockquote,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLarge,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyP,
  TypographySmall,
}
