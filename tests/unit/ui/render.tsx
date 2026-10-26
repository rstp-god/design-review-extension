import { type RenderOptions, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FloatingRootProvider } from '@/ui/FloatingRoot'

/**
 * Renders inside a `FloatingRootProvider` whose container is a dedicated element, so tests can
 * assert that floating UI lands there and nowhere else.
 */
export function renderWithFloatingRoot(ui: ReactElement, options?: RenderOptions) {
  const floatingRoot = document.createElement('div')
  floatingRoot.id = 'floating-root'
  document.body.append(floatingRoot)

  const result = render(
    <FloatingRootProvider container={floatingRoot}>{ui}</FloatingRootProvider>,
    options,
  )

  return {
    ...result,
    floatingRoot,
    unmount: () => {
      result.unmount()
      floatingRoot.remove()
    },
  }
}
