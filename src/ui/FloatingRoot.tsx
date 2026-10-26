import { createContext, type ReactNode, useContext } from 'react'

/**
 * Where menus, tooltips and dialogs are portalled. In the overlay this is a container inside our
 * shadow root (never `document.body`, which belongs to the host page); in the popup it is a div
 * of our own document. Rendering without a provider is a bug in the overlay, so `useFloatingRoot`
 * throws instead of silently falling back to `body`.
 */
const FloatingRootContext = createContext<HTMLElement | null>(null)

export function FloatingRootProvider({
  container,
  children,
}: {
  container: HTMLElement
  children: ReactNode
}) {
  return <FloatingRootContext.Provider value={container}>{children}</FloatingRootContext.Provider>
}

export function useFloatingRoot(): HTMLElement {
  const container = useContext(FloatingRootContext)
  if (!container) {
    throw new Error('Floating UI needs a FloatingRootProvider above it')
  }
  return container
}
