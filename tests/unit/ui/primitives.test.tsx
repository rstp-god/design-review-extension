// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Checkbox } from '@/ui/Checkbox'
import { Dialog } from '@/ui/Dialog'
import { Kbd, KeyCombo } from '@/ui/Kbd'
import { Menu } from '@/ui/Menu'
import { Segmented } from '@/ui/Segmented'
import { SeverityDot } from '@/ui/Severity'
import { Tooltip } from '@/ui/Tooltip'
import { renderWithFloatingRoot } from './render'

afterEach(() => {
  cleanup()
})

const scopeOptions = [
  { value: 'domain', label: 'By domain' },
  { value: 'page', label: 'By page' },
  { value: 'other', label: 'Other' },
] as const

function SegmentedHarness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState<string>('domain')
  return (
    <Segmented
      aria-label="Collect issues"
      options={scopeOptions}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      testId="scope"
    />
  )
}

function DialogHarness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete all sessions?"
        description="This cannot be undone."
        actions={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={onConfirm}>
              Delete
            </Button>
          </>
        }
      />
    </>
  )
}

describe('Button', () => {
  it('is a real button with type=button and forwards the click', async () => {
    const onClick = vi.fn()
    renderWithFloatingRoot(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('softDisabled keeps the button focusable but swallows clicks', async () => {
    const onClick = vi.fn()
    renderWithFloatingRoot(
      <Button softDisabled onClick={onClick} aria-label="Picker" iconOnly variant="tool" />,
    )
    const button = screen.getByRole('button', { name: 'Picker' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    button.focus()
    expect(button).toHaveFocus()
  })

  it('marks the active tool', () => {
    renderWithFloatingRoot(<Button variant="tool" active aria-label="Area" iconOnly />)
    expect(screen.getByRole('button', { name: 'Area' })).toHaveAttribute('data-active', 'true')
  })
})

describe('Segmented', () => {
  it('is a labelled group of real radio inputs', async () => {
    const onChange = vi.fn()
    renderWithFloatingRoot(<SegmentedHarness onChange={onChange} />)

    const group = screen.getByRole('group', { name: 'Collect issues' })
    const radios = screen.getAllByRole('radio')
    expect(group).toBeInTheDocument()
    expect(radios).toHaveLength(3)
    expect(radios[0]).toBeChecked()
    expect(radios[1]).not.toBeChecked()
    expect(screen.getByTestId('scope-option-page')).toContainElement(radios[1] as HTMLElement)

    await userEvent.click(screen.getByTestId('scope-option-page'))
    expect(onChange).toHaveBeenLastCalledWith('page')
    expect(radios[1]).toBeChecked()
  })

  it('moves the selection with arrow keys', async () => {
    const onChange = vi.fn()
    renderWithFloatingRoot(<SegmentedHarness onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    const first = radios[0] as HTMLElement

    first.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('page')
    expect(radios[1]).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('domain')
    expect(radios[0]).toHaveFocus()
  })
})

describe('Checkbox', () => {
  it('toggles through its label and reports the change', async () => {
    const onChange = vi.fn()
    renderWithFloatingRoot(<Checkbox label="Typography" onChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: 'Typography' })
    expect(box).not.toBeChecked()
    await userEvent.click(screen.getByText('Typography'))
    expect(box).toBeChecked()
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('Kbd / Badge / SeverityDot', () => {
  it('renders key caps, a count and a shape per severity', () => {
    renderWithFloatingRoot(
      <>
        <Kbd>Esc</Kbd>
        <KeyCombo keys={['Alt', 'Shift', 'R']} />
        <Badge data-testid="count">7</Badge>
        <SeverityDot severity="blocker" />
        <SeverityDot severity="major" />
        <SeverityDot severity="minor" />
      </>,
    )
    expect(screen.getByText('Esc').tagName).toBe('KBD')
    expect(screen.getAllByText(/Alt|Shift|^R$/)).toHaveLength(3)
    expect(screen.getByTestId('count')).toHaveTextContent('7')
    const dots = document.querySelectorAll('[data-severity]')
    expect([...dots].map((dot) => dot.className)).toEqual([
      expect.stringContaining('rounded-pill'),
      expect.stringContaining('rounded-[2px]'),
      expect.stringContaining('rounded-none'),
    ])
  })
})

describe('Tooltip', () => {
  it('opens on hover and on focus, into the floating root', async () => {
    const user = userEvent.setup()
    const { floatingRoot } = renderWithFloatingRoot(
      <Tooltip content={{ label: 'Picker', keys: ['P'] }} openDelay={0}>
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button', { name: 'Trigger' })

    await user.hover(trigger)
    const tooltip = await screen.findByRole('tooltip')
    expect(floatingRoot.contains(tooltip)).toBe(true)
    expect(tooltip).toHaveTextContent('Picker')
    expect(tooltip).toHaveTextContent('P')

    await user.unhover(trigger)
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())

    await act(async () => {
      trigger.focus()
    })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })
})

describe('Menu', () => {
  it('opens on click, navigates with arrows, selects with Enter and closes on Escape', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const { floatingRoot } = renderWithFloatingRoot(
      <Menu
        aria-label="Session actions"
        items={[
          { id: 'open', label: 'Open page', onSelect: onOpen },
          { id: 'delete', label: 'Delete', onSelect: onDelete, danger: true },
        ]}
      >
        <button type="button" aria-label="More" />
      </Menu>,
    )
    const trigger = screen.getByRole('button', { name: 'More' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')

    await user.click(trigger)
    const menu = await screen.findByRole('menu', { name: 'Session actions' })
    expect(floatingRoot.contains(menu)).toBe(true)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onDelete).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    await user.click(trigger)
    await screen.findByRole('menu')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('Dialog', () => {
  it('is a labelled modal in the floating root that closes on Escape and runs the action', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const { floatingRoot } = renderWithFloatingRoot(<DialogHarness onConfirm={onConfirm} />)

    const dialog = await screen.findByRole('dialog', { name: 'Delete all sessions?' })
    expect(floatingRoot.contains(dialog)).toBe(true)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
