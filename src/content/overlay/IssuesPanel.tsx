import { TestId, testIds } from '@tests/constants/testIds'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/content/i18n'
import { IssueFrame } from '@/content/issue/IssueFrame'
import { useOverlayStore } from '@/content/store/overlay'
import { sendToBackground } from '@/shared/messaging'
import type { Issue, Severity } from '@/shared/model'
import { isTrustedEvent, onlyTrusted } from '@/shared/trustedEvents'
import { Button, Dialog, SeverityDot } from '@/ui'
import { type IssueFilter, selectIssues } from './issueFilters'
import { surfaceProps } from './surfaces'

export function IssuesPanel({
  onClose,
  onLocate,
  onChanged,
}: {
  onClose: () => void
  onLocate: (issue: Issue) => boolean
  onChanged: (issueId: string, severity: Severity | null) => void
}) {
  const t = useT('overlay')
  const session = useOverlayStore((state) => state.session)
  const path = useOverlayStore((state) => state.pagePath)
  const [issues, setIssues] = useState<Issue[]>([])
  const [crops, setCrops] = useState<Record<string, string>>({})
  const [scope, setScope] = useState<'page' | 'site'>('page')
  const [filter, setFilter] = useState<IssueFilter>('all')
  const [preview, setPreview] = useState<Issue | null>(null)
  const [editing, setEditing] = useState<Issue | null>(null)
  const [deleting, setDeleting] = useState<Issue | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const close = useRef<HTMLButtonElement>(null)
  const sequence = useRef(0)
  const id = session?.session.id
  const pageIdentity = useRef({ id, path })
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    if (!id) {
      setIssues([])
      setCrops({})
      setError(false)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const list = await sendToBackground('issue/list', { sessionId: id })
      const images = await Promise.all(
        list.map(
          async (issue) =>
            [
              issue.id,
              await sendToBackground('issue/crop', { sessionId: id, issueId: issue.id }),
            ] as const,
        ),
      )
      if (request !== sequence.current) return
      setIssues(list.sort((a, b) => a.number - b.number))
      setCrops(
        Object.fromEntries(
          images.filter((entry): entry is readonly [string, string] => entry[1] !== null),
        ),
      )
      setError(false)
    } catch {
      if (request === sequence.current) setError(true)
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [id])
  useEffect(() => {
    if (session?.issueCount !== undefined || !id) void refresh()
    return () => {
      sequence.current++
    }
  }, [refresh, id, session?.issueCount])
  useEffect(() => {
    close.current?.focus()
  }, [])
  useEffect(() => {
    if (pageIdentity.current.id === id && pageIdentity.current.path === path) return
    pageIdentity.current = { id, path }
    setPreview(null)
    setEditing(null)
    setDeleting(null)
  }, [id, path])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTrustedEvent(event) || editing) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (deleting) setDeleting(null)
      else if (preview) setPreview(null)
      else onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [deleting, editing, onClose, preview])
  const pageIssues = issues.filter((issue) => issue.pagePath === path)
  const { scoped, visible, groups } = selectIssues(
    issues,
    path,
    scope === 'site' && session?.session.scope === 'domain',
    filter,
  )
  const selection = useMemo(
    () => (editing ? { target: editing.target, operationId: editing.id } : null),
    [editing],
  )
  const initial = useMemo(
    () => (editing ? { text: editing.text, severity: editing.severity } : undefined),
    [editing],
  )
  const validUrl = (value: string) => {
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && url.origin === location.origin
        ? url.href
        : undefined
    } catch {
      return undefined
    }
  }
  const remove = async () => {
    if (!id || !deleting) return
    try {
      const summary = await sendToBackground('issue/delete', {
        sessionId: id,
        issueId: deleting.id,
      })
      onChanged(deleting.id, null)
      useOverlayStore.getState().setSession(summary)
      setDeleting(null)
      await refresh()
    } catch {
      setError(true)
    }
  }
  return (
    <>
      <aside
        {...surfaceProps('issues-panel')}
        aria-label={t('panel.title')}
        data-testid={TestId.IssuesPanel}
        className="pointer-events-auto fixed top-0 right-0 z-20 flex h-full w-[380px] max-w-full flex-col border-l border-border bg-bg p-6 text-fg shadow-float"
      >
        <header className="flex items-center justify-between">
          <h2>
            {t('panel.title')} · {issues.length}
          </h2>
          <button
            ref={close}
            type="button"
            data-testid={TestId.IssuesClose}
            onClick={onlyTrusted(onClose)}
            aria-label={t('panel.close')}
          >
            ✕
          </button>
        </header>
        {session?.session.scope === 'domain' && (
          <fieldset aria-label={t('panel.scope')} className="my-4 flex gap-4">
            <button
              type="button"
              data-testid={TestId.IssuesScopePage}
              aria-pressed={scope === 'page'}
              onClick={onlyTrusted(() => setScope('page'))}
            >
              {t('panel.page')} · {pageIssues.length}
            </button>
            <button
              type="button"
              data-testid={TestId.IssuesScopeSite}
              aria-pressed={scope === 'site'}
              onClick={onlyTrusted(() => setScope('site'))}
            >
              {t('panel.site')} · {issues.length}
            </button>
          </fieldset>
        )}
        <fieldset aria-label={t('panel.filter')} className="my-4 flex flex-wrap gap-3">
          {(['all', 'blocker', 'major', 'minor'] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-testid={testIds.issueFilter(value)}
              aria-pressed={filter === value}
              onClick={onlyTrusted(() => setFilter(value))}
              className="rounded-pill border border-border px-3 py-2 aria-pressed:bg-surface-selected"
            >
              {value !== 'all' && <SeverityDot severity={value} />}{' '}
              {value === 'all' ? t('panel.all') : t(`issue.${value}`)} ·{' '}
              {value === 'all'
                ? scoped.length
                : scoped.filter((issue) => issue.severity === value).length}
            </button>
          ))}
        </fieldset>
        {error && (
          <p role="alert">
            {t('panel.failed')}{' '}
            <button type="button" onClick={onlyTrusted(() => void refresh())}>
              {t('panel.retry')}
            </button>
          </p>
        )}
        {loading && <p role="status">{t('panel.loading')}</p>}
        {!loading && scoped.length === 0 && <p>{t('panel.empty')}</p>}
        {!loading && scoped.length > 0 && visible.length === 0 && <p>{t('panel.noResults')}</p>}
        <div className="min-h-0 flex-1 overflow-auto">
          {[...groups].map(([groupPath, group]) => (
            <section key={groupPath}>
              {scope === 'site' && session?.session.scope === 'domain' && (
                <h3>
                  {groupPath} · {group.length} {groupPath === path && t('panel.current')}
                </h3>
              )}
              {group.map((issue) => (
                <article
                  key={issue.id}
                  data-testid={TestId.IssueCard}
                  className="my-3 flex gap-3 rounded-md border border-border p-3"
                >
                  <button
                    type="button"
                    data-testid={TestId.IssueCardOpen}
                    onClick={onlyTrusted(() => {
                      if (!onLocate(issue)) setPreview(issue)
                    })}
                    className="flex min-w-0 flex-1 gap-3 text-left"
                  >
                    <span className="relative h-[54px] w-[72px] shrink-0 overflow-hidden rounded-md bg-surface">
                      {crops[issue.id] && (
                        <img src={crops[issue.id]} alt="" className="h-full w-full object-cover" />
                      )}
                      <span className="absolute top-0 left-0 bg-bg px-1">{issue.number}</span>
                    </span>
                    <span className="min-w-0">
                      <strong>
                        <SeverityDot severity={issue.severity} /> {t(`issue.${issue.severity}`)}
                      </strong>
                      <span className="block line-clamp-2">{issue.text}</span>
                      <span className="block truncate font-mono">
                        {issue.target.kind === 'element' ? issue.target.selector : t('panel.area')}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    data-testid={TestId.IssueEdit}
                    aria-label={t('panel.edit')}
                    onClick={onlyTrusted(() => setEditing(issue))}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    data-testid={TestId.IssueDelete}
                    aria-label={t('panel.delete')}
                    onClick={onlyTrusted(() => setDeleting(issue))}
                  >
                    ×
                  </button>
                </article>
              ))}
            </section>
          ))}
        </div>
      </aside>
      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={t('panel.preview')}
        position="center"
        actions={<Button onClick={onlyTrusted(() => setPreview(null))}>{t('panel.close')}</Button>}
      >
        {preview && (
          <>
            {crops[preview.id] && <img src={crops[preview.id]} alt={t('panel.preview')} />}
            {preview.pagePath !== path && validUrl(preview.pageUrl) && (
              <a href={validUrl(preview.pageUrl)} target="_blank" rel="noopener noreferrer">
                {preview.pageUrl}
              </a>
            )}
          </>
        )}
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t('panel.deleteTitle')}
        description={t('panel.deleteConfirm')}
        position="center"
        actions={
          <>
            <Button onClick={onlyTrusted(() => setDeleting(null))}>{t('issue.cancel')}</Button>
            <Button
              data-testid={TestId.IssueDeleteConfirm}
              onClick={onlyTrusted(() => void remove())}
            >
              {t('panel.delete')}
            </Button>
          </>
        }
      />
      {editing && selection && (
        <IssueFrame
          selection={selection}
          initial={initial}
          onCancel={() => setEditing(null)}
          onSave={async (text, severity) => {
            if (!id) throw new Error('Session missing')
            const summary = await sendToBackground('issue/update', {
              sessionId: id,
              issueId: editing.id,
              text,
              severity,
            })
            onChanged(editing.id, severity)
            useOverlayStore.getState().setSession(summary)
            setEditing(null)
            await refresh()
          }}
        />
      )}
    </>
  )
}
