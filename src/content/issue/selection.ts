import type { Rect } from '@/shared/model'

/** Selection stays in the isolated world; the DOM reference is never sent across contexts. */
export interface IssueSelection {
  target:
    | { kind: 'element'; selector: string; path: string[]; rect: Rect }
    | { kind: 'area'; rect: Rect }
  styles?: Record<string, string>
  element?: Element
}
