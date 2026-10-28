import { TestId } from '@tests/constants/testIds'
import { Snowflake } from 'lucide-react'
import { useT } from '@/content/i18n'
import type { SnapshotController } from '@/content/snapshot/useSnapshotController'
import { useOverlayStore } from '@/content/store/overlay'
import { FREEZE_DELAYS } from '@/shared/model'
import { useSettingsStore } from '@/store/settings'
import { Button, Menu, type MenuItem, Tooltip } from '@/ui'

const ICON_SIZE = 20

/**
 * The toolbar's snapshot button and its menu (spec F5.1, F5.2, screens.md §03). On the live page:
 * "Now F", then "In 3 / 5 / 10 s" with `Shift F` on the delay from the settings, and a note on
 * what a snapshot keeps. On a snapshot the button is lit and the menu offers the way back and a
 * new snapshot after a delay.
 */
export function FreezeMenu({ snapshot }: { snapshot: SnapshotController }) {
  const t = useT('overlay')
  const phase = useOverlayStore((state) => state.snapshotPhase)
  const defaultDelay = useSettingsStore((state) => state.freezeDelay)
  const frozen = phase === 'snapshot'

  const delays: MenuItem[] = FREEZE_DELAYS.map((seconds, index) => ({
    id: `freeze-${seconds}`,
    label: t(frozen ? 'freeze.retake' : 'freeze.after', { count: seconds }),
    keys: seconds === defaultDelay ? ['Shift', 'F'] : undefined,
    separatorBefore: index === 0,
    onSelect: () => snapshot.startCountdown(seconds),
  }))
  const items: MenuItem[] = frozen
    ? [
        { id: 'freeze-live', label: t('freeze.live'), keys: ['F'], onSelect: snapshot.exit },
        ...delays,
      ]
    : [
        { id: 'freeze-now', label: t('freeze.now'), keys: ['F'], onSelect: snapshot.takeNow },
        ...delays,
      ]

  return (
    <Menu
      items={items}
      placement="bottom-start"
      aria-label={t('toolbar.freeze')}
      className="w-[236px]"
      footer={frozen ? undefined : t('freeze.note')}
    >
      <Tooltip content={{ label: t(frozen ? 'freeze.live' : 'toolbar.freeze'), keys: ['F'] }}>
        <Button
          variant="tool"
          size="lg"
          iconOnly
          active={frozen}
          aria-pressed={frozen}
          aria-label={t('toolbar.freeze')}
          data-testid={TestId.ToolbarFreeze}
        >
          <Snowflake size={ICON_SIZE} aria-hidden="true" />
        </Button>
      </Tooltip>
    </Menu>
  )
}
