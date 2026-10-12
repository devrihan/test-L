// Scanned answer-crop images (R2) for the "Response sheet" panels.
//
// Backed by aggregatedData (which reads only loam_db.student_answer_crops —
// imported from loam_ops; the dashboard never touches loam_ops):
//   GET /api/answer-crops?grade&section&subject&exam&roll -> AnswerCrop[]

import { apiGet, AGGREGATED_API_BASE } from './api'
import { isExcludedAcademicYear } from './filters'
import type { ClassTeacher } from './teachers'

/** Mirrors aggregatedData AnswerCropDTO. */
export interface AnswerCrop {
  questionNumber: number | null
  questionKey: string
  croppedImageUrl: string
  marks: number | null
  maxMarks: number | null
  verified: boolean | null
  // Null when the paper never positively typed the question — treat null as
  // "not positively MCQ", not as "definitely not MCQ" (mirrors the backend's
  // fix/evidence-exclude-mcq convention).
  questionType: string | null
}

/** Mirrors aggregatedData AiGradeDTO — fetched separately from crops. */
export interface AiGrade {
  id: number
  questionNumber: number
  questionKey: string
  marksObtained: number | null
  maxMarks: number | null
  confidenceScore: number | null
  manualReviewFlag: boolean | null
  feedback: string | null
  criteria: string | null
  reviewStatus: string | null
  finalMarks: number | null
}

/**
 * Identity of the student whose scanned answers we want. These are the values
 * as stored in the crops table (grade '12', section 'S', subject 'Mathematics',
 * exam 'Preboard 1', roll '0011') — the caller passes backend-ready values.
 */
export interface CropStudentContext {
  grade: string
  section: string
  subject: string
  exam: string
  roll: string
  // Stable key. When set, the backend matches crops by admission_no instead of
  // roll (roll_number disagrees between the crops import and the roster).
  admissionNo?: string
}

/**
 * Whole-question attemptable max from one question's crop rows. Two bbox
 * conventions exist: old batches stamp the whole-question max on every row
 * (take the max); new UT batches stamp per-sub-part maxes with 0 on the
 * parent row (sum the sub-part maxes). Mirrors the backend rule.
 */
export function wholeQuestionMax(rows: { questionKey: string; maxMarks: number | null }[]): number | null {
  const keyMax = new Map<string, number>()
  for (const r of rows) {
    if (r.maxMarks == null) continue
    keyMax.set(r.questionKey, Math.max(keyMax.get(r.questionKey) ?? 0, r.maxMarks))
  }
  if (keyMax.size === 0) return null
  let parentZero = false
  let maxAny = 0
  let subSum = 0
  for (const [key, m] of keyMax) {
    if (!key.includes('.') && m === 0) parentZero = true
    maxAny = Math.max(maxAny, m)
    if (key.includes('.')) subSum += m
  }
  const whole = parentZero && subSum > 0 ? subSum : maxAny
  return whole > 0 ? whole : null
}

/** One student's marked score on one whole question, from their crop rows. */
export interface PersonalQuestionStat {
  questionNumber: number
  got: number
  max: number
}

/**
 * Per-whole-question (student marks, attemptable max) from a student's crops.
 * Sub-part rows mirror the parent's whole-question marks, so the max marked
 * row IS the student's score on the question; the denominator is always
 * wholeQuestionMax (never a single sub-part's max). Unmarked questions
 * (no row with marks) are left out — marked-only, per the metrics contract.
 */
export function personalQuestionStats(crops: AnswerCrop[]): PersonalQuestionStat[] {
  const byQ = new Map<number, AnswerCrop[]>()
  for (const c of crops) {
    const num = c.questionNumber != null ? Math.trunc(c.questionNumber) : Math.trunc(parseFloat(c.questionKey))
    if (!Number.isFinite(num)) continue
    byQ.set(num, [...(byQ.get(num) ?? []), c])
  }
  const out: PersonalQuestionStat[] = []
  for (const [questionNumber, group] of byQ) {
    const marked = group.map((c) => c.marks).filter((m): m is number => m != null)
    if (marked.length === 0) continue
    const max = wholeQuestionMax(group)
    if (max == null || max <= 0) continue
    out.push({ questionNumber, got: Math.max(...marked), max })
  }
  return out.sort((a, b) => a.questionNumber - b.questionNumber)
}

