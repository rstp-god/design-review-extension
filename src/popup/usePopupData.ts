import { useEffect, useState } from 'react'
import { getCommands } from '@/services/chrome/commands'
import type { Tab } from '@/services/chrome/tabs'
import { TOGGLE_REVIEW_COMMAND } from '@/shared/constants'
import { sendToBackground } from '@/shared/messaging'
import type { SessionSummary, StorageUsage } from '@/shared/model'
import { isRestrictedUrl, sessionKey } from '@/shared/sessionKey'
import { useSettingsStore } from '@/store/settings'
import { resolvePopupTab } from './tab'

export interface PopupData {
  /** `loading` until the tab, the settings and the background answered. */
  status: 'loading' | 'ready'
  tab: Tab | null
  restricted: boolean
  /** Session of the current page in the current collection scope, if any. */
  current: SessionSummary | null
  /** Other sessions, most recent first (the current one is excluded). */
  recent: SessionSummary[]
  /** `true` when there are no sessions at all: the onboarding state. */
  firstRun: boolean
  usage: StorageUsage | null
  /** Current binding of the global command; empty when unassigned. */
  shortcut: string
}

/**
 * Everything the home screen shows, loaded once the settings store is hydrated (the current
 * session depends on the collection scope). Home is remounted when the user comes back from the
 * settings screen, so there is no separate reload path.
 */
export function usePopupData(): PopupData {
  const hydrated = useSettingsStore((state) => state.hydrated)
  const sessionScope = useSettingsStore((state) => state.sessionScope)
  const [tab, setTab] = useState<Tab | null>(null)
  const [tabResolved, setTabResolved] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  /** The list could not be loaded: show no onboarding, it would claim the user has no sessions. */
  const [listFailed, setListFailed] = useState(false)
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [shortcut, setShortcut] = useState('')

  useEffect(() => {
    let cancelled = false
    void resolvePopupTab()
      .catch(() => null)
      .then((resolved) => {
        if (cancelled) return
        setTab(resolved)
        setTabResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getCommands().then((commands) => {
      if (cancelled) return
      const toggle = commands.find((command) => command.name === TOGGLE_REVIEW_COMMAND)
      setShortcut(toggle?.shortcut ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      sendToBackground('session/list', {}).catch(() => null),
      sendToBackground('storage/usage', {}).catch(() => null),
    ]).then(([list, usageResult]) => {
      if (cancelled) return
      setListFailed(list === null)
      setSessions(list ?? [])
      setUsage(usageResult)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const restricted = isRestrictedUrl(tab?.url)
  const currentKey = tab?.url && !restricted ? sessionKey(tab.url, sessionScope) : null
  const current =
    sessions?.find(
      (summary) => summary.session.scope === sessionScope && summary.session.key === currentKey,
    ) ?? null
  const recent = (sessions ?? []).filter((summary) => summary !== current)

  return {
    status: hydrated && tabResolved && sessions !== null ? 'ready' : 'loading',
    tab,
    restricted,
    current,
    recent,
    firstRun: !listFailed && (sessions?.length ?? 0) === 0,
    usage,
    shortcut,
  }
}
