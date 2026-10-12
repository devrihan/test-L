'use client'

import { createContext, useContext, useEffect, useState, type DependencyList, type ReactNode } from 'react'

type BreadcrumbContextValue = {
  breadcrumb: ReactNode
  setBreadcrumb: (node: ReactNode) => void
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [breadcrumb, setBreadcrumb] = useState<ReactNode>(null)
  return (
    <BreadcrumbContext.Provider value={{ breadcrumb, setBreadcrumb }}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

function useBreadcrumbContext() {
  const ctx = useContext(BreadcrumbContext)
  if (!ctx) throw new Error('useBreadcrumbContext must be used within a BreadcrumbProvider')
  return ctx
}

// Read side, used once by the dashboard shell's top bar.
export function useBreadcrumb() {
  return useBreadcrumbContext().breadcrumb
}

// Write side — detail pages call this to render their crumb (name + any
// switcher dropdown) into the dashboard top bar instead of owning their own
// header. `deps` gates re-registration the same way a useEffect dep list
// would; omit values (like router) that are stable across renders.
export function usePageBreadcrumb(node: ReactNode, deps: DependencyList) {
  const { setBreadcrumb } = useBreadcrumbContext()
  useEffect(() => {
    setBreadcrumb(node)
    return () => setBreadcrumb(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
