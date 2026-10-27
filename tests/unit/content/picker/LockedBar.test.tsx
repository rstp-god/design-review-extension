// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayI18nProvider } from '@/content/i18n'
import { LockedBar } from '@/content/picker/LockedBar'
import type { PathEntry } from '@/content/picker/source'

const tags = ['body', 'main', 'section', 'article', 'div', 'p', 'span', 'a']
const path: PathEntry[] = tags.map((tag, index) => ({
  node: { key: `n${index}` },
  tag,
  id: null,
  classes: [],
}))

function renderBar(activeIndex: number, onPick = vi.fn()) {
  const active = path[activeIndex]?.node
  if (!active) throw new Error('bad index')
  render(
    <OverlayI18nProvider language="en">
      <LockedBar path={path} active={active} onPick={onPick} />
    </OverlayI18nProvider>,
  )
  return onPick
}

afterEach(cleanup)

describe('LockedBar', () => {
  it('shows the end of a long path with a leading ellipsis', () => {
    renderBar(7)
    const crumbs = screen.getAllByRole('button').map((button) => button.textContent)
    expect(crumbs).toEqual(['section', 'article', 'div', 'p', 'span', 'a'])
    expect(screen.getByRole('navigation').textContent).toMatch(/^…/)
    expect(screen.getByRole('button', { current: true })).toHaveTextContent('a')
  })

  it('keeps the active entry visible when it is at the start of the trail', () => {
    renderBar(0)
    const crumbs = screen.getAllByRole('button').map((button) => button.textContent)
    expect(crumbs).toEqual(['body', 'main', 'section', 'article', 'div', 'p'])
    expect(screen.getByRole('button', { current: true })).toHaveTextContent('body')
    expect(screen.getByRole('navigation').textContent).toMatch(/…$/)
  })

  it('locks the node of a clicked crumb', () => {
    const onPick = renderBar(7)
    screen.getByRole('button', { name: 'section' }).click()
    expect(onPick).toHaveBeenCalledWith(path[2]?.node)
  })
})
