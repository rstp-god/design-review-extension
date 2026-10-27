import { create } from 'zustand'
import type { Point } from '@/content/position'
import type { SessionSummary } from '@/shared/model'

/** Active instrument of the toolbar. Area and snapshot arrive with their features. */
export type Tool = 'none' | 'picker'
/** `picking`: hover follows the pointer · `locked`: a node is fixed, arrows move the selection. */
export type PickerMode = 'picking' | 'locked'

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
  setSession: (session: SessionSummary | null) => void
  setPagePath: (pagePath: string) => void
  setCollapsed: (collapsed: boolean) => void
  setPosition: (position: Point | null) => void
  /** Switching tools always starts the picker in `picking`. */
  setTool: (tool: Tool) => void
  setPickerMode: (mode: PickerMode) => void
  togglePicker: () => void
}

export const useOverlayStore = create<OverlayState>()((set) => ({
  session: null,
  pagePath: '/',
  collapsed: false,
  position: null,
  tool: 'none',
  pickerMode: 'picking',
  setSession: (session) => set({ session }),
  setPagePath: (pagePath) => set({ pagePath }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setPosition: (position) => set({ position }),
  setTool: (tool) => set({ tool, pickerMode: 'picking' }),
  setPickerMode: (pickerMode) => set({ pickerMode }),
  togglePicker: () =>
    set((state) => ({ tool: state.tool === 'picker' ? 'none' : 'picker', pickerMode: 'picking' })),
}))
