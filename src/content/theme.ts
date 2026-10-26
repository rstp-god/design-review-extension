import type { Theme } from '@/shared/model'

export type ResolvedTheme = 'light' | 'dark'

export function resolveTheme(theme: Theme, prefersLight: boolean): ResolvedTheme {
  if (theme === 'system') return prefersLight ? 'light' : 'dark'
  return theme
}

/**
 * Writes the resolved theme to `data-theme` on the overlay host; tokens.css switches the
 * palette from there. `system` follows `prefers-color-scheme` live. Returns the cleanup.
 */
export function applyTheme(host: HTMLElement, theme: Theme, win: Window = window): () => void {
  const media =
    typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: light)') : null
  const update = () => {
    host.setAttribute('data-theme', resolveTheme(theme, media?.matches ?? false))
  }

  update()
  if (!media || theme !== 'system') return () => {}

  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}
