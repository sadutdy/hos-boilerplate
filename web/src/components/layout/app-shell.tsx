import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import { can, useAuth } from '@/auth/auth-context'
import { useTheme } from '@/components/theme-provider'
import { navGroups } from '@/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { session } = useAuth()

  return (
    <nav aria-label="Main" className="flex w-full flex-col gap-5 px-3 py-4">
      {navGroups.map((group) => {
        const items = group.items.filter((item) => can(session, item.permission))
        if (items.length === 0) return null
        return (
          <div key={group.heading}>
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.heading}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/80',
                        'hover:bg-accent hover:text-accent-foreground',
                        isActive &&
                          'bg-accent font-medium text-accent-foreground',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Switch to light appearance' : 'Switch to dark appearance'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </Button>
  )
}

function UserMenu() {
  const { session, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!session) return null

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        className="max-w-48 gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground uppercase"
        >
          {session.role.slice(0, 2)}
        </span>
        <span className="truncate capitalize">{session.role}</span>
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              setOpen(false)
              logout()
            }}
          >
            <LogOut className="size-4 text-muted-foreground" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { session } = useAuth()

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-border px-4 py-4">
        <p className="text-sm font-semibold tracking-tight">
          {session?.hospitalName ?? 'HOS-Boilerplate'}
        </p>
        <p className="text-xs text-muted-foreground">Admin console</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>
    </div>
  )
}

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            aria-hidden
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border shadow-lg">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
