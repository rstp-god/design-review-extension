import { TestId, testIds } from '@tests/constants/testIds'
import { useTranslation } from 'react-i18next'
import { HintDot, HintKeys, HintPill } from '@/content/overlay/HintPill'
import { isTrustedEvent } from '@/shared/trustedEvents'
import { cn, Kbd } from '@/ui'
import { entryLabel } from './label'
import type { PathEntry, PickNode } from './source'

/** Deep trees are cut from the left: the end of the path is what matters. */
const MAX_VISIBLE_ENTRIES = 6

export interface LockedBarProps {
  path: PathEntry[]
  active: PickNode
  onPick: (node: PickNode) => void
}

/**
 * Bottom bar of the Locked state (screens.md §05): breadcrumbs from `<body>` to the node — the
 * active one on the accent, every entry clickable — then the keys. `Enter` is shown for the
 * coming issue form (feature `issue-capture`) but does nothing yet.
 */
export function LockedBar({ path, active, onPick }: LockedBarProps) {
  const { t } = useTranslation('overlay')
  const { t: tCommon } = useTranslation('common')
  // The last entries, shifted so the active one is always on screen.
  const activeIndex = Math.max(
    0,
    path.findIndex((entry) => entry.node === active),
  )
  const start = Math.min(Math.max(0, path.length - MAX_VISIBLE_ENTRIES), activeIndex)
  const end = Math.min(path.length, start + MAX_VISIBLE_ENTRIES)
  const visible = path.slice(start, end)

  return (
    <HintPill testId={TestId.PickerLockedBar} interactive className="gap-8">
      <nav
        aria-label={t('picker.path')}
        data-testid={TestId.PickerBreadcrumbs}
        className="flex min-w-0 items-center gap-3 font-mono text-label"
      >
        {start > 0 && (
          <>
            <span aria-hidden="true" className="text-fg-muted">
              …
            </span>
            <Separator />
          </>
        )}
        {visible.map((entry, index) => {
          const current = entry.node === active
          return (
            <span key={entry.node.key} className="flex min-w-0 items-center gap-3">
              {index > 0 && <Separator />}
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                data-testid={testIds.pickerBreadcrumb(start + index)}
                onClick={(event) => {
                  if (isTrustedEvent(event)) onPick(entry.node)
                }}
                className={cn(
                  'max-w-[200px] cursor-pointer truncate rounded-xs px-3 py-1 font-mono text-label',
                  'transition-colors duration-(--dr-duration) ease-out',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                  current ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {entryLabel(entry)}
              </button>
            </span>
          )
        })}
        {end < path.length && (
          <>
            <Separator />
            <span aria-hidden="true" className="text-fg-muted">
              …
            </span>
          </>
        )}
      </nav>
      <span aria-hidden="true" className="h-9 w-px shrink-0 bg-border-strong" />
      <span className="flex shrink-0 items-center gap-4">
        <HintKeys keys={['↑', '↓']} label={t('hint.parentChild')} />
        <HintKeys keys={['←', '→']} label={t('hint.siblings')} />
        <span
          data-testid={TestId.PickerHintEnter}
          className="inline-flex items-center gap-2 whitespace-nowrap text-fg-disabled"
        >
          <Kbd className="text-fg-disabled">Enter</Kbd>
          <span>
            {t('hint.issue')}
            <HintDot /> {tCommon('soon')}
          </span>
        </span>
        <HintKeys keys={['Esc']} label={t('hint.back')} />
      </span>
    </HintPill>
  )
}

function Separator() {
  return (
    <span aria-hidden="true" className="text-fg-subtle">
      ›
    </span>
  )
}
