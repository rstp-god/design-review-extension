import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@/styles/popup.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { createI18n } from '@/i18n'
import { FloatingRootProvider } from '@/ui'
import { App } from './App'

/**
 * Popup entry. Fonts are bundled from `@fontsource-variable` (no network); floating UI renders
 * into `#floating`, a sibling of the React root in our own document.
 */
const container = document.getElementById('root')
const floating = document.getElementById('floating')
if (!container || !floating) {
  throw new Error('Popup root elements not found')
}

const i18n = createI18n()
document.documentElement.lang = i18n.language

createRoot(container).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <FloatingRootProvider container={floating}>
        <App />
      </FloatingRootProvider>
    </I18nextProvider>
  </StrictMode>,
)
