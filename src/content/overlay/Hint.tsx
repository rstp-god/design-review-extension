import { TestId } from '@tests/constants/testIds'
import { useT } from '@/content/i18n'
import { useOverlayStore } from '@/content/store/overlay'
import { HintDot, HintKeys, HintPill } from './HintPill'

/**
 * Bottom hint with the keys of the current mode (spec F2.4, screens.md §03, §08). Locked has
 * its own bar with the breadcrumbs (picker/LockedBar.tsx), so nothing is rendered here then.
 */
export function Hint() {
  const t = useT('overlay')
  const tool = useOverlayStore((state) => state.tool)
  const pickerMode = useOverlayStore((state) => state.pickerMode)
  const areaMode = useOverlayStore((state) => state.areaMode)
  if (tool === 'picker' && pickerMode === 'locked') return null

  if (tool === 'area') {
    return (
      <HintPill testId={TestId.OverlayHint}>
        <span>{t('hint.drag')}</span>
        <HintDot />
        <HintKeys keys={['Shift']} label={t('hint.square')} />
        <HintDot />
        <HintKeys keys={['Alt']} label={t('hint.fromCenter')} />
        <HintDot />
        <span>{t('hint.corners')}</span>
        <HintDot />
        <HintKeys
          keys={['Esc']}
          label={t(areaMode === 'drawing' ? 'hint.areaOff' : 'hint.cancel')}
        />
      </HintPill>
    )
  }

  return (
    <HintPill testId={TestId.OverlayHint}>
      {tool === 'picker' ? (
        <>
          <span>{t('hint.pick')}</span>
          <HintDot />
          <HintKeys keys={['Esc']} label={t('hint.pickerOff')} />
        </>
      ) : (
        <>
          <HintKeys keys={['P']} label={t('hint.picker')} />
          <HintDot />
          <HintKeys keys={['A']} label={t('hint.area')} />
          <HintDot />
          <HintKeys keys={['Esc']} label={t('hint.exit')} />
        </>
      )}
    </HintPill>
  )
}
