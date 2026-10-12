// The global analytics filter model.
//
// The UI (components/page-filters.tsx) works in its own option values
// ('grade8', 'a', 'mathematics', 'midterm1'); the backend endpoints expect
// grade="8", section="A", subject name, and the exam label. This module is the
// single translation point between the two, so every wired page filters the
// same way. See BACKEND_INTEGRATION_PLAN.md §2/§7.

import type { QueryParams } from './api'
import { ConfigError } from './config-shared'

export interface AnalyticsFilters {
  subject: string // e.g. 'mathematics'
  exam: string // e.g. 'midterm1'
  grade: string // e.g. 'grade8'
  section: string // e.g. 'a'
  // Academic year ('2025-26') or ALL_YEARS. Only the teacher dashboard shows
  // this dropdown (beaver#547); exam-scoped pages ignore it.
  year?: string
  // 'All Exams' selected on list pages that allow it (chapter/student,
  // beaver#574). `exam` always stays a real exam id so exam-scoped pages
  // (question list, detail links) keep working regardless of this flag.
  examAll?: boolean
  // 'All Subjects' selected on the student dashboard (beaver#1081-15860).
  // `subject` always stays a real subject so subject-scoped fetches (chapter
  // breakdown, etc.) keep working regardless of this flag.
  subjectAll?: boolean
}

// Defaults are pointed at the grade/subject/section that actually holds data
// in the connected loam_db (grade 12 · Mathematics · section C). The UI's
// grade/section/exam option lists are still hardcoded placeholders — replacing
// them with dynamic options from GET /api/filters/grades is Phase 2 (see
// BACKEND_INTEGRATION_PLAN.md §5 #6).
export const DEFAULT_FILTERS: AnalyticsFilters = {
  subject: 'mathematics',
  exam: 'Preboard 1',
  grade: 'grade12',
  section: 'c',
}

// The exam dropdown now carries the REAL exam names as stored in
// question_papers.exam (e.g. 'Midterm', 'Preboard 1'), so no mapping is needed
// — toBackendExam is the identity. The placeholder labels ('Mid-term 1') were
// removed because they match nothing in loam_db. Making these options dynamic
// per grade from GET /api/filters/grades is Phase 2.

/** 'grade8' -> '8' */
export function toBackendGrade(grade: string): string {
  return grade.replace(/^grade/i, '')
}

/** 'a' -> 'A' */
export function toBackendSection(section: string): string {
  return section.toUpperCase()
}

/** 'mathematics' -> 'Mathematics' (subjects.name is title-cased) */
export function toBackendSubject(subject: string): string {
  return subject.charAt(0).toUpperCase() + subject.slice(1)
}

/** Exam dropdown already holds the real exam name — pass through unchanged. */
export function toBackendExam(exam: string): string {
  return exam
}

/**
 * Translate the UI filter state into backend query params. `grade` is required
 * by every analytics endpoint; the rest are optional and dropped when absent.
 */
export function toQueryParams(
  filters: AnalyticsFilters,
  opts: { includeExam?: boolean; includeSection?: boolean } = {},
): QueryParams {
  const { includeExam = true, includeSection = true } = opts
  return {
    grade: toBackendGrade(filters.grade),
    subject: toBackendSubject(filters.subject),
    ...(includeSection ? { section: toBackendSection(filters.section) } : {}),
    ...(includeExam ? { exam: toBackendExam(filters.exam) } : {}),
  }
}

// ── Academic year (beaver#547) ───────────────────────────────────────────────
// Derived from the trailing token of backend exam ids ('..._25-26' → '2025-26').
export const ALL_YEARS = 'all'

// Dropdown-only sentinel for the 'All Exams' option (beaver#574) — never sent
// to the backend; it maps to `examAll: true` in the filter state.
export const ALL_EXAMS = 'all-exams'

// Dropdown-only sentinel for the 'All Subjects' option (student dashboard) —
// never sent to the backend; it maps to `subjectAll: true` in the filter state.
export const ALL_SUBJECTS = 'all-subjects'

/**
 * The year suffix comes in two shapes: one token ('..._25-26') or split across
 * the last two tokens ('..._Unit-Test -1_26_27'). Returns the label and how
 * many trailing tokens it consumed.
 */
