import { TestId, testIds } from '@tests/constants/testIds'
import { ChevronLeft } from 'lucide-react'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Command, getCommands } from '@/services/chrome/commands'
import { createTab } from '@/services/chrome/tabs'
import { SHORTCUTS_PAGE_URL, TOGGLE_REVIEW_COMMAND } from '@/shared/constants'
import { formatBytes, splitShortcut } from '@/shared/format'
import { sendToBackground } from '@/shared/messaging'
import {
  COLOR_FORMATS,
  CROP_PADDINGS,
  FREEZE_DELAYS,
  REPORT_LANGS,
  SESSION_SCOPES,
  SEVERITIES,
  SHOT_QUALITIES,
  type StorageUsage,
  THEMES,
  TOOLTIP_FIELDS,
  UNITS,
} from '@/shared/model'
import { useSettingsStore } from '@/store/settings'
import { Button, Checkbox, Dialog, KeyCombo, Segmented, SeverityDot } from '@/ui'
import { Header } from './Header'
import { SectionLabel } from './SectionLabel'

export interface SettingsProps {
  onBack: () => void
}

/** Settings screen (spec 3.10, screens.md §02). Every change is saved immediately. */
export function Settings({ onBack }: SettingsProps) {
  const { t, i18n } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')
  const settings = useSettingsStore()
  const update = settings.update
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [commands, setCommands] = useState<Command[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)

  const loadUsage = () => {
    void sendToBackground('storage/usage', {})
      .then(setUsage)
      .catch(() => setUsage(null))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    loadUsage()
    void getCommands().then(setCommands)
  }, [])

  const deleteAll = async () => {
    setDeleteFailed(false)
    try {
      await sendToBackground('session/deleteAll', {})
    } catch {
      setDeleteFailed(true)
    } finally {
      setConfirmDelete(false)
      loadUsage()
    }
  }

  const toggleShortcut = commands.find((command) => command.name === TOGGLE_REVIEW_COMMAND)
  const toggleKeys = splitShortcut(toggleShortcut?.shortcut ?? '')
  const hotkeyRows: Array<{ label: string; keys: string[] }> = [
    { label: t('hotkeys.toggle'), keys: toggleKeys },
    { label: t('hotkeys.picker'), keys: ['P'] },
    { label: t('hotkeys.area'), keys: ['A'] },
    { label: t('hotkeys.freeze'), keys: ['F'] },
    { label: t('hotkeys.freezeDelayed'), keys: ['Shift', 'F'] },
  ]
  const usageRatio = usage?.quota ? Math.min(1, usage.bytes / usage.quota) : 0

  return (
    <div
      data-testid={TestId.SettingsRoot}
      data-hydrated={settings.hydrated}
      // Controls stay inert until the stored settings arrived; a click before that would be lost.
      inert={!settings.hydrated}
      className="flex flex-col"
    >
      <Header
        leading={
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={tCommon('actions.back')}
            data-testid={TestId.PopupBackButton}
            onClick={onBack}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Button>
        }
        title={t('title')}
      />

      <Section title={t('sessions.title')}>
        <Field label={t('sessions.collect')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              size="md"
              fullWidth
              testId={TestId.SettingScope}
              options={SESSION_SCOPES.map((scope) => ({
                value: scope,
                label: tCommon(`scope.${scope}`),
              }))}
              value={settings.sessionScope}
              onChange={(sessionScope) => update({ sessionScope })}
            />
          )}
        </Field>
        <p className="m-0 text-label text-fg-muted">
          {t(`sessions.hint.${settings.sessionScope}`)}
        </p>
      </Section>

      <Section title={t('report.title')}>
        <Field label={t('report.reviewer')} htmlFor="reviewer">
          {() => (
            <input
              id="reviewer"
              type="text"
              maxLength={120}
              autoComplete="off"
              placeholder={t('report.reviewerPlaceholder')}
              data-testid={TestId.SettingReviewer}
              value={settings.reviewer}
              onChange={(event) => update({ reviewer: event.target.value })}
              className="h-18 w-full rounded-md border border-border-strong bg-surface px-5 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          )}
        </Field>
        <Row label={t('report.lang')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              testId={TestId.SettingReportLang}
              options={REPORT_LANGS.map((lang) => ({ value: lang, label: lang.toUpperCase() }))}
              value={settings.reportLang}
              onChange={(reportLang) => update({ reportLang })}
            />
          )}
        </Row>
        <Row label={t('report.quality')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              testId={TestId.SettingShotQuality}
              options={SHOT_QUALITIES.map((quality) => ({
                value: quality,
                label: t(`report.qualityOption.${quality}`),
              }))}
              value={settings.shotQuality}
              onChange={(shotQuality) => update({ shotQuality })}
            />
          )}
        </Row>
      </Section>

      <Section title={t('picker.title')}>
        <Field label={t('picker.tooltipFields')}>
          {() => (
            <div className="flex flex-col gap-4">
              {TOOLTIP_FIELDS.map((field) => (
                <Checkbox
                  key={field}
                  label={t(`picker.field.${field}`)}
                  data-testid={testIds.tooltipField(field)}
                  checked={settings.tooltipFields.includes(field)}
                  onChange={(event) => settings.toggleTooltipField(field, event.target.checked)}
                />
              ))}
            </div>
          )}
        </Field>
        <Row label={t('picker.colorFormat')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              mono
              testId={TestId.SettingColorFormat}
              options={COLOR_FORMATS.map((format) => ({
                value: format,
                label: format.toUpperCase(),
              }))}
              value={settings.colorFormat}
              onChange={(colorFormat) => update({ colorFormat })}
            />
          )}
        </Row>
        <Row label={t('picker.units')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              mono
              testId={TestId.SettingUnits}
              options={UNITS.map((unit) => ({ value: unit, label: unit }))}
              value={settings.units}
              onChange={(units) => update({ units })}
            />
          )}
        </Row>
        <Row label={t('picker.cropPadding')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              mono
              testId={TestId.SettingCropPadding}
              options={CROP_PADDINGS.map((padding) => ({ value: padding, label: String(padding) }))}
              value={settings.cropPadding}
              onChange={(cropPadding) => update({ cropPadding })}
            />
          )}
        </Row>
        <Row label={t('picker.freezeDelay')} hint={t('picker.freezeDelayHint')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              mono
              testId={TestId.SettingFreezeDelay}
              options={FREEZE_DELAYS.map((delay) => ({
                value: delay,
                label: t('picker.seconds', { count: delay }),
              }))}
              value={settings.freezeDelay}
              onChange={(freezeDelay) => update({ freezeDelay })}
            />
          )}
        </Row>
      </Section>

      <Section title={t('issues.title')}>
        <Field label={t('issues.defaultSeverity')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              size="md"
              fullWidth
              testId={TestId.SettingDefaultSeverity}
              options={SEVERITIES.map((severity) => ({
                value: severity,
                label: (
                  <>
                    <SeverityDot severity={severity} />
                    {tCommon(`severity.${severity}`)}
                  </>
                ),
                ariaLabel: tCommon(`severity.${severity}`),
              }))}
              value={settings.defaultSeverity}
              onChange={(defaultSeverity) => update({ defaultSeverity })}
            />
          )}
        </Field>
      </Section>

      <Section title={t('interface.title')}>
        <Row label={t('interface.theme')}>
          {(labelId) => (
            <Segmented
              aria-labelledby={labelId}
              testId={TestId.SettingTheme}
              options={THEMES.map((theme) => ({
                value: theme,
                label: t(`interface.themeOption.${theme}`),
              }))}
              value={settings.theme}
              onChange={(theme) => update({ theme })}
            />
          )}
        </Row>
      </Section>

      <Section title={t('hotkeys.title')}>
        <ul className="m-0 flex list-none flex-col gap-5 p-0">
          {hotkeyRows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between gap-6 text-base text-fg"
            >
              <span>{row.label}</span>
              {row.keys.length > 0 ? (
                <KeyCombo keys={row.keys} />
              ) : (
                <span className="text-sm text-fg-muted">{t('hotkeys.unset')}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="m-0 text-sm text-fg-muted">
          {t('hotkeys.hintBefore')}{' '}
          <button
            type="button"
            data-testid={TestId.SettingsShortcutsLink}
            className="cursor-pointer font-mono text-accent-text underline-offset-2 hover:underline"
            onClick={() => void createTab(SHORTCUTS_PAGE_URL)}
          >
            {SHORTCUTS_PAGE_URL}
          </button>
          . {t('hotkeys.hintAfter')}
        </p>
      </Section>

      <Section title={t('data.title')} last>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-base text-fg">
            <span>{t('data.used')}</span>
            <span
              data-testid={TestId.SettingsStorageUsage}
              className="font-mono text-sm text-fg-muted"
            >
              {usage
                ? `${formatBytes(usage.bytes, i18n.language)} · ${tCommon('sessions', { count: usage.sessions })}`
                : '—'}
            </span>
          </div>
          <div aria-hidden="true" className="h-3 overflow-hidden rounded-pill bg-surface-selected">
            <div
              className="h-full rounded-pill bg-accent"
              style={{ width: `${usage && usage.bytes > 0 ? Math.max(1, usageRatio * 100) : 0}%` }}
            />
          </div>
        </div>
        <Button
          variant="danger"
          size="md"
          className="w-full"
          data-testid={TestId.SettingsDeleteAll}
          disabled={!usage || usage.sessions === 0}
          onClick={() => setConfirmDelete(true)}
        >
          {t('data.deleteAll')}
        </Button>
        {deleteFailed && (
          <p
            role="alert"
            data-testid={TestId.SettingsDeleteAllError}
            className="m-0 text-sm text-danger"
          >
            {t('data.deleteFailed')}
          </p>
        )}
      </Section>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('data.confirmTitle')}
        description={t('data.confirmText')}
        actions={
          <>
            <Button
              size="sm"
              data-testid={TestId.SettingsDeleteAllCancel}
              onClick={() => setConfirmDelete(false)}
            >
              {tCommon('actions.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              data-testid={TestId.SettingsDeleteAllConfirm}
              onClick={() => void deleteAll()}
            >
              {tCommon('actions.delete')}
            </Button>
          </>
        }
      />
    </div>
  )
}

function Section({
  title,
  last = false,
  children,
}: {
  title: string
  last?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={
        last
          ? 'flex flex-col gap-6 px-8 pt-7 pb-8'
          : 'flex flex-col gap-6 border-b border-divider px-8 pt-7 pb-8'
      }
    >
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  )
}

/** Label above the control (wide controls). */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: (labelId: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-4">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-base text-fg">
          {label}
        </label>
      ) : (
        <div id={id} className="text-base text-fg">
          {label}
        </div>
      )}
      {children(id)}
    </div>
  )
}

/** Label on the left, control on the right (compact controls). */
function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (labelId: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex min-w-0 flex-col">
        <span id={id} className="text-base text-fg">
          {label}
        </span>
        {hint && <span className="text-sm text-fg-muted">{hint}</span>}
      </div>
      <div className="shrink-0">{children(id)}</div>
    </div>
  )
}
