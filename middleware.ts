import { NextRequest, NextResponse } from 'next/server'
import { VIEWER_OVERRIDE_COOKIE, landingPathFor, resolveViewerRole } from '@/app/lib/roles'

function decodeToken(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

function isTokenValid(token: string): boolean {
  const payload = decodeToken(token)
  return !!payload && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000 - 30000
}

/**
 * Where "/" sends this request. Decided here rather than in a client component
 * so the redirect costs no JavaScript — the token is already being parsed for
 * expiry, and the role override rides along in a cookie for the same reason.
 *
 * Realm roles are canonicalized by resolveViewerRole itself (the realm ships
 * lowercase/plural names like 'principals' — matched verbatim they resolve
 * nothing and every leadership account would land as TEACHER).
 */
function landingFor(token: string, override: string | undefined): string {
  const payload = decodeToken(token)
  const realm = payload?.realm_access as { roles?: string[] } | undefined
  return landingPathFor(resolveViewerRole(realm?.roles ?? [], override))
}

// Real Keycloak login gating. A logged-in user's role (TEACHER/STUDENT) and
// identity (grade/section/roll/admission claims) then drive which view renders.
// Set NEXT_PUBLIC_REQUIRE_AUTH=false to bypass for local design-preview.
export function middleware(request: NextRequest) {
  // Fail SECURE: auth is enforced unless explicitly disabled — a deployed
  // build must never default to an open dashboard. Local design-preview sets
  // NEXT_PUBLIC_REQUIRE_AUTH=false in .env.local.
  if (process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'false') {
    return NextResponse.next()
  }

  const token = request.cookies.get('token')?.value
  const { pathname } = request.nextUrl
  const isAuthPage = pathname === '/login'
  const hasValidToken = token ? isTokenValid(token) : false

  if (!hasValidToken && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (hasValidToken && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  // "/" is a router, never a page: send leadership to Subjects and everyone
  // else to Home, on the server.
  if (hasValidToken && pathname === '/') {
    const override = request.cookies.get(VIEWER_OVERRIDE_COOKIE)?.value
    return NextResponse.redirect(new URL(landingFor(token as string, override), request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2)).*)'],
}