function trailingYear(parts: string[]): { label: string; tokens: number } | null {
  const last = parts[parts.length - 1] ?? ''
  const prev = parts[parts.length - 2] ?? ''
  const m = /^(\d{2})-(\d{2})$/.exec(last)
  if (m) return { label: `20${m[1]}-${m[2]}`, tokens: 1 }
  if (/^\d{2}$/.test(last) && /^\d{2}$/.test(prev) && Number(last) === Number(prev) + 1) {
    return { label: `20${prev}-${last}`, tokens: 2 }
  }
  return null
}

// "Pick an Accountancy Exam" vs "Pick a Physics Chapter" — the article follows
// the subject's first letter (all subject names here are pronounced as spelt).
export function pickSubjectTitle(subject: string, noun: string): string {
  const name = subject.replace(/\s+/g, ' ').trim()
  const article = /^[aeiou]/i.test(name) ? 'an' : 'a'
  return `Pick ${article} ${name} ${noun}`
}

export function examAcademicYear(examId: string): string | null {
  return trailingYear(examId.split('_'))?.label ?? null
}

/**
 * Academic years hard-excluded from the dashboard view — which years those are
 * is config, never a literal in here. Some cohorts' prior-year exams carry
 * grade-at-exam-time on their crops, so after a promotion they surface under
 * the wrong grade and produce broken (>100%) chapter numbers; excluding the
 * year is how that is kept out of view.
 *
 * Sourced from the school's `academic_year_scope` config (config-manager) via
 * setAcademicYearScope(), which ConfigProvider calls during its own render —
 * before any child that filters can run. Starts as null rather than a guessed
 * list: a hardcoded year here would be a second source of truth that silently
 * governs whenever config fails to arrive, which is exactly the class of bug
 * the no-fallback config contract removes. Labels are the examAcademicYear()
 * form ('2025-26'), not the raw exam-id token ('25-26').
 * Client-side scoping; server-side enforcement is a separate follow-up.
 *
 * `exclude_yearless` extends the same idea to exam ids the year parser can't
 * read at all ('Midterm', 'PB1', 'Annual Examination'): those are pre-26_27
 * legacy uploads, so a school that has excluded its old years almost certainly
 * wants them gone too — but whether they are is still the school's config call,
 * not a guess here.
 */
let excludedAcademicYears: Set<string> | null = null
let excludeYearlessExams = false

/** Set the school's year scoping from config (school-resolved) at hydration. */
export function setAcademicYearScope(years: string[], excludeYearless: boolean): void {
  excludedAcademicYears = new Set(years)
  excludeYearlessExams = excludeYearless
}

/**
 * The configured exclusion set. Throws if a filter runs before ConfigProvider
 * supplied it — that would mean filtering against a guess, and silently showing
 * a year the school has excluded is the outcome this whole path exists to stop.
 */
function excluded(): Set<string> {
  if (excludedAcademicYears === null) {
    throw new ConfigError(
      '[config] academic_year_scope.excluded_years was read before it was set. ' +
        'ConfigProvider must supply it (app/layout.tsx) before any filtering runs.',
    )
  }
  return excludedAcademicYears
}

/**
 * True when the exam's academic year is hard-excluded from view. An exam whose
 * id carries no parseable year ('Midterm', 'PB1') is excluded whenever the
 * school's config says exclude_yearless — such ids are legacy uploads that
 * would otherwise surface under every year forever.
 */
export function isExcludedAcademicYear(examId: string): boolean {
  const ex = excluded() // throws pre-config regardless of the id's shape
  const y = examAcademicYear(examId)
  if (y === null) return excludeYearlessExams
  return ex.has(y)
}

/** Years available for a set of exam ids, latest first (excluded years dropped). */
export function academicYearsOf(examIds: string[]): string[] {
  return Array.from(
    new Set(
      examIds
        .map(examAcademicYear)
        .filter((y): y is string => y !== null && !excluded().has(y)),
    ),
  )
    .sort()
    .reverse()
}

/**
 * Excluded exams never match — even under ALL_YEARS — so no page can surface
 * them regardless of the selected filter. When exclude_yearless is off, exams
 * whose id carries no year token can't be attributed to a year honestly, so
 * they match every year (the pre-26_27 behavior).
 */
export function matchesAcademicYear(examId: string, year: string | undefined): boolean {
  if (isExcludedAcademicYear(examId)) return false // hard-excluded, always
  if (!year || year === ALL_YEARS) return true
  const y = examAcademicYear(examId)
  return y === null || y === year
}

