import { NextResponse } from 'next/server'

// ⚠️ DEV-ONLY auto-login. While middleware auth is bypassed for local preview,
// the browser has no Keycloak token, so calls to the analytics backend 401.
// This route mints a fresh token from Keycloak using SERVER-SIDE credentials
// (DEV_LOGIN_USERNAME / DEV_LOGIN_PASSWORD in the gitignored .env.local) so the
// password never reaches the browser. It's a no-op (404) unless those env vars
// are set, so it stays inert in any real/prod build. Remove before shipping.

export async function POST() {
  const username = process.env.DEV_LOGIN_USERNAME
  const password = process.env.DEV_LOGIN_PASSWORD
  if (!username || !password) {
    return NextResponse.json({ error: 'dev-login disabled' }, { status: 404 })
  }

  const base = process.env.NEXT_PUBLIC_KEYCLOAK_URL
  const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM
  const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'react-app'

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    username,
    password,
  })

  let res: Response
  try {
    res = await fetch(`${base}/realms/${realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Keycloak unreachable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json(
      { error: `Keycloak auth failed (${res.status})`, detail: detail.slice(0, 300) },
      { status: 502 },
    )
  }

  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    return NextResponse.json({ error: 'No access_token in Keycloak response' }, { status: 502 })
  }

  return NextResponse.json({ access_token: data.access_token })
}
