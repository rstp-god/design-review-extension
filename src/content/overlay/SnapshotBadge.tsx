import { TestId } from '@tests/constants/testIds'
import { Snowflake } from 'lucide-react'
import { useT } from '@/content/i18n'
import { useOverlayStore } from '@/content/store/overlay'
import { HintDot, HintKeys } from './HintPill'
import { surfaceProps } from './surfaces'

/** `14:20:31` in the browser's locale, always a 24-hour clock with seconds (screens.md §03). */
export function formatSnapshotTime(takenAt: number, locale?: string): string {
  return new Date(takenAt).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
}

/**
 * «Снимок 14:20:31 · F — живая страница» at the top center while a snapshot is up (spec F5.7).
 * A status for assistive tech, a surface for the picker (nothing is highlighted under it), and
 * no pointer target: a click there lands on the snapshot layer like anywhere else.
 */
export function SnapshotBadge() {
  const t = useT('overlay')
  const meta = useOverlayStore((state) => state.snapshotMeta)
  if (!meta) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-8 z-10 flex justify-center px-8">
      <div
        role="status"
        data-testid={TestId.SnapshotBadge}
        {...surfaceProps('snapshot-badge')}
        className="inline-flex h-18 max-w-full items-center gap-5 rounded-xl border border-accent bg-bg px-7 text-fg text-sm shadow-float"
      >
        <Snowflake size={16} aria-hidden="true" className="shrink-0 text-accent-text" />
        <span className="whitespace-nowrap">
          {t('snapshot.badge')}{' '}
          <span data-testid={TestId.SnapshotBadgeTime} className="font-mono">
            {formatSnapshotTime(meta.takenAt)}
          </span>
        </span>
        <HintDot />
        <HintKeys keys={['F']} label={t('snapshot.live')} className="text-fg-secondary" />
      </div>
    </div>
  )
}
