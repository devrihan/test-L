'use client'

// The caller's own role, for the few places that vary what they PUT ON SCREEN
// by seniority (beaver#806). Realm roles cannot answer this — every staff
// account carries the same one — so it comes from aggregatedData, which reads
// it off the access-policy document:
//   GET /api/access/role -> { "role": "hod" }
//
// This decides display only. Every endpoint behind the display enforces its own
// access, so a client that got this wrong still gets no data it may not read.

import { useEffect, useState } from 'react'
import { apiGet, AGGREGATED_API_BASE } from './api'

/** Mirrors aggregatedData CallerRole, lower-cased on the wire. */
export type CallerRole =
  | 'teacher'
  | 'hod'
  | 'coordinator'
  | 'principal'
  | 'student'
  | 'operations'
  | 'unknown'

// Who is shown who takes a class: heads of department, coordinators, and
// principals. A vice-principal is recorded as a principal, so there is no
// separate value to list. Everything else — an ordinary teacher, a student, an
// internal service call, and 'unknown' (the service's own word for a caller it
// cannot place) — is off the list and sees nothing.
const ROLES_SEEING_CLASS_TEACHERS: readonly CallerRole[] = ['hod', 'coordinator', 'principal']

// One lookup per page load: the role is a property of the session, and several
// components ask for it. A failed lookup clears the cache so the next mount
// retries rather than inheriting the failure for the life of the page.
let pending: Promise<CallerRole> | null = null

export function fetchCallerRole(): Promise<CallerRole> {
  if (!pending) {
    pending = apiGet<{ role: CallerRole }>(AGGREGATED_API_BASE, '/api/access/role')
      .then((r) => r.role)
      .catch((err) => {
        pending = null
        throw err
      })
  }
  return pending
}

/**
 * Whether this caller may be shown who takes a class. Starts false and stays
 * false until the service names a role on the list, so a slow or failed lookup
 * shows nothing rather than flashing the names at someone who should not have
 * them.
 */
export function useMaySeeClassTeachers(): boolean {
  const [role, setRole] = useState<CallerRole | null>(null)

  useEffect(() => {
    let ignore = false
    fetchCallerRole()
      .then((r) => {
        if (!ignore) setRole(r)
      })
      .catch((err) => {
        // Logged, not swallowed: 'unknown' hides the display exactly as this
        // failure must, so without this line the two are indistinguishable.
        console.error('[caller-role] lookup failed — class teachers stay hidden', err)
        if (!ignore) setRole('unknown')
      })
    return () => {
      ignore = true
    }
  }, [])

  return role !== null && ROLES_SEEING_CLASS_TEACHERS.includes(role)
}
