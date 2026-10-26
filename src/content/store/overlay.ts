import { create } from 'zustand'
import type { Point } from '@/content/position'
import type { SessionSummary } from '@/shared/model'

/** Overlay state for one page load. Nothing here is persisted except what toolbarState.ts saves. */
export interface OverlayState {
  session: SessionSummary | null
  /** Normalized pathname of the current page; follows SPA navigation. */
  pagePath: string
  collapsed: boolean
  /** Top-left corner of the toolbar in viewport px; `null` until measured (default corner). */
  position: Point | null
  setSession: (session: SessionSummary | null) => void
  setPagePath: (pagePath: string) => void
  setCollapsed: (collapsed: boolean) => void
  setPosition: (position: Point | null) => void
}

export const useOverlayStore = create<OverlayState>()((set) => ({
  session: null,
  pagePath: '/',
  collapsed: false,
  position: null,
  setSession: (session) => set({ session }),
  setPagePath: (pagePath) => set({ pagePath }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setPosition: (position) => set({ position }),
}))
