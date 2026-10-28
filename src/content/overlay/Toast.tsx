import { TestId } from '@tests/constants/testIds'
import { useEffect } from 'react'
import { useT } from '@/content/i18n'
import { useOverlayStore } from '@/content/store/overlay'
import { surfaceProps } from './surfaces'

export const TOAST_MS = 4_000

/**
 * One short status line above the bottom hint: "snapshot closed", "could not take the snapshot".
 * Announced as a status, never interactive, gone after four seconds. A newer toast replaces it.
 */
export function Toast() {
  const t = useT('overlay')
  const toast = useOverlayStore((state) => state.toast)
  const dismiss = useOverlayStore((state) => state.dismissToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => dismiss(toast.id), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast, dismiss])

  if (!toast) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-36 z-10 flex justify-center px-8">
      <div
        role="status"
        data-testid={TestId.OverlayToast}
        {...surfaceProps('toast')}
        className="inline-flex h-18 max-w-full items-center rounded-xl border border-border bg-bg px-7 text-fg text-sm shadow-float"
      >
        <span className="truncate">{t(toast.key, toast.params)}</span>
      </div>
    </div>
  )
}
