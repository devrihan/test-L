import { NextRequest, NextResponse } from "next/server";

// Forwards the caller's own bearer token to user-registry, which verifies the
// current password (direct grant) and performs the change via the Keycloak
// Admin API. Loam holds no admin credential; the registry URL stays
// server-side (not NEXT_PUBLIC_) so the browser only ever talks to this route.
export async function POST(req: NextRequest) {
  const base = process.env.USER_REGISTRY_URL;
  if (!base) {
    // Explicit failure over a silent no-op: a deploy missing the env var must
    // surface on first use, not swallow password changes.
    return NextResponse.json({ error: "USER_REGISTRY_URL is not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  const body = await req.text();
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, "")}/api/users/me/password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
      // Generous on purpose: user-registry bounds its own Keycloak calls at
      // 5s, so the backend reaches a definite outcome well before this fires
      // — this proxy giving up must never race a change that then completes.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json({ error: "The account service is unreachable" }, { status: 502 });
  }
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => ({ error: "Unexpected response from the account service" }));
  return NextResponse.json(data, { status: res.status });
}
