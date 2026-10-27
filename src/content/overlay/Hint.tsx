import { TestId } from '@tests/constants/testIds'
import { useTranslation } from 'react-i18next'
import { useOverlayStore } from '@/content/store/overlay'
import { HintDot, HintKeys, HintPill } from './HintPill'

/**
 * Bottom hint with the keys of the current mode (spec F2.4). Locked has its own bar with the
 * breadcrumbs (picker/LockedBar.tsx), so nothing is rendered here then.
 */
export function Hint() {
  const { t } = useTranslation('overlay')
  const tool = useOverlayStore((state) => state.tool)
  const mode = useOverlayStore((state) => state.pickerMode)
  if (tool === 'picker' && mode === 'locked') return null

  return (
    <HintPill testId={TestId.OverlayHint}>
      {tool === 'picker' ? (
        <span>{t('hint.pick')}</span>
      ) : (
        <HintKeys keys={['P']} label={t('hint.picker')} />
      )}
      <HintDot />
      <HintKeys keys={['Esc']} label={t('hint.exit')} />
    </HintPill>
  )
}
