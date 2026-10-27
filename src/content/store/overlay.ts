import { create } from 'zustand'
import type { Point } from '@/content/position'
import type { SessionSummary } from '@/shared/model'

/** Active instrument of the toolbar. The snapshot arrives with its feature. */
export type Tool = 'none' | 'picker' | 'area'
/** `picking`: hover follows the pointer · `locked`: a node is fixed, arrows move the selection. */
export type PickerMode = 'picking' | 'locked'
/**
 * `drawing`: waiting for a drag · `dragging`: the pointer is down and the rectangle follows it ·
 * `adjusting`: a rectangle is there, with handles and actions. `Esc` goes one step back.
 */
export type AreaMode = 'drawing' | 'dragging' | 'adjusting'

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
}

const freshModes = { pickerMode: 'picking', areaMode: 'drawing' } as const

export const useOverlayStore = create<OverlayState>()((set) => ({
  session: null,
  pagePath: '/',
  collapsed: false,
  position: null,
  tool: 'none',
  pickerMode: 'picking',
  areaMode: 'drawing',
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
}))
