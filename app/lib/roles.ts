// Viewer roles and the priority that decides which view an account lands in.
//
// A PLAIN module on purpose: viewer.tsx is 'use client' and middleware.ts runs
// on the edge, so neither can import the other. Both import this instead —
// previously the leadership list was hand-copied into the landing page and
// could drift from viewer.tsx.

/** Roles with a distinct view, highest authority first. */
export const VIEWER_ROLE_PRIORITY = [
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'HOD',
  'COORDINATOR',
  'TEACHER',
  'STUDENT',
] as const

export type ViewerRole = (typeof VIEWER_ROLE_PRIORITY)[number]

export const LEADERSHIP_ROLES: readonly ViewerRole[] = [
  'PRINCIPAL',
  'VICE_PRINCIPAL',
  'HOD',
  'COORDINATOR',
]

export function isViewerRole(value: string): value is ViewerRole {
  return (VIEWER_ROLE_PRIORITY as readonly string[]).includes(value)
}

export function isLeadershipRole(role: ViewerRole): boolean {
  return LEADERSHIP_ROLES.includes(role)
}

/**
 * The role whose view an account gets, given the roles it holds and the role
 * it last chose in the switcher.
 *
 * The override only counts when the account holds EVERY role — that is when
 * the switcher is on screen. Otherwise priority decides, so a principal who
 * also teaches can't be stranded in the teacher view with no control to leave
 * it. Same rule the client applies; shared so the server can't disagree.
 */
/**
 * Realm role name -> canonical role. Keycloak's realm roles are lowercase and
 * often plural ('principals', 'teachers'); matching them verbatim against the
 * canonical names resolves nothing and every leadership account lands as
 * TEACHER. Owned here (the shared module) so the middleware and the client
 * canonicalize identically; auth.ts imports this map.
 */
export const REALM_ROLE_ALIASES: Record<string, ViewerRole> = {
  teacher: 'TEACHER', teachers: 'TEACHER',
  student: 'STUDENT', students: 'STUDENT',
  principal: 'PRINCIPAL', principals: 'PRINCIPAL',
  'vice-principal': 'VICE_PRINCIPAL', 'vice-principals': 'VICE_PRINCIPAL',
  hod: 'HOD', hods: 'HOD',
  'head-of-department': 'HOD', 'heads-of-department': 'HOD',
  coordinator: 'COORDINATOR', coordinators: 'COORDINATOR',
}

/** One raw realm role -> a canonical viewer role, or null if it isn't one. */
export function canonicalViewerRole(realmRole: string): ViewerRole | null {
  const key = realmRole.trim().toLowerCase().replace(/_/g, '-')
  if (REALM_ROLE_ALIASES[key]) return REALM_ROLE_ALIASES[key]
  const upper = realmRole.trim().toUpperCase().replace(/-/g, '_')
  return isViewerRole(upper) ? upper : null
}

/** Mirror of viewer.tsx's ROLE_INHERITS: leadership implies the teacher view. */
const ROLE_IMPLIES: Record<ViewerRole, readonly ViewerRole[]> = {
  PRINCIPAL: ['VICE_PRINCIPAL'],
  VICE_PRINCIPAL: ['TEACHER'],
  HOD: ['TEACHER'],
  COORDINATOR: ['TEACHER'],
  TEACHER: [],
  STUDENT: [],
}

/** Canonicalized + inheritance-expanded roles, priority-ordered. */
export function availableRolesFrom(heldRoles: readonly string[]): ViewerRole[] {
  const held = new Set<ViewerRole>()
  for (const raw of heldRoles) {
    const role = canonicalViewerRole(raw)
    if (role) held.add(role)
  }
  // transitive closure — the same expansion viewer.tsx applies client-side,
  // so the server can never disagree with the client about canSwitch
  const queue = [...held]
  while (queue.length) {
    for (const implied of ROLE_IMPLIES[queue.pop() as ViewerRole]) {
      if (!held.has(implied)) { held.add(implied); queue.push(implied) }
    }
  }
  return VIEWER_ROLE_PRIORITY.filter((role) => held.has(role))
}

export function resolveViewerRole(
  heldRoles: readonly string[],
  override?: string | null,
): ViewerRole {
  const available = availableRolesFrom(heldRoles)
  const canSwitch = available.length === VIEWER_ROLE_PRIORITY.length
  if (canSwitch && override && isViewerRole(override) && available.includes(override)) {
    return override
  }
  return available[0] ?? 'TEACHER'
}

/** Where a role's view starts. Leadership opens on Subjects, everyone on Home. */
export function landingPathFor(role: ViewerRole): string {
  return isLeadershipRole(role) ? '/subject' : '/dashboard'
}

/** Cookie, not sessionStorage: the middleware has to read it to redirect on
 *  the server. Costs per-tab independence — all tabs now share one choice. */
export const VIEWER_OVERRIDE_COOKIE = 'viewer_role_override'
