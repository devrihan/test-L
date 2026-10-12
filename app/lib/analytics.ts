
import { sendGAEvent } from '@next/third-parties/google'
import { VIEWER_ROLE_PRIORITY, type ViewerRole } from './roles'

const UNTRACKED_ROLES: readonly ViewerRole[] = [] 

export const TRACKED_ROLES: readonly ViewerRole[] = VIEWER_ROLE_PRIORITY.filter(
  (role) => !UNTRACKED_ROLES.includes(role),
)

export const isTracked = (role?: string): boolean =>
  !!role && (TRACKED_ROLES as readonly string[]).includes(role)

/**
 * Queue the user's identity for gtag — or clear it all with null on sign-out.
 *
 * Sign-in: must land BEFORE gtag's config, which is what fires the landing
 * page_view — `set` only affects later hits (see GaIdentity's ordering note).
 * Sign-out: one call clears user_id, role AND school, so sign-out can never
 * clear less than sign-in set — leaving role/school behind would attribute
 * the next user's first hits on a shared browser to whoever just left.
 */
export function setGAIdentity(
  identity: { role: string; school: string | null; userId: string | null } | null,
): void {
  if (typeof window === 'undefined') return
  // next/script injects the init snippet asynchronously, so the queue may not
  // exist yet and a push into a missing dataLayer is dropped silently.
  window.dataLayer = window.dataLayer ?? []
  sendGAEvent('set', 'user_properties', {
    role: identity ? identity.role : null,
    school: identity ? identity.school : null,
  })
  sendGAEvent('set', { user_id: identity ? identity.userId : null })
}

// ─── Events ──────────────────────────────────────────────────────────────────
// One line per call site, and `surface` (the page it happened on) is added here
// so no caller can forget it or spell it differently.

function trackEvent(name: string, params: Record<string, string | number | null>): void {
  if (typeof window === 'undefined') return
  sendGAEvent('event', name, { ...params, surface: window.location.pathname })
}

/** A tab switch, anywhere in the app. `tab` is the on-screen name, not a state key. */
export function trackTabView(tab: string): void {
  trackEvent('tab_view', { tab: tabSlug(tab) })
}

// One map from internal tab state keys to on-screen names, shared by every
// Tabs call site — four per-file copies of this map had already shipped, two
// byte-identical and one hand-slugged. A key not listed here is passed
// through to tabSlug as-is, which is correct for tabs whose state key IS the
// visible name.
export const TAB_EVENT_LABELS: Record<string, string> = {
  remediation: 'Summary', // exam pages' Summary tab keeps its legacy state key
  analysis: 'Analysis',
  performance: 'Answer Paper',
  assignment: 'By Exam', // dashboard chart's legacy state key
  exam: 'By Exam',
  chapter: 'By Chapter',
  student: 'By Student',
  question: 'By Question',
}

/** trackTabView for call sites that hold a state key rather than the label. */
export function trackTabKey(key: string): void {
  trackTabView(TAB_EVENT_LABELS[key] ?? key)
}

// Callers pass the visible label, so normalise here rather than trusting each
// site to spell it the same way: "By Exam" and "by_exam" both land as by_exam.
function tabSlug(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/** Entering a detail page from a list, table or card. */
export type DrilldownEntity =
  | 'chapter'
  | 'student'
  | 'question'
  | 'subject'
  | 'exam'
  | 'answer_script'

export function trackDrilldown(entity: DrilldownEntity): void {
  trackEvent('drilldown', { entity })
}
