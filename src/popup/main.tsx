import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APP_NAME } from '@/shared/constants'

/**
 * Placeholder popup. The real one (home, settings, restricted-page state) lands with
 * `feature/extension-shell`; this only proves the React + crxjs toolchain end to end.
 */
const container = document.getElementById('root')
if (!container) {
  throw new Error('Popup root element not found')
}

createRoot(container).render(
  <StrictMode>
    <main>
      <h1>{APP_NAME}</h1>
    </main>
  </StrictMode>,
)
