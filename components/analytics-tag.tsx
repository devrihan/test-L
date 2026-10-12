'use client'

// Google Analytics, mounted only for a resolved, tracked role.
//
// Self-contained so the dashboard layout gains one line and nothing existing
// changes. No GA id (other developers' machines, CI) means no tag at all.
import { useEffect } from 'react'
import { GoogleAnalytics, sendGAEvent } from '@next/third-parties/google'
import { useViewer } from '@/app/lib/viewer'
import { getSchoolId, getUserId, takePendingLogin } from '@/app/lib/auth'
import { isTracked, setGAIdentity } from '@/app/lib/analytics'

const GA_ID = process.env.NEXT_PUBLIC_GA_ID

export function AnalyticsTag() {
  const { activeRole, roleResolved } = useViewer()
  // Wait for roleResolved: activeRole is TEACHER until the stored user is read,
  // so mounting earlier would tag a student's first pageview as a teacher.
  const enabled = Boolean(GA_ID) && roleResolved && isTracked(activeRole)

  // Identity, read straight from the token claims on every change.
  const school = enabled ? getSchoolId() : null
  const userId = enabled ? getUserId() : null

  useEffect(() => {
    if (!enabled) return
    // Deferred from login(), which runs on /login where this tag isn't mounted.
    // False on a resumed session — only a fresh sign-in leaves the marker.
    // `activeRole` is the same value the role user property carries, so the
    // event and the property can never disagree on how a role is spelled.
    if (takePendingLogin()) {
      sendGAEvent('event', 'login', { method: 'password', role: activeRole })
    }
  }, [enabled, activeRole])

  if (!enabled) return null
  // debug_mode only outside production — it is what puts hits in GA's
  // DebugView, and shipping it would mark real traffic as debug.
  return (
    <>
      {/* Ordered deliberately: sibling effects run in tree order, so this queues
          the identity before gtag's config fires the landing page_view. */}
      <GaIdentity role={activeRole} school={school} userId={userId} />
      <GoogleAnalytics gaId={GA_ID!} debugMode={process.env.NODE_ENV !== 'production'} />
    </>
  )
}

// Its own component purely for that ordering — an effect in AnalyticsTag would
// run after <GoogleAnalytics/>'s, React flushing child effects before parents'.
function GaIdentity({ role, school, userId }: { role: string; school: string | null; userId: string | null }) {
  useEffect(() => {
    setGAIdentity({ role, school, userId })
  }, [role, school, userId])
  return null
}
