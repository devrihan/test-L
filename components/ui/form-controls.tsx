"use client"

import * as React from "react"

import { cn } from "../../lib/utils"
import { Checkbox } from "./checkbox"
import { Input } from "./input"
import { Label } from "./label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"
import { Textarea } from "./textarea"

function FormControlGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="form-control-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

function TextInputControl({
  label,
  description,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  label?: React.ReactNode
  description?: React.ReactNode
}) {
  const id = React.useId()

  return (
    <FormControlGroup className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Input id={id} {...props} />
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </FormControlGroup>
  )
}

function TextareaControl({
  label,
  description,
  className,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  label?: React.ReactNode
  description?: React.ReactNode
}) {
  const id = React.useId()

  return (
    <FormControlGroup className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Textarea id={id} {...props} />
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </FormControlGroup>
  )
}

function CheckboxControl({
  label,
  className,
  ...props
}: React.ComponentProps<typeof Checkbox> & {
  label?: React.ReactNode
}) {
  const id = React.useId()

  return (
    <div
      data-slot="checkbox-control"
      className={cn("flex items-center gap-2", className)}
    >
      <Checkbox id={id} {...props} />
      {label && <Label htmlFor={id}>{label}</Label>}
    </div>
  )
}

function SelectControl({
  label,
  placeholder = "Select an option",
  options,
  className,
  ...props
}: React.ComponentProps<typeof Select> & {
  label?: React.ReactNode
  placeholder?: string
  options: Array<{ label: React.ReactNode; value: string }>
  className?: string
}) {
  return (
    <FormControlGroup className={className}>
      {label && <Label>{label}</Label>}
      <Select {...props}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormControlGroup>
  )
}

export {
  FormControlGroup,
  TextInputControl,
  TextareaControl,
  CheckboxControl,
  SelectControl,
}
