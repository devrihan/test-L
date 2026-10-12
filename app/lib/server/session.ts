import "server-only";
import { cookies } from "next/headers";

// The scope key used to resolve school-scoped config docs. Read from the
// Keycloak access token that login stores in the `token` cookie
// (app/lib/auth.ts stores the raw access_token there). The payload is decoded
// WITHOUT signature verification — fine for config scoping (non-sensitive
// product flags); real authorization still happens at the APIs.
//
// Two claims feed the scope, with distinct jobs:
//
// - `schoolId` (required) — identity: which tenant the account belongs to.
//   A teacher token carries a real schoolId; admin/ops tokens carry "all",
//   which is NOT special-cased here — config docs carry an "all" subtree so
//   admin flags are managed in config-manager like any school's.
// - `configVariant` (optional) — presentation: which *settings* the account
//   sees. When present, the scope becomes `<schoolId>:<variant>` (e.g.
//   "1:review"), selecting a sibling subtree in each config doc. The account
//   stays a normal member of its school everywhere else — data scoping,
//   access-policy, and any future school column keep using the real schoolId.
/**
 * - `anonymous` — no session cookie. Correct on /login, which renders before
 *   any token exists and reads no config. Not a fault.
 * - `unresolved` — a token that carries no usable schoolId claim. That IS a
 *   fault: the account cannot be scoped to a school, so no config applies to
 *   it.
 * - `resolved` — the scope key to read config for.
 */
export type SessionScope =
  | { status: "anonymous" }
  | { status: "unresolved" }
  | { status: "resolved"; scope: string };

export async function configScopeFromSession(): Promise<SessionScope> {
  // Scope override: lets flag work proceed before the token carries the
  // claims. Used verbatim, so it can name a variant scope directly (e.g.
  // "1:review"). Honored in dev, and in prod only while stub mode is on
  // (single-school interim) — remove both env vars at config-manager cutover.
  if (
    process.env.CONFIG_DEV_SCHOOL &&
    (process.env.NODE_ENV !== "production" || process.env.CONFIG_STUB_ENABLED === "true")
  ) {
    return { status: "resolved", scope: process.env.CONFIG_DEV_SCHOOL };
  }
  const token = (await cookies()).get("token")?.value;
  if (!token) return { status: "anonymous" };
  const payload = decodeJwtPayload(token);
  if (!payload) return { status: "unresolved" };
  // Claims may be numeric (e.g. 1); coerce to string. "all" passes through as
  // a regular key — the doc's "all" subtree is the admin flag set.
  const rawSchool = payload["schoolId"];
  if (rawSchool == null || rawSchool === "") return { status: "unresolved" };
  const school = String(rawSchool);
  // Absent and empty are NOT the same. No claim means an ordinary account, and
  // it resolves the school's own settings. A claim that is present but blank
  // means somebody set the attribute and it lost its value — a misconfigured
  // account, not an ordinary one. So it fails as unresolved.
  const rawVariant = payload["configVariant"];
  if (rawVariant != null && String(rawVariant).trim() === "") return { status: "unresolved" };
  const variant = rawVariant == null ? undefined : String(rawVariant);
  return { status: "resolved", scope: variant ? `${school}:${variant}` : school };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
