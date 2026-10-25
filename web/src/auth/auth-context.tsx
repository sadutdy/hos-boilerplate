import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, tokenStore, type AuthResponse } from '@/lib/api'

export interface Session {
  role: string
  permissions: string[]
  hospitalName: string | null
}

interface AuthContextValue {
  session: Session | null
  loading: boolean
  login: (login: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'hos.session'

function readStoredSession(): Session | null {
  if (!tokenStore.get()) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readStoredSession)
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (loginName: string, password: string) => {
    setLoading(true)
    try {
      const payload = await api.post<AuthResponse>('/auth/login', {
        login: loginName,
        password,
      })
      tokenStore.set(payload.token)

      // Reconcile with /auth/bootstrap in case the login response is incomplete.
      let role = payload.user?.role
      let permissions = payload.permissions ?? []
      let hospitalName: string | null = payload.hospitalName ?? null
      try {
        const boot = await api.get<{
          user: { role: string }
          permissions: string[]
          hospitalName?: string | null
        }>('/auth/bootstrap')
        role = boot.user?.role ?? role
        permissions = boot.permissions ?? permissions
        hospitalName = boot.hospitalName ?? hospitalName
      } catch {
        // bootstrap failed but login succeeded: keep what login gave us
      }

      if (!role) {
        throw new Error('Login response did not include a role.')
      }

      const next: Session = { role, permissions, hospitalName }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setSession(next)
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    tokenStore.set(null)
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
  }, [])

  const value = useMemo(
    () => ({ session, loading, login, logout }),
    [session, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Route-scoped permission helpers wired to the role groups in the spec. */
/** `permission` may be a list: any one of the keys is enough. */
export function can(session: Session | null, permission: string | readonly string[] | undefined): boolean {
  if (!session) return false
  if (!permission) return true
  // Admin always has everything (seeded) — rebuild-spec README §1.1
  if (session.role === 'admin') return true
  const keys = typeof permission === 'string' ? [permission] : permission
  return keys.some((k) => session.permissions.includes(k))
}
