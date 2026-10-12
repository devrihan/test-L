// Who takes a class (beaver#806) — a read-only display, never a filter.
//
// Backed by aggregatedData:
//   GET /api/answer-crops/filters             -> combos, each carrying `teachers`
//   GET /api/teachers?grade&section&subject   -> the same list for one class
//   GET /api/teachers/{teacherId}/allocations -> everything one teacher takes
//
// The filter feed already carries the roster, so the pages built on it need no
// extra request; /api/teachers exists for pages (the exam header) that know
// their class from the URL and never load the combo list.

import { apiGet, AGGREGATED_API_BASE } from './api'
import type { CropFilterCombo } from './answer-crops'

/**
 * Mirrors aggregatedData TeacherDTO.Subject. Either half can be null and they
 * mean different gaps: no `name` means the allocation never recorded what the
 * teacher takes, no `abbrev` means no subjects row carries that name. Callers
 * drop the segment they cannot fill rather than printing an empty one.
 */
export interface TaughtSubject {
  name: string | null
  abbrev: string | null
}

/**
 * Mirrors aggregatedData TeacherDTO. Two subject fields, and they differ:
 * `subject` is what the paper is sat under (how this teacher was matched to the
 * class at all), `teaches` is what they actually take within it. They diverge on
 * combined papers, where several specialists share one paper.
 */
export interface ClassTeacher {
  id: number
  name: string
  subject: string
  teaches: TaughtSubject
}

/** One class a teacher takes a subject for. */
export interface TaughtClass {
  grade: string
  section: string
}

/** One line of the hover card, as aggregatedData groups it. */
export interface TeacherAllocation {
  teaches: TaughtSubject
  subject: string | null
  classes: TaughtClass[]
}

/** Mirrors aggregatedData TeacherAllocationsDTO. */
export interface TeacherAllocations {
  id: number
  name: string
  allocations: TeacherAllocation[]
}

/**
 * The compact form used wherever names share a line: the first name in full,
 * then every later name as an initial ('Aditi Basu' -> 'Aditi B.').
 *
 * A LEADING single letter is an initial belonging to the name that follows, not
 * a name of its own, so it stays whole together with that name ('D Mamatha'
 * stays 'D Mamatha', 'S Aparna Raju' becomes 'S Aparna R.').
 *
 * Two people can collide here when their surnames start with the same letter.
 * That is accepted rather than worked around — the full name is one hover away.
 *
 * Names reach the UI already title-cased by the API; the upper/lower handling
 * here is so a raw all-capitals roster name reads the same way.
 */
export function shortTeacherName(fullName: string): string {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  // The head is what stays spelt out — the first name, plus the name after it
  // when the first token is a leading initial.
  const headLength = tokens[0].length === 1 && tokens.length > 1 ? 2 : 1
  const head = tokens.slice(0, headLength).map(titleCase).join(' ')
  const initials = tokens.slice(headLength).map((t) => `${t[0].toUpperCase()}.`).join('')
  return initials ? `${head} ${initials}` : head
}

function titleCase(token: string): string {
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
}

/**
 * One combo's `teachers`, read the only way this list may be read.
 *
 * An ABSENT OR NULL key degrades to null — "no roster came with this combo".
 * That is not tolerance of bad data — it is this frontend declining to assume a
 * deploy ordering it does not control. loam and aggregatedData ship separately,
 * so this app can be live against a filter endpoint built before the field
 * existed, and the names are a read-only extra on a page whose real job is
 * marks: losing them must not take the page down with them.
 *
 * null and the empty array are deliberately kept apart: an empty array is the
 * backend saying "this class has nobody allocated", which the UI states out
 * loud, while null is the roster simply not being there — and the absence of
 * data is not a claim about the class.
 *
 * A key that IS there but is not an array is the opposite case — an endpoint
 * that knows the field and is sending it wrong — and throws. Coercing that to
 * an empty list would hide a broken contract behind a display that merely looks
 * a bit empty.
 */
export function comboTeachers(c: CropFilterCombo): ClassTeacher[] | null {
  // Typed `unknown` on purpose: the declared type is a claim about a service on
  // the other side of the network, not something this module can rely on.
  const value: unknown = c.teachers
  // null is treated as absent, not as malformed. Whether a JSON serialiser omits an
  // empty field or writes null for it is a serialiser setting, and both say the same
  // thing — there is no roster here. Throwing on one and not the other would make the
  // whole page hinge on that setting, and there is no error boundary above this call
  // to catch it: the page would go blank rather than lose a line of text.
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) {
    throw new Error(
      `answer-crops filters: combo ${c.grade}/${c.section}/${c.subject}/${c.exam} ` +
        `sent "teachers" as ${describeValue(value)}, expected an array`,
    )
  }
  return value
}

/** `typeof` with the two cases it is useless for spelt out. */
function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return `a ${typeof value}`
}

/**
 * The teachers of one class, read off the combos the filter dropdowns are
 * already built from — same request, no second round trip. Allocation is per
 * (grade, section, subject), so every exam row of a class repeats the same
 * list; de-duplicated by teacher id, keeping the backend's ordering.
 *
 * null when no row of the class carried a roster at all (a filters endpoint
 * from before the field existed): the caller then knows nothing about the
 * class's teachers, as opposed to knowing there are none.
 */
export function teachersForCombo(
  combos: CropFilterCombo[],
  f: { grade: string; subject: string; section: string },
): ClassTeacher[] | null {
  const byId = new Map<number, ClassTeacher>()
  let rosterSeen = false
  for (const c of combos) {
    if (c.grade !== f.grade || c.subject !== f.subject || c.section !== f.section) continue
    const roster = comboTeachers(c)
    if (roster === null) continue
    rosterSeen = true
    for (const t of roster) byId.set(t.id, t)
  }
  return rosterSeen ? Array.from(byId.values()) : null
}

/** The same list for a page that knows its class but not the combo list. */
export async function fetchClassTeachers(f: {
  grade: string
  section: string
  subject: string
}): Promise<ClassTeacher[]> {
  return apiGet<ClassTeacher[]>(AGGREGATED_API_BASE, '/api/teachers', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
  })
}

/**
 * Everything one teacher takes — the hover card's contents. Its own request on
 * purpose: only some names are ever hovered, and folding this into the filter
 * feed would repeat a teacher's whole class list on every exam row they appear
 * on, in the payload the page waits for.
 */
export async function fetchTeacherAllocations(teacherId: number): Promise<TeacherAllocations> {
  return apiGet<TeacherAllocations>(AGGREGATED_API_BASE, `/api/teachers/${teacherId}/allocations`)
}
