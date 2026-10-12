"use client"

import * as React from "react"
import { Direction as DirectionPrimitive } from "radix-ui"

type Direction = "ltr" | "rtl"

const DirectionContext = React.createContext<Direction>("ltr")

function DirectionProvider({
  direction = "ltr",
  dir,
  children,
  ...props
}: React.ComponentProps<typeof DirectionPrimitive.Provider> & {
  direction?: Direction
}) {
  const value = (dir || direction) as Direction

  return (
    <DirectionContext.Provider value={value}>
      <DirectionPrimitive.Provider dir={value} {...props}>
        {children}
      </DirectionPrimitive.Provider>
    </DirectionContext.Provider>
  )
}

function useDirection() {
  return React.useContext(DirectionContext)
}

export { DirectionProvider, useDirection, type Direction }
