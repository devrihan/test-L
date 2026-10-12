import { setGAIdentity } from "./analytics";

const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
const KEYCLOAK_REALM = process.env.NEXT_PUBLIC_KEYCLOAK_REALM;
const KEYCLOAK_CLIENT_ID = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;


const TOKEN_KEY = "keycloak_token";
const USER_KEY = "keycloak_user";
const REFRESH_KEY = "keycloak_refresh_token";
const REMEMBER_ME_KEY = "remember_me";
// Set by login(), consumed once by the analytics tag on the first dashboard
// render — see takePendingLogin().
const PENDING_LOGIN_KEY = "ga_pending_login";


export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    token_type: string;
}

export interface User {
    username: string;
    email?: string;
    name?: string;
    roles: string[];
    organization?: string;
    displayRole?: string;
}


function parseJwt(token: string): Record<string, unknown> {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return JSON.parse(jsonPayload);
    } catch {
        return {};
    }
}


// Read the raw `token` cookie the middleware trusts — the client's fallback
// source of truth when browser storage has been wiped (e.g. a tab close cleared
// sessionStorage). Returns null on the server or when the cookie is absent.
function readTokenCookie(): string | null {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

// The storage the user consented to at login: localStorage only when they chose
// remember-me. An absent key (sessions from before this was recorded) defaults
// to localStorage, matching login()'s current default.
function rememberedStorage(): Storage {
    return localStorage.getItem(REMEMBER_ME_KEY) === "false" ? sessionStorage : localStorage;
}

// Write the cookie the middleware validates. With remember-me it carries a
// Max-Age so the session survives a browser restart; without, a plain session
// cookie that dies with the browser. Called at login AND on every token
// refresh — the middleware checks the cookie's exp, so a renewed token that
// only went to storage would still bounce full page loads to /login.
function writeTokenCookie(accessToken: string, rememberMe: boolean): void {
    const exp = parseJwt(accessToken).exp as number | undefined;
    const maxAge = rememberMe && exp ? Math.max(0, Math.floor(exp - Date.now() / 1000)) : undefined;
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
        `token=${accessToken}; path=/; SameSite=Strict` +
        (maxAge != null ? `; Max-Age=${maxAge}` : "") + secure;
}

// Remove every trace of the session from the browser. Shared by logout() and
// a refused refresh (dead session) so the two can't drift.
function clearSessionState(): void {
    for (const s of [localStorage, sessionStorage]) {
        s.removeItem(TOKEN_KEY);
        s.removeItem(USER_KEY);
        s.removeItem(REFRESH_KEY);
        // Left over from when the role override lived in storage; harmless to
        // keep clearing, so an old session can't resurrect one.
        s.removeItem("viewer_role_override");
        // The previous user's grade/section/subject — otherwise the next login
        // inherits a cohort they may not even be able to see.
        s.removeItem("analytics_filters");
        // An unconsumed marker (signed out before the dashboard rendered) must
        // not be attributed to whoever logs in next.
        s.removeItem(PENDING_LOGIN_KEY);
    }
    localStorage.removeItem(REMEMBER_ME_KEY);
    document.cookie = "token=; path=/; Max-Age=0; SameSite=Strict";
    // The override is a COOKIE now (middleware reads it to route "/"), so
    // clearing storage alone left the next login in the previous user's view.
    document.cookie = "viewer_role_override=; path=/; Max-Age=0; SameSite=Lax";
    // Unset the WHOLE analytics identity — user_id, role and school — or the
    // next user's first hits on a shared browser carry the previous user's
    // role/school properties until their own tag effect runs.
    setGAIdentity(null);
}

// ── Session refresh ──────────────────────────────────────────────────────────
// Exchange the stored refresh token for a fresh access token via the same
// /api/auth/token proxy login uses (grant passes through verbatim). Keycloak
// rotates the refresh token on every use, so both tokens are re-stored and the
// middleware cookie is rewritten. Single-flight: parallel callers (every apiGet
// on a page load) share one exchange instead of racing, which matters because a
// rotated-away refresh token is dead — two racing refreshes would kill the
// session Keycloak just renewed.
let refreshInFlight: Promise<string | null> | null = null;

export function refreshSession(): Promise<string | null> {
    if (!refreshInFlight) {
        refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
}

async function doRefresh(): Promise<string | null> {
    const refreshToken = sessionStorage.getItem(REFRESH_KEY) || localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return null;

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("client_id", KEYCLOAK_CLIENT_ID!);
    params.append("refresh_token", refreshToken);

    let response: Response;
    try {
        response = await fetch("/api/auth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });
    } catch {
        // Network blip — leave session state alone; the caller's request will
        // fail visibly and a later attempt can still refresh.
        return null;
    }

    if (!response.ok) {
        // Keycloak refused the refresh token (expired, revoked, or rotated
        // away): the session is dead. Clear it so the 401 path lands the user
        // on /login instead of a silently dataless page.
        clearSessionState();
        return null;
    }

    const tokenData: TokenResponse = await response.json();
    const rememberMe = localStorage.getItem(REMEMBER_ME_KEY) !== "false";
    const storage = rememberedStorage();
    storage.setItem(TOKEN_KEY, tokenData.access_token);
    if (tokenData.refresh_token) storage.setItem(REFRESH_KEY, tokenData.refresh_token);
    writeTokenCookie(tokenData.access_token, rememberMe);
    // Rebuild the stored user from the fresh claims so role changes made in
    // Keycloak take effect at the next refresh, not the next login.
    try { storage.setItem(USER_KEY, JSON.stringify(buildUserFromToken(tokenData.access_token))); } catch { }
    return tokenData.access_token;
}

// True when a JWT is unparseable, has no exp, or is past its exp (30s skew).
function isJwtExpired(token: string): boolean {
    try {
        const exp = parseJwt(token).exp as number;
        return !exp || Date.now() >= exp * 1000 - 30000;
    } catch {
        return true;
    }
}

// The app's canonical role ids. Everything downstream (viewer.tsx, the sidebar)
// works in these, never in raw realm-role strings.
const VALID_ROLES = [
    "ADMIN", "SUPER_ADMIN", "MANAGER", "VIEWER", "TEACHER", "STUDENT",
    "PRINCIPAL", "VICE_PRINCIPAL", "HOD", "COORDINATOR",
];

// Keycloak names the school-leadership realm roles lowercase and plural
// ('principals', 'vice-principals', 'hods'), which is not what VALID_ROLES
// above holds. Map them explicitly.
//
// Exact-key lookup, never a substring/startsWith test: 'vice-principals'
// CONTAINS 'principal', so a loose match would resolve a vice-principal to
// PRINCIPAL — silently handing them the wider scope of the role above them.
const REALM_ROLE_ALIASES: Record<string, string> = {
    "teacher": "TEACHER", "teachers": "TEACHER",
    "student": "STUDENT", "students": "STUDENT",
    "principal": "PRINCIPAL", "principals": "PRINCIPAL",
    "vice-principal": "VICE_PRINCIPAL", "vice-principals": "VICE_PRINCIPAL",
    "hod": "HOD", "hods": "HOD",
    "head-of-department": "HOD", "heads-of-department": "HOD",
    "coordinator": "COORDINATOR", "coordinators": "COORDINATOR",
};

// Human-readable role names. Derived formatting ('VICE_PRINCIPAL' -> 'Vice
// Principal', 'HOD' -> 'Hod') gets these wrong, so the ones that matter are
// spelled out and anything else falls back to the generic formatter.
const ROLE_LABELS: Record<string, string> = {
    TEACHER: "Teacher",
    STUDENT: "Student",
    PRINCIPAL: "Principal",
    VICE_PRINCIPAL: "Vice-principal",
    HOD: "HOD",
    COORDINATOR: "Coordinator",
};

// Highest-authority role first — this decides which single role gets printed
// as `displayRole`. Leadership ranks above TEACHER because every one of these
// roles also carries TEACHER (see the role inheritance in app/lib/viewer.tsx);
// ranking TEACHER first would label every principal in the school "Teacher".
const ROLE_PRIORITY = [
    "PRINCIPAL", "VICE_PRINCIPAL", "HOD", "COORDINATOR",
    "TEACHER", "ADMIN", "SUPER_ADMIN", "MANAGER", "VIEWER", "OPERATIONS", "DEV",
];
const SYSTEM_ROLE_PREFIXES = ["offline_access", "uma_authorization", "default-roles", "manage-account"];

/** One raw realm role -> a canonical role id, or null if it isn't one of ours. */
function canonicalRole(realmRole: string): string | null {
    const key = realmRole.trim().toLowerCase().replace(/_/g, "-");
    if (REALM_ROLE_ALIASES[key]) return REALM_ROLE_ALIASES[key];
    const upper = realmRole.trim().toUpperCase().replace(/-/g, "_");
    return VALID_ROLES.includes(upper) ? upper : null;
}

export function roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Derive the app's User (name, roles, org, display role) from a token's claims.
// Single source for both login and the storage-wiped rebuild in getUser(), so
// the role never silently defaults to Teacher just because keycloak_user was lost.
function buildUserFromToken(token: string, fallbackUsername = ""): User {
    const tokenPayload = parseJwt(token);

    const realmAccess = tokenPayload.realm_access as { roles?: string[] } | undefined;
    const allRealmRoles = realmAccess?.roles ?? [];
    const roles: string[] = Array.from(
        new Set(allRealmRoles.map(canonicalRole).filter((r): r is string => r !== null)),
    );

    // Organization/school name from common Keycloak JWT claims.
    const orgClaim = (
        tokenPayload.school_name ||
        tokenPayload.organization ||
        tokenPayload.org_name ||
        tokenPayload.institution ||
        tokenPayload.tenant ||
        tokenPayload.schoolId
    ) as string | undefined;
    const groups = tokenPayload.groups as string[] | undefined;
    const organization = orgClaim || (groups?.[0]?.replace(/^\//, ''));

    // Most meaningful role for display, in priority order. Matched against the
    // CANONICAL roles, not the raw realm strings — 'principals' never equals
    // 'PRINCIPAL', so matching raw would fall through to the generic branch.
    const rawDisplayRole =
        ROLE_PRIORITY.find((r) => roles.includes(r)) ||
        allRealmRoles.find((r) => !SYSTEM_ROLE_PREFIXES.some((p) => r.toLowerCase().startsWith(p)));
    const displayRole = rawDisplayRole ? roleLabel(rawDisplayRole) : undefined;

    return {
        username: (tokenPayload.preferred_username as string) || fallbackUsername,
        email: tokenPayload.email as string | undefined,
        name: tokenPayload.name as string | undefined,
        roles,
        organization,
        displayRole,
    };
}


// Single-school convenience (school id "1" is the only tenant today). Students
// log in with their RAW admission number (e.g. "BE/00010116"); we derive the
// Keycloak username by normalizing it and appending the school suffix — the same
// convention provisioning uses (user-registry: normalizeAdmissionNo +
// finalizeUsername = "<normalized>.<schoolId>"). This removes the ".1" friction
// at the login box.
// MULTI-SCHOOL: replace this constant with the school chosen on the login form
// (a selector), or retire the auto-append and require the full "<base>.<n>".
const DEFAULT_SCHOOL_ID = "1";

// Mirror of user-registry's normalizeAdmissionNo (provision.ts) — MUST stay in
// sync, or the derived username won't match the provisioned account.
function normalizeAdmissionNo(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, "").replace(/\//g, "-");
}

// Turn whatever the user typed into the identifier Keycloak authenticates:
//   - an email (has "@")              → passed through (Keycloak matches by email)
//   - an already-suffixed username    → passed through, lowercased ("be-….1")
//   - anything else                   → treated as a raw admission number:
//                                       normalized + ".<schoolId>" → the username
// Admission numbers carry "/" and "-" but no ".<digits>" tail, so they never
// collide with the already-suffixed check.
export function resolveLoginIdentifier(input: string): string {
    const v = input.trim();
    if (v.includes("@")) return v;                       // email — leave as typed
    if (/\.\d+$/.test(v)) return v.toLowerCase();        // full "<base>.<schoolId>" username
    return `${normalizeAdmissionNo(v)}.${DEFAULT_SCHOOL_ID}`;  // raw admission number
}

export async function login(
    username: string,
    password: string,
    rememberMe: boolean = true
): Promise<User> {

    const params = new URLSearchParams();
    params.append("grant_type", "password");
    params.append("client_id", KEYCLOAK_CLIENT_ID!);
    params.append("username", resolveLoginIdentifier(username));
    params.append("password", password);

    const response = await fetch("/api/auth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));;
        throw new Error(errorData.error_description || "Authentication failed");
    }

    const tokenData: TokenResponse = await response.json();

    // console.log("Received token data:", tokenData);

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, tokenData.access_token);
    // The refresh token is the session's continuation credential — stored under
    // the same consent rules as the access token, exchanged by refreshSession().
    if (tokenData.refresh_token) storage.setItem(REFRESH_KEY, tokenData.refresh_token);
    // Record the choice so the recovery paths below rehydrate into the same
    // storage the user consented to — never promoting a session-scoped login
    // into a persistent one.
    localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? "true" : "false");

    writeTokenCookie(tokenData.access_token, rememberMe);

    const user = buildUserFromToken(tokenData.access_token, username);
    storage.setItem(USER_KEY, JSON.stringify(user));
    // Can't send the GA event here: /login is in the (auth) route group, and the
    // tag is mounted in the (dashboard) layout — a send would be dropped with
    // "GA has not been initialized". Leave a marker for takePendingLogin().
    // A bare flag, not the role: the tag reads the role off the resolved viewer,
    // so carrying a second copy here only let the two spellings drift apart.
    try { sessionStorage.setItem(PENDING_LOGIN_KEY, "1"); } catch { }
    // A fresh sign-in starts in the account's real role. Without this, a
    // re-authentication that skipped logout (middleware bounce on an expired
    // cookie) inherited the previous session's role override — and the login
    // event above would be recorded under the switched-to role.
    document.cookie = "viewer_role_override=; path=/; Max-Age=0; SameSite=Lax";
    return user;
}

// True exactly once per fresh sign-in; false on a resumed session. Clears the
// marker, so a reload never double-counts.
export function takePendingLogin(): boolean {
    if (typeof window === "undefined") return false;
    try {
        if (sessionStorage.getItem(PENDING_LOGIN_KEY) === null) return false;
        sessionStorage.removeItem(PENDING_LOGIN_KEY);
        return true;
    } catch {
        return false;
    }
}

export async function logout(): Promise<void> {
    try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { }

    clearSessionState();
    window.location.href = "/login";
}


export function getStoredToken(): string | null {
    const stored = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    if (stored) return stored;
    // Storage was wiped (e.g. a tab close cleared sessionStorage) but the cookie
    // the middleware admitted us with may still hold a valid token — recover it
    // and re-hydrate storage so later reads are consistent. Expired/absent → null.
    const cookieToken = readTokenCookie();
    if (cookieToken && !isJwtExpired(cookieToken)) {
        try { rememberedStorage().setItem(TOKEN_KEY, cookieToken); } catch { }
        return cookieToken;
    }
    return null;
}


export function isTokenValid(): boolean {
    const token = getStoredToken();
    if (!token) return false;
    try {
        const payload = parseJwt(token);
        const exp = payload.exp as number;
        if (!exp) return false;
        return Date.now() < exp * 1000 - 30000;
    } catch {
        return false;
    }
}

export function getUserRoles(): string[] {
  // Reuses getUser(), which rebuilds from the token when storage was wiped — so
  // roles survive a tab reopen and the view doesn't default to Teacher.
  return getUser()?.roles ?? [];
}

// Returns the login username (Keycloak preferred_username), distinct from the
// display name. Used for username-gated features (e.g. bulk batch creation).
export function getUsername(): string {
  return getUser()?.username ?? "";
}


export function getSchoolId(): string | null {
  if (typeof window === "undefined") return null;
  const token = getStoredToken();
  if (!token) return null;
  // Never undefined: a token without the claim (or an unparseable one) must
  // yield the declared null, or GA is sent school: undefined and silently
  // drops the property while role stays set.
  const schoolId = parseJwt(token).schoolId;
  return typeof schoolId === "string" && schoolId !== "" ? schoolId : null;
}

// Keycloak's opaque user id (`sub`, a UUID). The ONLY identifier safe to send
// to analytics: preferred_username and name both carry the person's real name.
export function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  const token = getStoredToken();
  if (!token) return null;
  const sub = parseJwt(token).sub;
  return typeof sub === "string" && sub !== "" ? sub : null;
}

// The logged-in student's identity, read from the Keycloak token claims. A
// student token carries grade/section/school + roll/admission (Keycloak user
// attributes); a teacher/admin token carries grade='all'/section='all'. This is
// how the personal student dashboard knows WHICH student to show — the decision
// flows from the login, not a picker. Returns null if no fields are present
// (e.g. a teacher account), in which case callers fall back to the roster picker.
export interface StudentIdentity {
  grade?: string
  section?: string
  subject?: string
  schoolId?: string
  rollNumber?: string
  admissionNo?: string
}

export function getStudentIdentity(): StudentIdentity | null {
  if (typeof window === "undefined") return null;
  const token = getStoredToken();
  if (!token) return null;
  const c = parseJwt(token);
  const str = (v: unknown) => (v == null || v === "all" || v === "" ? undefined : String(v));
  const identity: StudentIdentity = {
    grade: str(c.grade),
    section: str(c.section),
    subject: str(c.subject),
    schoolId: str(c.schoolId), // exact claim contract — the Keycloak attribute is `schoolId`
    rollNumber: str(c.roll_number ?? c.rollNumber ?? c.roll),
    admissionNo: str(c.admission_no ?? c.admissionNo ?? c.admission_number),
  };
  // Null when nothing identifying is present (teacher/admin scope = 'all').
  const hasAny = Object.values(identity).some((v) => v !== undefined);
  return hasAny ? identity : null;
}

// Reflect a just-saved email into the stored user object so the UI shows it
// immediately — the JWT itself only carries the new claim after a re-login.
export function updateStoredUserEmail(email: string): void {
  for (const storage of [sessionStorage, localStorage]) {
    const raw = storage.getItem(USER_KEY);
    if (!raw) continue;
    try {
      const user = JSON.parse(raw) as User;
      user.email = email;
      storage.setItem(USER_KEY, JSON.stringify(user));
    } catch { }
  }
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const userStr = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
  if (!userStr) {
    // Storage wiped, but the token (via getStoredToken's cookie fallback) still
    // identifies us — rebuild the user so the role isn't lost and silently
    // defaulted to Teacher. Re-hydrate storage for consistency.
    const token = getStoredToken();
    if (!token) return null;
    const rebuilt = buildUserFromToken(token);
    try { rememberedStorage().setItem(USER_KEY, JSON.stringify(rebuilt)); } catch { }
    return rebuilt;
  }
  try {
    const user = JSON.parse(userStr) as User;
    // Backfill fields that may be missing from older stored objects
    if (!user.organization || !user.displayRole) {
      const token = getStoredToken();
      if (token) {
        const payload = parseJwt(token);
        if (!user.organization) {
          const orgClaim = (
            payload.school_name || payload.organization || payload.org_name ||
            payload.institution || payload.tenant || payload.schoolId
          ) as string | undefined;
          const groups = payload.groups as string[] | undefined;
          user.organization = orgClaim || groups?.[0]?.replace(/^\//, '');
        }
        if (!user.displayRole) {
          const realmAccess = payload.realm_access as { roles?: string[] } | undefined;
          const allRealmRoles = realmAccess?.roles ?? [];
          const canonical = allRealmRoles.map(canonicalRole).filter((r): r is string => r !== null);
          const raw = ROLE_PRIORITY.find((r) => canonical.includes(r)) ||
            allRealmRoles.find((r) => !SYSTEM_ROLE_PREFIXES.some((p) => r.toLowerCase().startsWith(p)));
          user.displayRole = raw ? roleLabel(raw) : undefined;
        }
      }
    }
    return user;
  } catch {
    return null;
  }
}