import { getArea, setArea } from '@/services/chrome/storage'
import { TOOLBAR_STATE_KEY } from '@/shared/constants'
import type { ToolbarState } from '@/shared/model'
import { toolbarStateSchema } from '@/shared/schemas'

/**
 * Toolbar position and collapsed flag, per device (`chrome.storage.local`, spec F2.2).
 * Unreadable data is treated as "not set" so the toolbar falls back to its default corner.
 */
export async function loadToolbarState(): Promise<ToolbarState | null> {
  const raw = await getArea<unknown>('local', TOOLBAR_STATE_KEY)
  const parsed = toolbarStateSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function saveToolbarState(state: ToolbarState): Promise<void> {
  await setArea('local', TOOLBAR_STATE_KEY, state)
}
