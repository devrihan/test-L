// Student roster — data access for the Students list page (Teacher Metrics
// spec).
//
// Base roster comes from the scanned set (/api/answer-crops/roster). The
// student universe is the union of the exam scope's rosters, so a student who
// missed the selected exam still appears — marked "AB" (absent). Marks render
// as absolute "47/80" for a single exam and as a percentage across exams for
// 'All Exams' (different papers have different maxes). Strongest/weakest come
// from per-student chapter marks (/api/answer-crops/student-chapter-stats,
// same exam scope); the legacy analytics roster fills them for cohorts with no
// chapter-mapped scans. The AI common-mistake field stays null for now — the
// page hides the column while it's empty.

import { matchesAcademicYear, toQueryParams, type AnalyticsFilters } from './filters'
import { apiGet, AGGREGATED_API_BASE } from './api'
import { prettifyMathOrNull } from './math-text'
import {
  fetchCropRoster,
  fetchStudentChapterStats,
  type CropFilterCombo,
  type CropRosterRow,
} from './answer-crops'

/** Row shape the Students roster renders. */
export interface StudentRow {
  roll: string
  admission: string | null
  name: string
  // 'AB' (absent), '—' (scanned, not marked yet), '47/80', or '62.5%'
  marks: string
  absent: boolean
  strongest: string
  weakest: string
  mistake: string | null // null → column hidden (AI field unpopulated)
  extra: number
}

const NA = '—'
const ABSENT = 'AB'

// Roll numbers differ in zero-padding across sources ('016' vs '16').
function normRoll(roll: string): string {
  return roll.replace(/^0+/, '') || roll
}

interface AnalyticsRosterRow {
  rollNo: string
  strongestChapter: string | null
  weakestChapter: string | null
  dominantMistake: string | null
}

// The loam_db analytics roster, keyed by normalised roll. Best-effort: this
// endpoint only has data for the legacy analytics slice and may be empty or
// error for other classes — in which case we just get no analytics overlay.
async function fetchAnalyticsByRoll(
  filters: AnalyticsFilters,
): Promise<Map<string, AnalyticsRosterRow>> {
  try {
    const rows = await apiGet<AnalyticsRosterRow[]>(
      AGGREGATED_API_BASE,
      '/api/students-roster',
      toQueryParams(filters, { includeExam: !filters.examAll, includeSection: true }),
    )
    const byRoll = new Map<string, AnalyticsRosterRow>()
    for (const r of rows) if (r.rollNo) byRoll.set(normRoll(r.rollNo), r)
    return byRoll
  } catch {
    return new Map()
  }
}

/** The cohort's exams for the selected academic year. */
function yearExams(filters: AnalyticsFilters, combos?: CropFilterCombo[]): string[] {
  if (!combos) return []
  return Array.from(
    new Set(
      combos
        .filter(
          (c) =>
            c.grade === filters.grade &&
            c.subject === filters.subject &&
            c.section === filters.section &&
            matchesAcademicYear(c.exam, filters.year),
        )
        .map((c) => c.exam),
    ),
  )
}

interface StudentAgg {
  roll: string
  admission: string | null
  name: string
  got: number
  max: number
  marked: boolean // any marked paper in the SELECTED scope
  scanned: boolean // any crops in the selected scope (else absent)
  mistake: string | null
}

