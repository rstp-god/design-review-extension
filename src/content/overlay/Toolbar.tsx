import { TestId } from '@tests/constants/testIds'
import {
  Download,
  GripVertical,
  List,
  Minus,
  MousePointer2,
  Snowflake,
  SquareDashed,
  X,
} from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import { useTranslation } from 'react-i18next'
import { clampToViewport, defaultToolbarPosition, type Point } from '@/content/position'
import { useOverlayStore } from '@/content/store/overlay'
import { loadToolbarState, saveToolbarState } from '@/content/toolbarState'
import { Badge, Button, cn, Logo, Tooltip } from '@/ui'
import { useDrag } from './useDrag'

const ICON_SIZE = 20
const KEYBOARD_STEP_PX = 8

export interface ToolbarProps {
  onExit: () => void
}

function viewportSize() {
  return { w: window.innerWidth, h: window.innerHeight }
}

/**
 * Floating toolbar (spec 3.2, screens.md §03). In the extension shell the tools are visible but
 * `softDisabled` with a "coming soon" tooltip; the grip, collapse / expand and exit are live.
 * Position and collapsed state persist per device through toolbarState.ts.
 */
export function Toolbar({ onExit }: ToolbarProps) {
  const { t } = useTranslation('overlay')
  const { t: tCommon } = useTranslation('common')
  const collapsed = useOverlayStore((state) => state.collapsed)
  const position = useOverlayStore((state) => state.position)
  const setCollapsed = useOverlayStore((state) => state.setCollapsed)
  const setPosition = useOverlayStore((state) => state.setPosition)
  const issueCount = useOverlayStore((state) => state.session?.issueCount ?? 0)
  const box = useRef<HTMLDivElement>(null)
  const restored = useRef(false)

  const measure = useCallback(() => {
    const rect = box.current?.getBoundingClientRect()
    return { w: rect?.width ?? 0, h: rect?.height ?? 0 }
  }, [])

  const persist = useCallback(
    (next: Point | null, nextCollapsed: boolean) => {
      const point = next ?? defaultToolbarPosition(measure(), viewportSize())
      void saveToolbarState({ ...point, collapsed: nextCollapsed })
    },
    [measure],
  )

  // Restore the saved corner once; clamp it in case the window got smaller since.
  useLayoutEffect(() => {
    if (restored.current) return
    restored.current = true
    void loadToolbarState().then((saved) => {
      if (!saved) return
      setCollapsed(saved.collapsed)
      setPosition(clampToViewport({ x: saved.x, y: saved.y }, measure(), viewportSize()))
    })
  }, [measure, setCollapsed, setPosition])

  // Keep the toolbar inside the viewport when the window is resized.
  useEffect(() => {
    const onResize = () => {
      const current = useOverlayStore.getState().position
      if (current) setPosition(clampToViewport(current, measure(), viewportSize()))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure, setPosition])

  const { handlers, dragging, wasDragged } = useDrag({
    position,
    getSize: measure,
    getViewport: viewportSize,
    onMove: setPosition,
    onEnd: (final) => {
      setPosition(final)
      persist(final, collapsed)
    },
  })

  const nudge = (event: KeyboardEvent<HTMLElement>) => {
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -KEYBOARD_STEP_PX, y: 0 },
      ArrowRight: { x: KEYBOARD_STEP_PX, y: 0 },
      ArrowUp: { x: 0, y: -KEYBOARD_STEP_PX },
      ArrowDown: { x: 0, y: KEYBOARD_STEP_PX },
    }
    const step = delta[event.key]
    if (!step) return
    event.preventDefault()
    const base = position ?? defaultToolbarPosition(measure(), viewportSize())
    const next = clampToViewport(
      { x: base.x + step.x, y: base.y + step.y },
      measure(),
      viewportSize(),
    )
    setPosition(next)
    persist(next, collapsed)
  }

  const toggleCollapsed = (next: boolean) => {
    setCollapsed(next)
    persist(position, next)
  }

  const style = position
    ? { left: position.x, top: position.y }
    : { right: 'var(--dr-toolbar-inset)', top: 'var(--dr-toolbar-inset)' }

  const soon = (label: string, keys: readonly string[]) => ({
    label: `${label} · ${tCommon('soon')}`,
    keys,
  })

  if (collapsed) {
    return (
      <div
        ref={box}
        style={style}
        className={cn('pointer-events-auto fixed z-10', dragging && 'select-none')}
      >
        <button
          type="button"
          aria-label={t('toolbar.expand')}
          data-testid={TestId.ToolbarCollapsed}
          {...handlers}
          onClick={() => {
            if (!wasDragged()) toggleCollapsed(false)
          }}
          onKeyDown={nudge}
          className={cn(
            'relative flex size-24 cursor-pointer items-center justify-center rounded-pill',
            'border border-border bg-bg shadow-float touch-none',
            'transition-colors duration-(--dr-duration) ease-out hover:bg-surface-hover',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            dragging && 'cursor-grabbing',
          )}
        >
          <Logo size={28} className="rounded-pill" />
          {issueCount > 0 && (
            <Badge
              data-testid={TestId.ToolbarCollapsedBadge}
              className="absolute -top-2 -right-2 border-2 border-bg"
            >
              {issueCount}
            </Badge>
          )}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={box}
      role="toolbar"
      aria-label={t('toolbar.label')}
      data-testid={TestId.Toolbar}
      style={style}
      className={cn(
        'pointer-events-auto fixed z-10 flex items-center gap-1 rounded-2xl border border-border',
        'bg-bg p-6 shadow-float',
        dragging && 'select-none',
      )}
    >
      <button
        type="button"
        aria-label={t('toolbar.drag')}
        data-testid={TestId.ToolbarGrip}
        {...handlers}
        onKeyDown={nudge}
        className={cn(
          'flex h-22 w-12 cursor-grab items-center justify-center rounded-md text-fg-muted touch-none',
          'hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
          dragging && 'cursor-grabbing',
        )}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>

      <Tool
        testId={TestId.ToolbarPicker}
        tooltip={soon(t('toolbar.picker'), ['P'])}
        label={t('toolbar.picker')}
      >
        <MousePointer2 size={ICON_SIZE} aria-hidden="true" />
      </Tool>
      <Tool
        testId={TestId.ToolbarArea}
        tooltip={soon(t('toolbar.area'), ['A'])}
        label={t('toolbar.area')}
      >
        <SquareDashed size={ICON_SIZE} aria-hidden="true" />
      </Tool>
      <Tool
        testId={TestId.ToolbarFreeze}
        tooltip={soon(t('toolbar.freeze'), ['F'])}
        label={t('toolbar.freeze')}
      >
        <Snowflake size={ICON_SIZE} aria-hidden="true" />
      </Tool>

      <Separator />

      <span className="relative inline-flex">
        <Tool
          testId={TestId.ToolbarIssues}
          tooltip={soon(t('toolbar.issues'), [])}
          label={t('toolbar.issues')}
        >
          <List size={ICON_SIZE} aria-hidden="true" />
        </Tool>
        {issueCount > 0 && (
          <Badge
            data-testid={TestId.ToolbarIssuesBadge}
            className="pointer-events-none absolute -top-2 -right-2 border-2 border-bg"
          >
            {issueCount}
          </Badge>
        )}
      </span>
      <Tool
        testId={TestId.ToolbarExport}
        tooltip={soon(t('toolbar.export'), [])}
        label={t('toolbar.export')}
      >
        <Download size={ICON_SIZE} aria-hidden="true" />
      </Tool>

      <Separator />

      <Tooltip content={t('toolbar.collapse')}>
        <Button
          variant="tool"
          size="lg"
          iconOnly
          aria-label={t('toolbar.collapse')}
          data-testid={TestId.ToolbarCollapse}
          onClick={() => toggleCollapsed(true)}
        >
          <Minus size={ICON_SIZE} aria-hidden="true" />
        </Button>
      </Tooltip>
      <Tooltip content={{ label: t('toolbar.exit'), keys: ['Esc'] }}>
        <Button
          variant="tool"
          size="lg"
          iconOnly
          aria-label={t('toolbar.exit')}
          data-testid={TestId.ToolbarExit}
          onClick={onExit}
        >
          <X size={ICON_SIZE} aria-hidden="true" />
        </Button>
      </Tooltip>
    </div>
  )
}

function Separator() {
  return <span aria-hidden="true" className="mx-2 h-22 w-px bg-divider" />
}

/** A tool that is not implemented yet: visible, focusable, explained by its tooltip. */
function Tool({
  testId,
  label,
  tooltip,
  children,
}: {
  testId: string
  label: string
  tooltip: { label: string; keys: readonly string[] }
  children: ReactNode
}) {
  return (
    <Tooltip content={tooltip}>
      <Button
        variant="tool"
        size="lg"
        iconOnly
        softDisabled
        aria-label={label}
        data-testid={testId}
      >
        {children}
      </Button>
    </Tooltip>
  )
}
