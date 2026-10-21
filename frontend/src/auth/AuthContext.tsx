import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { API_BASE, parse } from '../lib/api'
import { AUTH_EXPIRED_EVENT, authFetch, getToken, setToken } from '../lib/http'
import { STATIC_DEMO } from '../lib/demo'
import type { Role } from '../lib/roles'

export interface AuthUser {
  id: number
  email: string
  name: string
  role: Role
  client: string | null
  permissions: string[]
}

interface AuthValue {
  user: AuthUser | null
  /** True while a stored token is being verified on first load. */
  booting: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  can: (permission: string) => boolean
  // Conveniences the pages already use.
  role: Role
  actor: string
  canAdvance: boolean
  canReview: boolean
  canCancel: boolean
}

const AuthContext = createContext<AuthValue | null>(null)

const STATIC_VIEWER: AuthUser = {
  id: 0,
  email: 'viewer@fulfill.demo',
  name: 'Demo viewer',
  role: 'viewer',
  client: null,
  permissions: ['inventory:read', 'receiving:read', 'order:read'],
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(STATIC_DEMO ? STATIC_VIEWER : null)
  const [booting, setBooting] = useState(() => !STATIC_DEMO && getToken() !== null)

  // Restore the session from a stored token.
  useEffect(() => {
    if (!getToken()) return
    authFetch(`${API_BASE}/auth/me`)
      .then((res) => parse<AuthUser>(res))
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setBooting(false))
  }, [])

  // Any 401 from the API (expired or revoked token) signs the user out.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const body = await parse<{ access_token: string; user: AuthUser }>(res)
    setToken(body.access_token)
    setUser(body.user)
  }, [])

  const logout = useCallback(() => {
    if (STATIC_DEMO) return // nothing to sign out of
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthValue>(() => {
    const can = (permission: string) => user?.permissions.includes(permission) ?? false
    return {
      user,
      booting,
      login,
      logout,
      can,
      role: user?.role ?? 'merchant',
      actor: user?.email ?? '',
      canAdvance: can('order:advance'),
      canReview: can('variance:review'),
      canCancel: can('order:cancel'),
    }
  }, [user, booting, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useRole(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useRole must be used inside <AuthProvider>')
  return value
}
