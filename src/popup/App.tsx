import { useState } from 'react'
import { Home } from './components/Home'
import { Settings } from './components/Settings'

export type PopupView = 'home' | 'settings'

/** Two screens, no router: the popup is 380 px wide and lives for a few seconds. */
export function App() {
  const [view, setView] = useState<PopupView>('home')

  return view === 'home' ? (
    <Home onOpenSettings={() => setView('settings')} />
  ) : (
    <Settings onBack={() => setView('home')} />
  )
}