export async function fetchStudents(
  filters: AnalyticsFilters,
  combos?: CropFilterCombo[],
): Promise<StudentRow[]> {
  const cohortExams = yearExams(filters, combos)
  const scopeExams = filters.examAll ? cohortExams : [filters.exam]
  // The universe includes every exam of the year so absentees from the
  // selected exam still get a row (spec: marks 'AB').
  const universeExams = cohortExams.length ? cohortExams : scopeExams
  const scope = new Set(scopeExams)

  const [rosters, chapterStats, analytics] = await Promise.all([
    Promise.all(
      universeExams.map(async (exam) => ({
        exam,
        rows: await fetchCropRoster({
          grade: filters.grade,
          section: filters.section,
          subject: filters.subject,
          exam,
        }).catch(() => [] as CropRosterRow[]),
      })),
    ),
    fetchStudentChapterStats({
      grade: filters.grade,
      section: filters.section,
      subject: filters.subject,
      exams: scopeExams,
    }).catch(() => []),
    fetchAnalyticsByRoll(filters),
  ])

  // One row per student across the universe; marks summed over the SELECTED
  // scope only (marked papers only — 'not marked yet' never reads as zero).
  const students = new Map<string, StudentAgg>()
  for (const { exam, rows } of rosters) {
    const inScope = scope.has(exam)
    for (const r of rows) {
      const key = r.admissionNo ?? normRoll(r.rollNumber)
      let s = students.get(key)
      if (!s) {
        s = {
          roll: r.rollNumber,
          admission: r.admissionNo ?? null,
          name: r.studentName,
          got: 0,
          max: 0,
          marked: false,
          scanned: false,
          mistake: r.commonMistake ?? null,
        }
        students.set(key, s)
      }
      if (r.commonMistake && !s.mistake) s.mistake = r.commonMistake
      if (!inScope) continue
      s.scanned = true
      if (r.totalMarks != null && (r.totalMaxMarks ?? 0) > 0) {
        s.marked = true
        s.got += r.totalMarks
        s.max += r.totalMaxMarks as number
      }
    }
  }

  // Strongest/weakest per student from chapter marks (spec formula: summed
  // marks / summed chapter max over the scope).
  const chaptersByStudent = new Map<string, { chapter: string; pct: number }[]>()
  for (const cs of chapterStats) {
    if (!cs.chapterMax) continue
    const key = cs.admissionNo ?? normRoll(cs.rollNumber ?? '')
    if (!key) continue
    const list = chaptersByStudent.get(key) ?? []
    list.push({ chapter: cs.chapter, pct: (100 * cs.got) / cs.chapterMax })
    chaptersByStudent.set(key, list)
  }

  return Array.from(students.values())
    .map<StudentRow>((s) => {
      const key = s.admission ?? normRoll(s.roll)
      const chapters = chaptersByStudent.get(key)
      const a = analytics.get(normRoll(s.roll))
      const absent = !s.scanned
      let strongest = NA
      let weakest = NA
      if (!absent && chapters && chapters.length > 0) {
        const sorted = [...chapters].sort((x, y) => y.pct - x.pct)
        strongest = sorted[0].chapter
        weakest = sorted[sorted.length - 1].chapter
      } else if (!absent) {
        strongest = a?.strongestChapter ?? NA
        weakest = a?.weakestChapter ?? NA
      }
      const marks = absent
        ? ABSENT
        : !s.marked
          ? NA
          : filters.examAll
            ? `${Math.round((1000 * s.got) / s.max) / 10}%`
            : `${Math.round(s.got * 10) / 10}/${Math.round(s.max)}`
      return {
        roll: s.roll,
        admission: s.admission,
        name: s.name,
        marks,
        absent,
        strongest,
        weakest,
        // AI field ONLY (spec: hidden until populated). The legacy analytics
        // dominantMistake is deliberately NOT a fallback here — that endpoint
        // defaults to the placeholder 'General Errors' for students with no
        // error classification, which made the column show noise for everyone.
        mistake: absent ? null : (s.mistake ?? null),
        extra: 0,
      }
    })
    .sort((a, b) => {
      const na = Number.parseInt(a.roll, 10)
      const nb = Number.parseInt(b.roll, 10)
      if (Number.isNaN(na) || Number.isNaN(nb)) return a.roll.localeCompare(b.roll)
      return na - nb
    })
}

// ── This student's own classified answers ────────────────────────────────────

/**
 * One classified answer of one student, from `student_answer_errors` — the
 * per-answer grain of an error-classification run: what the examiner model
 * found in this student's own work, with the crop it found it in.
 *
 * `verdict` is what to branch on, not the presence of a code:
 *   'error'         a fault the taxonomy could code
 *   'uncoded_error' a real fault with no code that fits (see unmatchedReason);
 *                   whatWentWrong is still populated
 *   'clean'         nothing wrong
 * No row at all means the run never classified that answer — it skips MCQs,
 * full marks and answers with no OCR text.
 */
export interface StudentAnswerError {
  questionNumber: number
  questionId: number | null
  chapterName: string | null
  verdict: 'error' | 'uncoded_error' | 'clean'
  errorCode: string | null
  errorTypeName: string | null
  errorLabel: string | null
  whatWentWrong: string | null
  evidenceQuote: string | null
  unmatchedReason: string | null
  confidence: number | null
  needsReview: boolean | null
  /** SME severity for the error code: 'Major' | 'Moderate' | 'Minor'. Null when
   *  the answer has no code, or a code predating the SME taxonomy. */
  severity: string | null
  croppedImageUrl: string | null
  marks: number | null
  maxMarks: number | null
  // Only populated by the bulk (whole-section) shape below — every row
  // already belongs to a known student when the caller asked for one by
  // roll/admissionNo, so these are undefined there.
  rollNumber?: number | null
  studentName?: string | null
  admissionNo?: string | null
}

/**
 * This student's classified answers for one exam. Empty for a student whose
 * answers have not been through a classification run, which is the normal
 * state for every section that has not had one — the caller renders nothing.
 *
 * Omit `student` (or pass `{}`) for the bulk shape instead: every classified
 * student in `filters`' grade+section, one call — used by the teacher exam
 * page so its evidence drawer can show a real per-answer diagnosis instead
 * of opening one request per student.
 */
export async function fetchStudentAnswerErrors(
  filters: AnalyticsFilters,
  student: { roll?: string | null; admissionNo?: string | null } = {},
): Promise<StudentAnswerError[]> {
  try {
    const rows = await apiGet<StudentAnswerError[]>(AGGREGATED_API_BASE, '/api/student-answer-errors', {
      ...toQueryParams(filters, { includeExam: true, includeSection: true }),
      roll: student.roll ?? '',
      admissionNo: student.admissionNo ?? '',
    })
    // Authored in ASCII math (sqrt3, x^2, pi/4) — convert for display here so
    // every consumer (drawers, breakdown bars, mistake cards) inherits it.
    return rows.map((r) => ({
      ...r,
      whatWentWrong: prettifyMathOrNull(r.whatWentWrong),
      evidenceQuote: prettifyMathOrNull(r.evidenceQuote),
    }))
  } catch {
    return []
  }
}
