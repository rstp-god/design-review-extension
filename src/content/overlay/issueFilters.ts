import type { Issue, Severity } from '@/shared/model'

export type IssueFilter = 'all' | Severity

export function selectIssues(
  issues: Issue[],
  pagePath: string,
  site: boolean,
  filter: IssueFilter,
) {
  const scoped = site ? issues : issues.filter((issue) => issue.pagePath === pagePath)
  const visible = scoped.filter((issue) => filter === 'all' || issue.severity === filter)
  const groups = new Map<string, Issue[]>()
  for (const issue of visible)
    groups.set(issue.pagePath, [...(groups.get(issue.pagePath) ?? []), issue])
  return { scoped, visible, groups }
}
