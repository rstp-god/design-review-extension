import { create } from 'zustand'
import type { OverlayKey } from '@/content/i18n'
import type { Point } from '@/content/position'
import type { TranslateOptions } from '@/i18n/lite'
import type { SessionSummary } from '@/shared/model'

/** Active instrument of the toolbar; it survives a snapshot and the way back. */
export type Tool = 'none' | 'picker' | 'area'
/** `picking`: hover follows the pointer · `locked`: a node is fixed, arrows move the selection. */
export type PickerMode = 'picking' | 'locked'
/**
 * `drawing`: waiting for a drag · `dragging`: the pointer is down and the rectangle follows it ·
 * `adjusting`: a rectangle is there, with handles and actions. `Esc` goes one step back.
 */
export type AreaMode = 'drawing' | 'dragging' | 'adjusting'

/**
 * `live`: the tools read the page · `countdown`: a delayed snapshot is pending · `capturing`: the
 * screenshot and the walk are in flight · `snapshot`: the tools read the frozen picture (spec 3.5).
 */
export type SnapshotPhase = 'live' | 'countdown' | 'capturing' | 'snapshot'

export interface CountdownState {
  /** `Date.now()` of the shutter. */
  endsAt: number
  /** Seconds the countdown started with (the ring's full circle). */
  total: number
}

export interface SnapshotMeta {
  /** `Date.now()` the picture was taken. */
  takenAt: number
}

/** A short status message at the bottom of the screen; the key is an `overlay` i18n key. */
export interface ToastState {
  id: number
  key: OverlayKey
  params?: TranslateOptions
}

/** Overlay state for one page load. Nothing here is persisted except what toolbarState.ts saves. */
export interface OverlayState {
  session: SessionSummary | null
  /** Normalized pathname of the current page; follows SPA navigation. */
  pagePath: string
  collapsed: boolean
  /** Top-left corner of the toolbar in viewport px; `null` until measured (default corner). */
  position: Point | null
  tool: Tool
  pickerMode: PickerMode
  areaMode: AreaMode
  snapshotPhase: SnapshotPhase
  countdown: CountdownState | null
  snapshotMeta: SnapshotMeta | null
  toast: ToastState | null
  setSession: (session: SessionSummary | null) => void
  setPagePath: (pagePath: string) => void
  setCollapsed: (collapsed: boolean) => void
  setPosition: (position: Point | null) => void
  /** Switching tools always starts the picker in `picking` and the area in `drawing`. */
  setTool: (tool: Tool) => void
  setPickerMode: (mode: PickerMode) => void
  setAreaMode: (mode: AreaMode) => void
  /** `P`: the picker on or off; from the area tool straight to the picker. */
  togglePicker: () => void
  /** `A`: the area tool on or off; from the picker straight to the area. */
  toggleArea: () => void
  /** `Shift+F` / the menu: a snapshot in `seconds`; pressed again it starts over. */
  startCountdown: (seconds: number, now?: number) => void
  cancelCountdown: () => void
  beginCapture: () => void
  /** The picture is up: the tool stays, a locked node or a drawn area is dropped. */
  setSnapshot: (meta: SnapshotMeta) => void
  /** Back to the live page (also the way out of a failed capture); the tool stays. */
  exitSnapshot: () => void
  showToast: (key: OverlayKey, params?: TranslateOptions) => void
  dismissToast: (id: number) => void
}

const freshModes = { pickerMode: 'picking', areaMode: 'drawing' } as const
let toastSequence = 0

export const useOverlayStore = create<OverlayState>()((set) => ({
  session: null,
  pagePath: '/',
  collapsed: false,
  position: null,
  tool: 'none',
  pickerMode: 'picking',
  areaMode: 'drawing',
  snapshotPhase: 'live',
  countdown: null,
  snapshotMeta: null,
  toast: null,
  setSession: (session) => set({ session }),
  setPagePath: (pagePath) => set({ pagePath }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setPosition: (position) => set({ position }),
  setTool: (tool) => set({ tool, ...freshModes }),
  setPickerMode: (pickerMode) => set({ pickerMode }),
  setAreaMode: (areaMode) => set({ areaMode }),
  togglePicker: () =>
    set((state) => ({ tool: state.tool === 'picker' ? 'none' : 'picker', ...freshModes })),
  toggleArea: () =>
    set((state) => ({ tool: state.tool === 'area' ? 'none' : 'area', ...freshModes })),
  startCountdown: (seconds, now = Date.now()) =>
    set({
      snapshotPhase: 'countdown',
      countdown: { endsAt: now + seconds * 1000, total: seconds },
      snapshotMeta: null,
    }),
  cancelCountdown: () =>
    set((state) =>
      state.snapshotPhase === 'countdown' ? { snapshotPhase: 'live', countdown: null } : {},
    ),
  beginCapture: () => set({ snapshotPhase: 'capturing', countdown: null }),
  setSnapshot: (meta) =>
    set({ snapshotPhase: 'snapshot', countdown: null, snapshotMeta: meta, ...freshModes }),
  exitSnapshot: () =>
    set({ snapshotPhase: 'live', countdown: null, snapshotMeta: null, ...freshModes }),
  showToast: (key, params) => {
    toastSequence += 1
    set({ toast: { id: toastSequence, key, params } })
  },
  dismissToast: (id) => set((state) => (state.toast?.id === id ? { toast: null } : {})),
}))