export async function fetchAnswerCrops(ctx: CropStudentContext): Promise<AnswerCrop[]> {
  return apiGet<AnswerCrop[]>(AGGREGATED_API_BASE, '/api/answer-crops', {
    grade: ctx.grade,
    section: ctx.section,
    subject: ctx.subject,
    exam: ctx.exam,
    roll: ctx.roll,
    admissionNo: ctx.admissionNo ?? '',
  })
}

export async function fetchAiGrades(ctx: CropStudentContext): Promise<AiGrade[]> {
  return apiGet<AiGrade[]>(AGGREGATED_API_BASE, '/api/answer-crops/ai-grades', {
    grade: ctx.grade,
    section: ctx.section,
    subject: ctx.subject,
    exam: ctx.exam,
    roll: ctx.roll,
    admissionNo: ctx.admissionNo ?? '',
  })
}

export interface AiGradeReviewResult {
  id: number
  reviewStatus: string
  finalMarks: number
}

export async function reviewAiGrade(
  evalId: number,
  action: 'accept' | 'change',
  finalMarks?: number,
): Promise<AiGradeReviewResult> {
  const { getStoredToken } = await import('./auth')
  const token = getStoredToken()
  const res = await fetch(`${AGGREGATED_API_BASE}/api/answer-crops/ai-grade/${evalId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...(finalMarks != null ? { finalMarks } : {}) }),
  })
  if (!res.ok) throw new Error(`AI grade review failed (${res.status})`)
  return res.json()
}

/** One (grade, subject, section, exam) combo that has scanned answers. */
export interface CropFilterCombo {
  grade: string
  subject: string
  section: string
  exam: string
  // Who takes this class (beaver#806). The endpoint always sends it — empty when
  // nobody is allocated, and empty for a caller not entitled to staff rosters —
  // but it is optional HERE on purpose. aggregatedData and this app ship
  // separately, so a build of one can be live against a build of the other that
  // predates the field. Declaring it optional is what stops a caller writing
  // `for (const t of c.teachers)` and taking the whole page down on that day.
  // Read it through comboTeachers(), never directly.
  teachers?: ClassTeacher[]
  // The caller's role for THIS combo, read off the access-policy grant that
  // covers it: 'teacher' | 'hod' | 'coordinator' | 'principal' for staff,
  // 'student' or 'operations' otherwise. Optional for the same reason as
  // `teachers` — a build of aggregatedData that predates the field sends none,
  // and app/lib/senior-scope.ts then treats no row as led.
  role?: string
}

/**
 * The real, data-driven filter options (all grades incl. 11, real subjects/exams).
 * Excluded-year exams (see EXCLUDED_ACADEMIC_YEARS) are dropped here at the
 * source, so every downstream consumer — year dropdown, exam list, default
 * selection, per-page row filters — inherits the exclusion. A (grade,subject,
 * section) combo whose only exams are excluded simply disappears from view,
 * which is the intended effect.
 */
// One in-flight/recent request serves every caller. The combos feed is
// parameterless and identical for all components, yet a single page load was
// firing it 4x concurrently (layout + page + detail components), each a
// full-table DISTINCT on the API side — the duplicate calls queued behind
// each other and pushed the page's real data fetches seconds later. The
// cache spans components but not sessions: a short TTL keeps a long-lived
// tab from missing newly pushed exams, and a failed fetch is not cached so
// the next caller retries.
//
// Past the TTL, a caller gets the last good list straight away and the refresh
// runs in the background (stale-while-revalidate). Waiting instead cost every
// page that calls this directly (student, exam, student chapter/exam views)
// the full /filters round trip once a minute had passed — 3.6 s on prod for a
// principal — before any of its own data could load.
const CROP_FILTERS_TTL_MS = 60_000
let cropFiltersCache: { at: number; promise: Promise<CropFilterCombo[]> } | null = null
let lastCropFilters: CropFilterCombo[] | null = null

export async function fetchCropFilters(): Promise<CropFilterCombo[]> {
  const now = Date.now()
  if (cropFiltersCache && now - cropFiltersCache.at < CROP_FILTERS_TTL_MS) {
    return lastCropFilters ?? cropFiltersCache.promise
  }
  const promise = apiGet<CropFilterCombo[]>(AGGREGATED_API_BASE, '/api/answer-crops/filters')
    .then((combos) => combos.filter((c) => !isExcludedAcademicYear(c.exam)))
  cropFiltersCache = { at: now, promise }
  promise.then(
    (combos) => {
      lastCropFilters = combos
    },
    () => {
      if (cropFiltersCache?.promise === promise) cropFiltersCache = null
    },
  )
  return lastCropFilters ?? promise
}

/**
 * Real "students who lost marks" evidence for the remediation drawer — actual
 * scanned crops (name, question, marks lost, R2 image). Empty for exams with no
 * scanned crops, so the drawer falls back to its placeholder design.
 */
export interface EvidenceCrop {
  rollNumber: string
  studentName: string | null
  questionNumber: number | null
  croppedImageUrl: string | null
  marks: number | null
  maxMarks: number | null
}

/**
 * Scanned answers that lost marks, worst first. `chapter` scopes them to that
 * chapter's questions — without it the endpoint returns one exam-wide list, so
 * every chapter's drawer showed whichever answers lost the most marks anywhere
 * on the paper. The cap is applied after the filter, so a chapter gets its own
 * worst answers rather than a slice of the paper's.
 */
export async function fetchExamEvidence(
  f: { grade: string; section: string; subject: string; exam: string },
  chapter?: string | null,
): Promise<EvidenceCrop[]> {
  try {
    return await apiGet<EvidenceCrop[]>(AGGREGATED_API_BASE, '/api/answer-crops/evidence', {
      grade: f.grade,
      section: f.section,
      subject: f.subject,
      exam: f.exam,
      ...(chapter ? { chapter } : {}),
    })
  } catch {
    return []
  }
}

/** Mirrors aggregatedData StudentCropRosterDTO. */
export interface CropRosterRow {
  rollNumber: string
  admissionNo: string | null
  studentName: string
  questionCount: number
  totalMarks: number | null
  totalMaxMarks: number | null
  // AI-generated dominant error type — null until populated (column hidden)
  commonMistake: string | null
}

export async function fetchCropRoster(f: {
  grade: string
  section: string
  subject: string
  exam: string
  // Self-scoped mode (student login): the backend gates by the caller's own
  // admission_no claim instead of cohort grants and returns ONLY this
  // student's roster row. Omit for staff/class-level calls.
  admissionNo?: string
}): Promise<CropRosterRow[]> {
  return apiGet<CropRosterRow[]>(AGGREGATED_API_BASE, '/api/answer-crops/roster', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    exam: f.exam,
    admissionNo: f.admissionNo,
  })
}

/** One student's marks on one chapter (summed over the exam scope) — powers
 * the roster's strongest/weakest columns (Teacher Metrics spec). */
export interface StudentChapterStat {
  opsStudentId: string
  admissionNo: string | null
  rollNumber: string | null
  chapter: string
  got: number
  chapterMax: number
}

// An explicitly EMPTY exam scope means "the caller's year filter matched no
// exams" — the honest result is no rows, not the server's every-exam
// aggregate. (Omitting `exams` entirely still means "across all exams", per
// each endpoint's contract; the apiGet layer drops empty arrays from the
// query string, which would silently turn one into the other.)
function emptyExamScope(exams?: string[]): boolean {
  return exams !== undefined && exams.length === 0
}

export async function fetchStudentChapterStats(f: {
  grade: string
  section: string
  subject: string
  exams?: string[]
  // Self-scoped mode (student login): backend gates by the caller's own
  // admission_no claim and returns only this student's rows. Omit for staff.
  admissionNo?: string
}): Promise<StudentChapterStat[]> {
  if (emptyExamScope(f.exams)) return []
  return apiGet<StudentChapterStat[]>(AGGREGATED_API_BASE, '/api/answer-crops/student-chapter-stats', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    exam: f.exams,
    admissionNo: f.admissionNo,
  })
}

/** One student's marks per Bloom's-taxonomy bucket over the exam scope. */
export interface StudentBloomStat {
  bloomType: string
  got: number
  maxMarks: number
  questions: number
}

export async function fetchStudentBloomStats(f: {
  grade: string
  section: string
  subject: string
  admissionNo: string
  exams?: string[]
}): Promise<StudentBloomStat[]> {
  if (emptyExamScope(f.exams)) return []
  return apiGet<StudentBloomStat[]>(AGGREGATED_API_BASE, '/api/answer-crops/student-bloom-stats', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    admissionNo: f.admissionNo,
    exam: f.exams,
  })
}

/** AI-authored status copy per Analysis-tab graph (empty until populated). */
export interface StudentAnalysisStatus {
  graph: 'exam' | 'chapter' | 'question'
  statusTitle: string | null
  statusDescription: string | null
  /** null on legacy subject-less rows */
  subject?: string | null
  /** the exam the card was written for */
  examScope?: string | null
}

/** With `subject`, the backend returns one row per graph, preferring a
 * subject-specific row over a legacy subject-less one. Cards are kept per
 * exam: with `exam`, that exam's cards only (none if it has none); without
 * it, the latest exam's card per graph. */
export async function fetchStudentAnalysisStatus(
  admissionNo: string,
  subject?: string,
  exam?: string,
): Promise<StudentAnalysisStatus[]> {
  return apiGet<StudentAnalysisStatus[]>(AGGREGATED_API_BASE, '/api/answer-crops/student-analysis-status', {
    admissionNo,
    subject,
    exam,
  })
}

/** Class average % per chapter from scanned marks, across all exams of the
 * grade/subject/section (Teacher Login Metrics spec; OR groups handled). */
export interface ChapterStat {
  chapter: string
  avgPct: number | null
  avgMarks: number | null
  chapterMax: number | null
  studentExams: number
  // Inputs for the chapter drawer's "Most common error" block. Named to match
  // the shape /api/chapter-details already returns. Optional: a chapter with
  // no classified errors yet omits them, and the drawer drops the block rather
  // than showing invented percentages (the reason it went in eb6b242).
  errorTypeBreakdown?: { errorType: string; marksLost?: number; percentage: string | number }[]
  chapterInsights?: string[]
}

/** Class average % per CONCEPT per EXAM within one chapter, from scanned
 * marks (Teacher Metrics "By Concept" spec). One row per (exam, concept)
 * that was actually tested and marked. */
export interface ConceptExamStat {
  exam: string
  concept: string
  avgPct: number | null
  avgMarks: number | null
  conceptMax: number | null
  students: number
}

export async function fetchConceptStats(f: {
  grade: string
  section: string
  subject: string
  chapter: string
  // Optional exam scope, as in fetchChapterStats. Omitted = every exam of
  // the cohort ("across all exams", per the spec).
  exams?: string[]
}): Promise<ConceptExamStat[]> {
  if (emptyExamScope(f.exams)) return []
  return apiGet<ConceptExamStat[]>(AGGREGATED_API_BASE, '/api/answer-crops/concept-stats', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    chapter: f.chapter,
    exam: f.exams,
  })
}

export async function fetchChapterStats(f: {
  grade: string
  section: string
  subject: string
  // Optional exam scope: a single exam id, or the academic year's exams for
  // 'All Exams'. Omitted = every exam of the cohort.
  exams?: string[]
}): Promise<ChapterStat[]> {
  if (emptyExamScope(f.exams)) return []
  return apiGet<ChapterStat[]>(AGGREGATED_API_BASE, '/api/answer-crops/chapter-stats', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    exam: f.exams,
  })
}
