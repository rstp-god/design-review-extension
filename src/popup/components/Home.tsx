import { TestId, testIds } from '@tests/constants/testIds'
import { CircleAlert, Download, Ellipsis, Globe, Play, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExtensionVersion } from '@/services/chrome/runtime'
import { createTab } from '@/services/chrome/tabs'
import { SHORTCUTS_PAGE_URL } from '@/shared/constants'
import {
  displayHost,
  formatBytes,
  formatRelativeDay,
  sessionLabel,
  splitShortcut,
} from '@/shared/format'
import { sendToBackground } from '@/shared/messaging'
import { SEVERITIES, type SessionSummary } from '@/shared/model'
import { normalizePath } from '@/shared/sessionKey'
import { useSettingsStore } from '@/store/settings'
import { Button, cn, KeyCombo, SeverityDot, Tooltip } from '@/ui'
import { usePopupData } from '../usePopupData'
import { Header } from './Header'
import { SectionLabel } from './SectionLabel'

export interface HomeProps {
  onOpenSettings: () => void
}

/** Popup home (spec 3.9 F9.1–F9.3, screens.md §01 and §09). */
export function Home({ onOpenSettings }: HomeProps) {
  const { t, i18n } = useTranslation('popup')
  const { t: tCommon } = useTranslation('common')
  const sessionScope = useSettingsStore((state) => state.sessionScope)
  const data = usePopupData()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(false)

  const scope = data.current?.session.scope ?? sessionScope
  const url = data.tab?.url ? safeUrl(data.tab.url) : null
  const host = url ? url.host || url.href : ''
  const path = url ? normalizePath(url.pathname) : '/'
  const showPath = scope === 'page' && path !== '/'
  const keys = splitShortcut(data.shortcut)

  const start = async () => {
    if (data.tab?.id === undefined || data.restricted || starting) return
    setStarting(true)
    setStartError(false)
    try {
      await sendToBackground('review/start', { tabId: data.tab.id })
      window.close()
    } catch {
      setStartError(true)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div data-testid={TestId.PopupRoot} data-status={data.status} className="flex flex-col">
      <Header
        trailing={
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t('header.settings')}
            data-testid={TestId.PopupSettingsButton}
            onClick={onOpenSettings}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
          </Button>
        }
      />

      <section data-testid={TestId.PopupSession} className="flex flex-col gap-6 px-16 pt-14 pb-16">
        <div className="flex items-center justify-between gap-8">
          <SectionLabel>
            {data.current ? t('session.label') : t('session.currentPage')}
          </SectionLabel>
          {!data.restricted && data.status === 'ready' && (
            <span
              data-testid={TestId.PopupSessionScope}
              className="inline-flex h-12 items-center gap-4 rounded-pill border border-border-strong px-8 text-sm text-fg-secondary"
            >
              <Globe size={12} aria-hidden="true" />
              {tCommon(`scope.${scope}`)}
            </span>
          )}
        </div>

        <div data-testid={TestId.PopupSessionHost} className="truncate font-mono text-base text-fg">
          {data.current ? sessionLabel(data.current.session) : host + (showPath ? path : '')}
        </div>
        {data.current && scope === 'domain' && !data.restricted && (
          <div className="text-sm text-fg-muted">
            {t('session.nowAt')}{' '}
            <span data-testid={TestId.PopupSessionPath} className="font-mono text-fg-secondary">
              {path}
            </span>
          </div>
        )}

        {data.restricted && data.status === 'ready' && (
          <div
            data-testid={TestId.PopupRestricted}
            role="status"
            className="mt-4 flex gap-10 rounded-xl border border-border bg-surface-raised p-12"
          >
            <CircleAlert size={18} aria-hidden="true" className="mt-1 shrink-0 text-warning" />
            <div className="flex flex-col gap-2">
              <div className="text-base font-semibold text-fg">{t('restricted.title')}</div>
              <div className="text-sm text-fg-secondary">{t('restricted.text')}</div>
            </div>
          </div>
        )}

        {data.current && <Summary summary={data.current} />}

        <Button
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          data-testid={TestId.PopupStart}
          disabled={data.status !== 'ready' || data.restricted || starting}
          onClick={() => void start()}
        >
          <Play size={16} aria-hidden="true" fill="currentColor" />
          {data.current ? t('continue') : t('start')}
        </Button>

        {startError && (
          <div data-testid={TestId.PopupError} role="alert" className="text-sm text-danger">
            {t('errors.startFailed')}
          </div>
        )}

        {!data.restricted && (
          <div
            data-testid={TestId.PopupShortcut}
            className="flex items-center justify-center gap-6 text-sm text-fg-muted"
          >
            {keys.length > 0 ? (
              <>
                <span>{t('or')}</span>
                <KeyCombo keys={keys} />
              </>
            ) : (
              <>
                <span>{t('shortcut.unset')}</span>
                <button
                  type="button"
                  className="cursor-pointer text-accent-text underline-offset-2 hover:underline"
                  onClick={() => void createTab(SHORTCUTS_PAGE_URL)}
                >
                  {t('shortcut.edit')}
                </button>
              </>
            )}
          </div>
        )}

        {data.current && (
          <div className="mt-4 grid grid-cols-2 gap-10">
            <Tooltip content={t('export.soon')}>
              <Button softDisabled size="md" data-testid={TestId.PopupExportHtml}>
                <Download size={16} aria-hidden="true" />
                {t('export.html')}
              </Button>
            </Tooltip>
            <Tooltip content={t('export.soon')}>
              <Button softDisabled size="md" data-testid={TestId.PopupExportPdf}>
                <Download size={16} aria-hidden="true" />
                {t('export.pdf')}
              </Button>
            </Tooltip>
          </div>
        )}
      </section>

      {data.status === 'ready' && data.firstRun && !data.restricted && <Onboarding />}

      {data.recent.length > 0 && (
        <section
          data-testid={TestId.PopupRecent}
          className="flex flex-col gap-8 border-t border-border px-16 pt-14 pb-12"
        >
          <SectionLabel>{t('recent.title')}</SectionLabel>
          <ul className="m-0 flex list-none flex-col p-0">
            {data.recent.map((summary) => (
              <RecentRow key={summary.session.id} summary={summary} />
            ))}
          </ul>
        </section>
      )}

      <footer className="flex items-center justify-between border-t border-border px-16 py-10 text-sm text-fg-muted">
        <span data-testid={TestId.PopupStorage}>
          {t('footer.storage', {
            size: data.usage ? formatBytes(data.usage.bytes, i18n.language) : '—',
          })}
        </span>
        <span data-testid={TestId.PopupVersion}>v{getExtensionVersion()}</span>
      </footer>
    </div>
  )
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function Summary({ summary }: { summary: SessionSummary }) {
  const { t: tCommon } = useTranslation('common')
  return (
    <div
      data-testid={TestId.PopupSessionSummary}
      className="mt-4 flex h-22 items-center gap-6 rounded-xl bg-surface px-12"
    >
      <span className="text-base font-semibold text-fg">
        {tCommon('issues', { count: summary.issueCount })}
      </span>
      {summary.session.scope === 'domain' && (
        <span className="text-sm text-fg-muted">
          · {tCommon('pages', { count: summary.pageCount })}
        </span>
      )}
      <span className="ml-auto flex items-center gap-8 text-sm text-fg-secondary">
        {SEVERITIES.map((severity) => (
          <span key={severity} className="inline-flex items-center gap-4">
            <SeverityDot severity={severity} />
            <span className="sr-only">{tCommon(`severity.${severity}`)}</span>
            {summary.bySeverity[severity]}
          </span>
        ))}
      </span>
    </div>
  )
}

function RecentRow({ summary }: { summary: SessionSummary }) {
  const { t, i18n } = useTranslation('popup')
  const { t: tCommon } = useTranslation('common')
  const { session } = summary
  const meta = [
    tCommon(`scope.${session.scope}`),
    session.scope === 'domain' ? tCommon('pages', { count: summary.pageCount }) : null,
    tCommon('issues', { count: summary.issueCount }),
    formatRelativeDay(session.updatedAt, new Date(), i18n.language),
  ].filter(Boolean)

  return (
    <li
      data-testid={testIds.recentItem(session.id)}
      className={cn('-mx-8 flex items-center gap-8 rounded-lg px-8 py-6')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="truncate font-mono text-sm text-fg">{sessionLabel(session)}</div>
        <div className="truncate text-sm text-fg-muted">{meta.join(' · ')}</div>
      </div>
      <Tooltip content={tCommon('soon')}>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          softDisabled
          aria-label={t('recent.actions')}
          data-testid={testIds.recentMenu(session.id)}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </Button>
      </Tooltip>
    </li>
  )
}

function Onboarding() {
  const { t } = useTranslation('popup')
  const steps = [t('onboarding.step1'), t('onboarding.step2'), t('onboarding.step3')]
  return (
    <section
      data-testid={TestId.PopupOnboarding}
      className="flex flex-col gap-12 border-t border-border px-16 pt-16 pb-16"
    >
      <h2 className="m-0 text-base font-semibold text-fg">{t('onboarding.title')}</h2>
      <ol className="m-0 flex list-none flex-col gap-10 p-0">
        {steps.map((step, index) => (
          <li key={step} className="flex items-start gap-10 text-base text-fg-secondary">
            <span
              aria-hidden="true"
              className="mt-1 inline-flex size-12 shrink-0 items-center justify-center rounded-pill border border-border-strong text-label text-fg-muted"
            >
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-4 flex flex-wrap items-center gap-x-6 gap-y-4 text-sm text-fg-muted">
        <span>{t('onboarding.freezeHint')}</span>
        <KeyCombo keys={['Shift', 'F']} />
      </p>
    </section>
  )
}

export { displayHost }
