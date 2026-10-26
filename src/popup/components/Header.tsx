import type { ReactNode } from 'react'
import { APP_NAME } from '@/shared/constants'
import { Logo } from '@/ui'

export interface HeaderProps {
  /** Replaces the logo + product name (settings screen: back button + title). */
  leading?: ReactNode
  title?: ReactNode
  trailing?: ReactNode
}

export function Header({ leading, title = APP_NAME, trailing }: HeaderProps) {
  return (
    <header className="flex h-28 items-center gap-5 border-b border-border px-8">
      {leading ?? <Logo />}
      <h1 className="m-0 min-w-0 flex-1 truncate text-md font-semibold text-fg">{title}</h1>
      {trailing}
    </header>
  )
}
