// Which of the viewer's classes they LEAD, as opposed to merely teach.
//
// Every row of /api/answer-crops/filters carries the caller's role for that
// one combo (aggregatedData reads it off the grant that covers the combo), so a
// Grade 10 coordinator who also teaches one Grade 12 class is 'coordinator' on
// her Grade 10 rows and 'teacher' on that class. The leadership pages — the
// Subjects directory and its grade read model — are built from the rows she
// leads only; the teacher pages keep every row.
//
// Display only. The service refuses grade-wide reads for a grade the caller
// does not lead whatever this module concludes.

import type { CropFilterCombo } from './answer-crops'

/** Roles least to most senior. 'operations' is what the feed stamps for ops and
 *  admin logins, which bypass the policy and lead everything. */
const ROLE_RANK: Record<string, number> = { teacher: 0, hod: 1, coordinator: 2, principal: 3, operations: 4 }

/** Rows at head-of-department seniority or above. A row without a role is not senior. */
export function isSeniorCombo(c: CropFilterCombo): boolean {
  return (ROLE_RANK[c.role ?? ''] ?? -1) >= ROLE_RANK.hod
}

export function seniorCombos(combos: CropFilterCombo[]): CropFilterCombo[] {
  return combos.filter(isSeniorCombo)
}

/** Grades the viewer leads, in the order the rows arrive (grade ascending). */
export function seniorGrades(combos: CropFilterCombo[]): string[] {
  return Array.from(new Set(seniorCombos(combos).map((c) => c.grade)))
}

/** The rows carrying the viewer's most senior role; empty when no row has one. */
export function topRoleCombos(combos: CropFilterCombo[]): CropFilterCombo[] {
  let top = -1
  for (const c of combos) top = Math.max(top, ROLE_RANK[c.role ?? ''] ?? -1)
  if (top < 0) return []
  return combos.filter((c) => (ROLE_RANK[c.role ?? ''] ?? -1) === top)
}

/** Whether the viewer leads ONE class: its row carries a senior role. */
export function leadsClass(combos: CropFilterCombo[], grade: string, subject: string, section: string): boolean {
  return combos.some((c) => c.grade === grade && c.subject === subject && c.section === section && isSeniorCombo(c))
}
