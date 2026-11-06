import { makeIssue } from '@tests/fixtures/data'
import { describe, expect, it } from 'vitest'
import { selectIssues } from '@/content/overlay/issueFilters'

describe('panel filters', () => {
  it('counts within scope and groups only the matching severity by path', () => {
    const issues = [
      makeIssue({ number: 1, pagePath: '/a', severity: 'major' }),
      makeIssue({ number: 2, pagePath: '/a', severity: 'minor' }),
      makeIssue({ number: 3, pagePath: '/b', severity: 'major' }),
    ]
    const page = selectIssues(issues, '/a', false, 'major')
    expect(page.scoped).toHaveLength(2)
    expect(page.visible.map((issue) => issue.number)).toEqual([1])
    const site = selectIssues(issues, '/a', true, 'major')
    expect(site.scoped).toHaveLength(3)
    expect(
      [...site.groups].map(([path, group]) => [path, group.map((issue) => issue.number)]),
    ).toEqual([
      ['/a', [1]],
      ['/b', [3]],
    ])
  })
})