// ── Friendly exam names (beaver#548) ─────────────────────────────────────────
// "11_ACCOUNTANCY_ANNUALEXAMINATION_25-26" -> "Annual Exam 2025-26".
// Display-only: query params keep the backend id. Names that don't match the
// backend-id pattern ("Preboard 1", "Midterm") pass through unchanged.
// Third column is the compact form for dense UI — see abbreviateExamName().
const EXAM_TYPE_LABELS: [RegExp, string, string][] = [
  [/^ANNUALEXAM(?:INATION)?$/, 'Annual Exam', 'AE'],
  [/^MIDTERM(\d*)$/, 'Mid Term', 'MT'],
  [/^UNITTE(?:S|X)T(\d*)$/, 'Unit Test', 'UT'], // covers the UNITTEXT typo in ids
  [/^PREBOARD(\d*)$/, 'Preboard', 'PB'],
  [/^HALFYEARLY$/, 'Half Yearly', 'HY'],
  [/^FINALEXAM(?:INATION)?$/, 'Final Exam', 'FE'],
]

// The type can span one or two tokens ("MIDTERM" vs "Annual"+"Examination"), and
// punctuation is stripped first ("Unit-Test -1" -> "UNITTEST1"). Null if unknown.
function matchExamType(
  parts: string[],
  end: number,
): { label: string; abbrev: string; num: string } | null {
  for (const span of [2, 1]) {
    if (end - span < 1) continue
    const type = parts.slice(end - span, end).join('').toUpperCase().replace(/[^A-Z0-9]/g, '')
    for (const [re, label, abbrev] of EXAM_TYPE_LABELS) {
      const m = re.exec(type)
      if (m) return { label, abbrev, num: m[1] ?? '' }
    }
  }
  return null
}

/**
 * Identifies the LOGICAL exam behind a raw exam id, collapsing the per-subject
 * copies of the same sitting.
 *
 * Exam ids embed the subject ('11_PHYSICS_UNITTEST1_25-26',
 * '11_ACCOUNTANCY_UNITTEST1_25-26'), so a single "Unit Test 1 2025-26" exists
 * as one id per subject. Anything that reasons across subjects — the leadership
 * Subjects directory — has to treat those as one exam, or it sees each subject
 * as a separate exam and can only ever show one subject at a time.
 *
 * The key IS the formatted display name, deliberately: that function already
 * strips grade and subject and keeps type + number + year, which is exactly the
 * identity wanted, and reusing it means there's one exam-id parser to keep
 * correct instead of two that can drift. Ids it can't parse pass through
 * verbatim, so legacy subject-agnostic ids ('Preboard 1') stay distinct.
 */
export function logicalExamKey(id: string): string {
  return formatExamName(id)
}

/**
 * Retest sorts after its Unit Test everywhere a list of exam ids is shown —
 * dropdowns, the Questions page's per-exam groups, the Exams list. Plain
 * alphabetical sort gets this backwards: 'UT_1_Retest' sorts before
 * 'Unit-Test' because capital 'T' (in "UT") is less than lowercase 'n' (in
 * "Unit") in ASCII, so a raw .sort() on exam ids shows Retest first.
 */
export function byExamOrder(a: string, b: string): number {
  const rank = (id: string) => (/retest/i.test(id) ? 1 : 0)
  return rank(a) - rank(b)
}

export function formatExamName(id: string | null | undefined, opts?: { year?: boolean }): string {
  if (!id) return '—'
  const withYear = opts?.year !== false
  const parts = id.split('_')
  const year = trailingYear(parts)
  if (!year || parts.length < year.tokens + 2) return id
  const end = parts.length - year.tokens
  const yearSuffix = withYear ? ` ${year.label}` : ''
  const hit = matchExamType(parts, end)
  if (hit) return `${hit.label}${hit.num ? ` ${hit.num}` : ''}${yearSuffix}`
  const type = parts[end - 1]
  return `${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()}${yearSuffix}`
}

// Compact name for dense UI — "Unit Test 2 2026-27" -> "UT2"; unnumbered stays "UT".
// Anything with no abbreviation falls back to the exam name as shown everywhere else.
export function abbreviateExamName(id: string | null | undefined): string {
  if (!id) return '—'
  const parts = id.split('_')
  const year = trailingYear(parts)
  if (!year || parts.length < year.tokens + 2) return formatExamName(id)
  const hit = matchExamType(parts, parts.length - year.tokens)
  return hit ? `${hit.abbrev}${hit.num}` : formatExamName(id)
}
