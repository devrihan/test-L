// Resolves the logged-in student to their real loam_db student record, so the
// personal student view shows the right person — the decision flows from the
// login, not a picker.
//
// Chain (backend): JWT email -> user_db.app_user.admission_no (registry) ->
// loam_db student. Later this becomes login-by-admission-number directly.
//   GET /api/student-identity/by-email?email=  -> LoggedInStudent

import { useState, useEffect } from 'react'
import { apiGet, AGGREGATED_API_BASE } from './api'
import { getUser, getStudentIdentity } from './auth'
import type { CropFilterCombo } from './answer-crops'
import type { AnalyticsFilters } from './filters'

export interface LoggedInStudent {
  studentId: number
  admissionNo: string
  name: string
  rollNumber: number
  section: string | null
  grade: string | null
  schoolId: number | null
}

/**
 * Resolve the currently logged-in student to their loam_db record.
 *
 * Primary path: the `admission_no` token claim (present on school-provisioned
 * student logins) → `/by-admission`. These accounts have NO email — the school
 * class-lists carry none — so the legacy email path can never resolve them.
 * Fallback: the email claim → `/by-email`, for older accounts that predate the
 * admission-number login convention. Returns null for non-students (teacher/
 * admin tokens carry neither) and on any resolution failure.
 */
export async function fetchLoggedInStudent(): Promise<LoggedInStudent | null> {
  const admissionNo = getStudentIdentity()?.admissionNo
  if (admissionNo) {
    try {
      return await apiGet<LoggedInStudent>(AGGREGATED_API_BASE, '/api/student-identity/by-admission', {
        admissionNo,
      })
    } catch {
      return null
    }
  }
  const email = getUser()?.email
  if (!email) return null
  try {
    return await apiGet<LoggedInStudent>(AGGREGATED_API_BASE, '/api/student-identity/by-email', {
      email,
    })
  } catch {
    return null
  }
}

/** React hook: the resolved logged-in student (or null while loading / not a student). */
export function useLoggedInStudent(): LoggedInStudent | null {
  const [student, setStudent] = useState<LoggedInStudent | null>(null)
  useEffect(() => {
    let ignore = false
    fetchLoggedInStudent().then((s) => { if (!ignore) setStudent(s) })
    return () => { ignore = true }
  }, [])
  return student
}

/** Whitespace- and case-insensitive key for comparing backend subject/section values. */
export const normKey = (s: string) => s.replace(/\s+/g, '').toUpperCase()

/**
 * The section whose data the student browses: their own section when it
 * exists in the data for the selected grade/subject (compared whitespace- and
 * case-insensitively, returning the data's canonical value), the shared
 * filter section otherwise. Shared by the student Exams and Chapters lists.
 */
export function resolveStudentSection(
  combos: CropFilterCombo[], filters: AnalyticsFilters, student: LoggedInStudent | null,
): string {
  if (!student?.section) return filters.section
  const own = combos.find(
    (c) =>
      c.grade === filters.grade &&
      normKey(c.subject) === normKey(filters.subject) &&
      normKey(c.section) === normKey(student.section as string),
  )
  return own?.section ?? filters.section
}

/** The student's marks across their exams (for the "Performance by exams" chart). */
export interface StudentExamMark {
  exam: string
  subject: string
  date: string | null
  marks: number | null
  maxMarks: number | null
}

export async function fetchStudentExamMarks(studentId: number): Promise<StudentExamMark[]> {
  try {
    return await apiGet<StudentExamMark[]>(
      AGGREGATED_API_BASE,
      `/api/student-identity/${studentId}/exam-marks`,
    )
  } catch {
    return []
  }
}
