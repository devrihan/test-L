'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getUser, roleLabel, type User } from './auth'
import {
  VIEWER_OVERRIDE_COOKIE,
  VIEWER_ROLE_PRIORITY,
  isLeadershipRole,
  isViewerRole,
  type ViewerRole,
} from './roles'
import { fetchLoggedInStudent, type LoggedInStudent } from './student-identity'
import teacherFixture from '@/mocks/viewer.teacher.json'
import studentFixture from '@/mocks/viewer.student.json'
import principalFixture from '@/mocks/viewer.principal.json'
import vicePrincipalFixture from '@/mocks/viewer.vice-principal.json'
import hodFixture from '@/mocks/viewer.hod.json'
import coordinatorFixture from '@/mocks/viewer.coordinator.json'

// A tagged union, never a nullable pair — see docs/student-role-plan.md. Each
// variant carries only the ids that mean something for it, so there is no
// field whose `null` reads as "everything" in one role and "nothing" in
// another.
export type Scope =
  | { kind: 'self'; studentIds: string[] }
  | { kind: 'classes'; classIds: string[] }
  // Whole school — principal / vice-principal. Deliberately carries no ids:
  // an empty list would be indistinguishable from "no access".
  | { kind: 'org' }
  // A head of department sees the subjects their department owns.
  | { kind: 'department'; departmentIds: string[] }
  // A coordinator sees the grades they coordinate, across all subjects.
  | { kind: 'grades'; gradeIds: string[] }

export interface ViewerContext {
  userId: string
  displayName: string
  organization: string
  roleLabel: string
  capabilities: {
    view_class_aggregate: boolean
    view_cohort_analysis: boolean
    view_student_roster: boolean
    view_cross_subject_summary: boolean
    /** The Subjects directory — nav item + /subject. Leadership roles only. */
    view_subject_directory: boolean
    /** The sidebar's "Switch to teacher view" card. */
    switch_to_teacher_view: boolean
  }
  questionsView: 'analysis' | 'browser'
  /**
   * Which sidebar composition to render. Not a boolean, for the same reason
   * `questionsView` isn't: the leadership sidebar is a different list, not the
   * teacher's list with items hidden. A new role later is a new value here,
   * and nothing else branches on a role name.
   */
  navView: 'teacher' | 'student' | 'leadership'
  scope: Scope
}

// Role list, priority and the leadership check all live in ./roles so the edge
// middleware shares them; re-exported here for this module's existing callers.
export { isLeadershipRole, type ViewerRole }

/**
 * Role inheritance, as modelled in Keycloak: `teachers` is the base;
 * coordinator, hods and vice-principals each inherit it; principals inherits
 * vice-principals. Every one of these people *is* a teacher with extra reach,
 * which is what the "Switch to teacher view" card in the sidebar exists for.
 *
 * Keycloak composite roles normally mean the JWT already lists the inherited
 * roles, so expanding here is usually redundant — it's done anyway so view
 * switching doesn't silently break if the realm is ever wired up flat.
 */
const ROLE_INHERITS: Record<ViewerRole, readonly ViewerRole[]> = {
  PRINCIPAL: ['VICE_PRINCIPAL'],
  VICE_PRINCIPAL: ['TEACHER'],
  HOD: ['TEACHER'],
  COORDINATOR: ['TEACHER'],
  TEACHER: [],
  STUDENT: [],
}

/** Transitive closure of ROLE_INHERITS, excluding the role itself. */
function inheritedRoles(role: ViewerRole): Set<ViewerRole> {
  const out = new Set<ViewerRole>()
  const queue = [...ROLE_INHERITS[role]]
  while (queue.length) {
    const next = queue.shift()!
    if (out.has(next)) continue
    out.add(next)
    queue.push(...ROLE_INHERITS[next])
  }
  return out
}

