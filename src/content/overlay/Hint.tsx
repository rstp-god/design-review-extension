import { TestId } from '@tests/constants/testIds'
import { useTranslation } from 'react-i18next'
import { Kbd } from '@/ui'

/**
 * Bottom hint with the keys of the current mode (spec F2.4). The shell has one mode and one
 * key; picker / area / snapshot add their own lines later.
 */
export function Hint() {
  const { t } = useTranslation('overlay')
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-10 flex justify-center">
      <div
        data-testid={TestId.OverlayHint}
        className="inline-flex h-20 items-center gap-8 rounded-xl border border-border bg-bg px-12 text-sm text-fg-secondary shadow-float"
      >
        <Kbd>Esc</Kbd>
        <span>{t('hint.exit')}</span>
      </div>
    </div>
  )
}
