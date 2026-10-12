// Shared API client for the LOAM backend services.
//
// Two services sit behind the frontend (see BACKEND_INTEGRATION_PLAN.md):
//   - aggregatedData (:8082) — the analytics warehouse over loam_db. Serves
//     almost everything the UI shows (chapters, questions, students, …).
//   - beaver-api (:4000)     — the ops DB (loam_ops). Only needed for scanned
//     answer-image evidence.
//
// This is the single place that knows how to talk to them: base URLs from env,
// auth-token injection, and uniform error handling. Feature modules (e.g.
// chapters.ts) build on `apiGet` and never touch fetch/env directly.

import { getStoredToken, logout, refreshSession } from './auth'

// A 401 from the backend means the stored session is no longer accepted (token
// expired/invalid). Don't strand the user on a dataless dashboard — clear auth
// and redirect to login. Guarded so several concurrent 401s trigger a single
// logout/redirect, and a no-op on the server (no window).
let handlingUnauthorized = false
function handleUnauthorized() {
  if (handlingUnauthorized || typeof window === 'undefined') return
  handlingUnauthorized = true
  void logout()
}

// Both API-URL env vars historically point at aggregatedData (:8082). We keep
// them distinct so they can diverge later without touching call sites.
export const AGGREGATED_API_BASE =
  process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8082'

export const BEAVER_API_BASE =
  process.env.NEXT_PUBLIC_BEAVER_API_URL || 'http://localhost:4000'

// Thrown for any non-2xx response or network failure. Carries the HTTP status
// (0 = the request never reached the server) so callers can distinguish
// "backend down" from "backend said no".
export class ApiError extends Error {
  readonly status: number
  readonly url: string
  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

export type QueryParams = Record<string, string | number | boolean | string[] | null | undefined>

// ── Auth token resolution ────────────────────────────────────────────────────
// A real Keycloak login (getStoredToken) always wins. When there's none — the
// usual state while middleware auth is bypassed for local preview — we fall
// back to the DEV-ONLY /api/auth/dev-login route, which mints a token from
// server-side creds. The result is cached in memory until ~30s before expiry.
// In any build without DEV_LOGIN_* configured, dev-login 404s and this returns
// null, so behaviour is unchanged.
let devTokenCache: { token: string; expMs: number } | null = null

function jwtExpMs(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch {
    return 0
  }
}

function isExpired(token: string): boolean {
  const exp = jwtExpMs(token)
  // Treat unparseable/exp-less tokens as expired so we fall back to dev-login.
  return exp === 0 || Date.now() >= exp - 30_000
}

async function getAuthToken(): Promise<string | null> {
  // A real Keycloak login wins — but only while its token is still valid.
  // A stale/expired one in storage must NOT shadow the dev-login fallback.
  const stored = getStoredToken()
  if (stored && !isExpired(stored)) return stored

  // Expired or missing access token but a live refresh token: renew the
  // session in place (single-flight inside refreshSession). Only a genuinely
  // dead session falls past this point.
  const refreshed = await refreshSession()
  if (refreshed) return refreshed

  if (devTokenCache && Date.now() < devTokenCache.expMs - 30_000) {
    return devTokenCache.token
  }

  try {
    const res = await fetch('/api/auth/dev-login', { method: 'POST' })
    if (!res.ok) return null
    const { access_token } = (await res.json()) as { access_token?: string }
    if (!access_token) return null
    devTokenCache = { token: access_token, expMs: jwtExpMs(access_token) || Date.now() + 60_000 }
    return access_token
  } catch {
    return null
  }
}

function buildUrl(base: string, path: string, params?: QueryParams): string {
  const url = new URL(path.replace(/^\//, ''), base.endsWith('/') ? base : base + '/')
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      // Skip empty params so optional backend filters (section/subject/exam)
      // are simply omitted rather than sent as "".
      if (value === null || value === undefined || value === '') continue
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, v)
        continue
      }
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

/**
 * GET a JSON resource from one of the backend services.
 *
 * @param base   one of AGGREGATED_API_BASE / BEAVER_API_BASE
 * @param path   path beginning with "/api/…"
 * @param params query params; empty/nullish values are dropped
 */
export async function apiGet<T>(
  base: string,
  path: string,
  params?: QueryParams,
  init?: RequestInit,
): Promise<T> {
  const url = buildUrl(base, path, params)
  const token = await getAuthToken()

  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
      // Auth is via the Bearer header, not cookies. Leaving credentials at the
      // default ('same-origin') avoids the CORS wildcard-vs-credentials clash
      // when calling the cross-origin backend (which allows origin '*').
    })
  } catch (err) {
    // Network-level failure (backend down, DNS, CORS preflight blocked).
    throw new ApiError(
      `Network error reaching ${url}: ${err instanceof Error ? err.message : String(err)}`,
      0,
      url,
    )
  }

  if (!res.ok) {
    // Bounce to login only on a genuinely dead SESSION — our token is missing or
    // expired — instead of leaving the user stuck on a dataless page. A lone 401
    // while the token is still valid must NOT log the user out.
    if (res.status === 401) {
      const t = getStoredToken()
      if (!t || isExpired(t)) handleUnauthorized()
    }
    const body = await res.text().catch(() => '')
    throw new ApiError(
      `Request failed (${res.status}) for ${url}${body ? `: ${body.slice(0, 200)}` : ''}`,
      res.status,
      url,
    )
  }

  return res.json() as Promise<T>
}