// A cookie rather than sessionStorage: middleware.ts redirects "/" on the
// server and has to see this, otherwise an account with an override lands on
// the wrong view and gets bounced. The cost is that all tabs now share one
// choice — sessionStorage was per-tab.
function readOverrideCookie(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${VIEWER_OVERRIDE_COOKIE}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

function writeOverrideCookie(role: ViewerRole): void {
  // Session cookie (no Max-Age): dies with the browser, like the sessionStorage
  // it replaces. Not HttpOnly — the client reads it too.
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${VIEWER_OVERRIDE_COOKIE}=${encodeURIComponent(role)}; path=/; SameSite=Lax${secure}`
}

const FIXTURES: Record<ViewerRole, ViewerContext> = {
  TEACHER: teacherFixture as ViewerContext,
  STUDENT: studentFixture as ViewerContext,
  PRINCIPAL: principalFixture as ViewerContext,
  VICE_PRINCIPAL: vicePrincipalFixture as ViewerContext,
  HOD: hodFixture as ViewerContext,
  COORDINATOR: coordinatorFixture as ViewerContext,
}

/**
 * The roles this account can actually render a distinct view for, in priority
 * order — i.e. what the sidebar switcher offers.
 *
 * Leadership roles gain TEACHER even when the JWT omits it, because they
 * inherit it. Intermediate leadership roles are deliberately NOT added: there
 * is one leadership view, so offering a principal a separate "Vice-principal"
 * entry would promise a screen that doesn't exist.
 */
function availableViewerRoles(user: User | null): ViewerRole[] {
  if (!user) return []
  const granted = VIEWER_ROLE_PRIORITY.filter((role) => user.roles.includes(role))
  const offered = new Set<ViewerRole>(granted)
  if (granted.some((role) => inheritedRoles(role).has('TEACHER'))) offered.add('TEACHER')
  return VIEWER_ROLE_PRIORITY.filter((role) => offered.has(role))
}

// Today: picks a fixture by role. Later: this becomes a `fetch('/api/viewer')`
// call — callers of useViewer() do not change.
export function resolveViewerContext(user: User | null): ViewerContext | null {
  const [defaultRole] = availableViewerRoles(user)
  return defaultRole ? FIXTURES[defaultRole] : FIXTURES.TEACHER
}

interface ViewerState {
  viewer: ViewerContext | null
  availableRoles: ViewerRole[]
  activeRole: ViewerRole
  /** False until the stored user has actually been read. `activeRole` falls back
   * to TEACHER before that, so anything that PRINTS the role (the sidebar's
   * "Teacher Access" line) must wait for this — otherwise a student is shown a
   * teacher label for the whole of first paint + hydration (beaver#786). */
  roleResolved: boolean
  /**
   * The other view this account can switch to, or null — what the sidebar's
   * "Switch to … view" card offers.
   *
   * Computed from the roles the ACCOUNT holds, never from the active viewer.
   * Reading `capabilities.switch_to_teacher_view` off the active viewer would
   * work in the leadership view and then vanish in the teacher view (whose
   * fixture has it false), stranding a principal with no way back.
   */
  alternateViewRole: ViewerRole | null
  /**
   * Whether to offer the role switcher. True only for an account holding EVERY
   * role — a test/admin login. A real principal who also carries TEACHER gets
   * no dropdown: the sidebar already shows both groups, so there is nothing to
   * switch to, and they simply land on their highest-priority view.
   */
  canSwitchRoles: boolean
  setActiveRole: (role: ViewerRole) => void
}

const ViewerStateContext = createContext<ViewerState | null>(null)

// Single source of truth for the active viewer role. Mounted once, high in
// the tree (the dashboard layout), so the sidebar switcher and every page
// under it read/write the same state — a plain hook with its own useState
// per call-site would let each consumer drift out of sync with the others
// (e.g. the sidebar switches role but the page below it doesn't re-render).
export function ViewerProvider({ children }: { children: ReactNode }) {
  // undefined = storage not read yet (SSR + first client render); null = read,
  // nobody logged in. Keeping those apart is what lets the UI hold off on
  // naming a role it doesn't know yet.
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [overrideRole, setOverrideRole] = useState<ViewerRole | null>(null)

  useEffect(() => {
    setUser(getUser())
    const stored = readOverrideCookie()
    if (stored && isViewerRole(stored)) setOverrideRole(stored)
  }, [])

  const availableRoles = availableViewerRoles(user ?? null)
  const roleResolved = user !== undefined
  // Every role, not just more than one — see the field's note above.
  const canSwitchRoles = availableRoles.length === VIEWER_ROLE_PRIORITY.length
  // The override is honoured ONLY when the switcher is on screen. A principal
  // who also teaches holds TEACHER, so a stale "TEACHER" override would win
  // over priority and strand them in the teacher view with no dropdown to
  // undo it. Without the switcher, priority always decides.
  const activeRole =
    canSwitchRoles && overrideRole && availableRoles.includes(overrideRole)
      ? overrideRole
      : availableRoles[0] ?? 'TEACHER'

  function setActiveRole(role: ViewerRole) {
    writeOverrideCookie(role)
    setOverrideRole(role)
  }

  // Resolve the real logged-in student (email -> admission -> loam_db student)
  // so the student view shows the actual person, not the fixture. Only in the
  // STUDENT view; teacher/admin scope ('all') resolves to null and keeps the
  // fixture. This is how the personal dashboard's identity flows from the login.
  const [student, setStudent] = useState<LoggedInStudent | null>(null)
  useEffect(() => {
    if (activeRole === 'STUDENT' && user) {
      let ignore = false
      fetchLoggedInStudent().then((s) => { if (!ignore) setStudent(s) })
      return () => { ignore = true }
    }
    setStudent(null)
  }, [activeRole, user])

  let viewer = user ? FIXTURES[activeRole] : null
  if (viewer && activeRole === 'STUDENT' && student) {
    viewer = {
      ...viewer,
      displayName: student.name,
      roleLabel:
        student.grade && student.section
          ? `Student · Grade ${student.grade} · Section ${student.section}`
          : viewer.roleLabel,
      scope: { kind: 'self', studentIds: [String(student.studentId)] },
    }
  }

  // Leadership <-> teacher, in whichever direction the account is currently
  // pointed. The Figma frame only draws the leadership -> teacher half.
  const leadershipRole = availableRoles.find(isLeadershipRole) ?? null
  const canSwitchViews =
    leadershipRole !== null &&
    availableRoles.includes('TEACHER') &&
    FIXTURES[leadershipRole].capabilities.switch_to_teacher_view
  const alternateViewRole: ViewerRole | null = !canSwitchViews
    ? null
    : activeRole === 'TEACHER'
      ? leadershipRole
      : activeRole === leadershipRole
        ? 'TEACHER'
        : null

  const value: ViewerState = {
    viewer,
    availableRoles,
    activeRole,
    roleResolved,
    alternateViewRole,
    canSwitchRoles,
    setActiveRole,
  }

  return <ViewerStateContext.Provider value={value}>{children}</ViewerStateContext.Provider>
}

export function useViewer(): ViewerState {
  const ctx = useContext(ViewerStateContext)
  if (!ctx) throw new Error('useViewer must be used within a ViewerProvider')
  return ctx
}

/** Sidebar label for a role. Teacher/Student keep their established wording;
 *  leadership roles read as the plain role name, per the Figma frame. */
export function viewerRoleLabel(role: ViewerRole): string {
  if (role === 'TEACHER') return 'Teacher Access'
  if (role === 'STUDENT') return 'Student Access'
  return roleLabel(role)
}

/** The role as it reads mid-sentence in "Switch to … view". An initialism
 *  stays upper-case; everything else lower-cases naturally. */
export function viewSwitchLabel(role: ViewerRole): string {
  if (role === 'HOD') return 'HOD'
  return roleLabel(role).toLowerCase()
}
