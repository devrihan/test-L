import { NextRequest, NextResponse } from "next/server";

// Forwards the caller's own bearer token to user-registry, which sets the
// email on their Keycloak account (unverified) and mirrors it into app_user.
// Same shape as the change-password proxy: no admin credential in loam, the
// registry URL stays server-side.
export async function POST(req: NextRequest) {
  const base = process.env.USER_REGISTRY_URL;
  if (!base) {
    return NextResponse.json({ error: "USER_REGISTRY_URL is not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  const body = await req.text();
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, "")}/api/users/me/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json({ error: "The account service is unreachable" }, { status: 502 });
  }
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => ({ error: "Unexpected response from the account service" }));
  return NextResponse.json(data, { status: res.status });
}
