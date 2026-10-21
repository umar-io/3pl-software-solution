const TOKEN_KEY = 'fulfill3pl.token'
export const AUTH_EXPIRED_EVENT = 'auth:expired'

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

/** fetch() that attaches the bearer token and signals the app when it is rejected. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401 && token) {
    setToken(null)
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }
  return res
}
