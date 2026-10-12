// Question data access for the Questions list + detail pages.
//
// Question TEXT/marks/type come from the paper-based endpoint (works for ALL
// classes, incl. grade 11 / scanned sections):
//   GET /api/question-paper/questions?grade&subject&exam  -> PaperQuestionDTO[]
//   GET /api/question-paper/questions/{id}                -> PaperQuestionDTO
// Per-question ANALYTICS (class accuracy) comes from the analytics endpoint
// (only populated for evaluated classes) and is overlaid where available:
//   GET /api/questions?grade&section&subject&exam         -> QuestionDTO[]

import { apiGet, AGGREGATED_API_BASE } from './api'
import { prettifyMath } from './math-text'
import { humanizeErrorCode } from './error-type-labels'
import { toQueryParams, type AnalyticsFilters } from './filters'

// question_common_mistakes.pattern is normally already student/teacher-facing
// prose ("Answered a different demand than the question set"), written by the
// pipeline step that summarises a mistake into a sentence. A minority of rows
// -- some chapters in some exams -- skip that step and store the raw
// error-taxonomy code they were classified against instead (e.g.
// 'F-SUBSTANCE-IDENTIFIED-WRONGLY'), which then leaked straight to the
// Common Mistakes list as internal jargon. There's no taxonomy lookup to
// translate these through (the codes aren't even in error_taxonomy), so this
// degrades them the same way error-type-labels.ts's fallback does for an
// unrecognised bucket: drop a leading category letter, turn hyphens into
// spaces, sentence-case. A real prose pattern never matches this shape (it
// has spaces and lowercase letters), so the check is safe either way.
//
// The first version required a SINGLE-letter prefix and dropped exactly two
// characters, which was right for 'F-SUBSTANCE-IDENTIFIED-WRONGLY' and wrong
// for every code whose first segment is a topic rather than a category —
// 'CROP-SOIL-CLIMATE-MATCH-WRONG' reached a student's screen verbatim because
// it failed the test and passed through untouched. Those are the majority: of
// the 169 codes in use that are absent from error_taxonomy, the first segment
// is a multi-letter topic (CROP, PROOF, MATH, CONGRUENCE, ISOSCELES, JACOBIN,
// REVOLUTION...) far more often than a category letter.
//
// So match any all-caps hyphenated code, and let humanizeErrorCode decide
// whether the first segment is a droppable category — it owns that mapping
// already, and duplicating it here is how the two drifted apart.
const TAXONOMY_CODE_PATTERN = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/
// Authors also store COMPOUND patterns — several codes on one answer joined by
// ' + ' (faults that co-occur) or ', ' (a list): 'PROOF-STEPS-WITHOUT-REASONS +
// MULTI-PART-PROOF-PART-SKIPPED', or by '; ' between two full SME codes. The
// spaces fail the single-code shape test, so a compound reached a student's
// Home page verbatim. Split on the separator, humanise each piece if — and
// only if — every piece is a code, and rejoin with the author's own separator
// so the co-occurrence meaning of '+' survives.
//
// The separator is not always spaced: the same authoring runs also wrote
// 'PROOF-STEPS-WITHOUT-REASONS+MULTI-PART-PROOF-PART-SKIPPED' and
// 'PB-FACTORISATION-SPLITTING-FAILS,I-WHICH-POLYNOMIAL-ASKED-MISREAD' — 24
// patterns the first version left raw because it required the spaces. And
// 'NONE + MULTI-PART-PROOF-PART-SKIPPED' means "no code fitted the main fault,
// plus this one" — NONE is bookkeeping, so it is dropped rather than shown.
// Whitespace around the separator is therefore optional on input and
// normalised on output. Prose is still safe: a prose sentence's commas sit
// between words, not between hyphenated all-caps codes.
const COMPOUND_SEP = /(\s*[+,;]\s*)/
const SEP_OUT: Record<string, string> = { '+': ' + ', ',': ', ', ';': '; ' }
function humanizeMistakePattern(pattern: string): string {
  if (TAXONOMY_CODE_PATTERN.test(pattern)) return humanizeErrorCode(pattern)
  const parts = pattern.split(COMPOUND_SEP)
  const codes = parts.filter((_, i) => i % 2 === 0).map((c) => c.trim())
  if (codes.length < 2 || !codes.every((c) => c === 'NONE' || TAXONOMY_CODE_PATTERN.test(c))) return pattern
  const kept: { code: string; sep: string | null }[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const c = parts[i].trim()
    if (c === 'NONE') continue
    kept.push({ code: humanizeErrorCode(c), sep: i + 1 < parts.length ? parts[i + 1].trim() : null })
  }
  if (!kept.length) return pattern
  return kept.map((k, i) => k.code + (i < kept.length - 1 ? SEP_OUT[k.sep ?? '+'] ?? ' + ' : '')).join('')
}

/** Mirrors aggregatedData PaperQuestionDTO (real question text). */
export interface PaperQuestion {
  id: number
  questionNumber: number
  questionText: string
  questionType: string
  maxMarks: number | null
  chapterName: string | null
  chapterNumber: number | null
  concept: string | null
  weightageTag: string | null
  bloomTaxonomy: string | null
  difficultyLevel: string | null
  questionLabel: string | null
  optionGroup: string | null
  exam: string
  subject: string
  grade: string
  answerKey: string | null
  aiAnswer: string | null
  // AI-generated performance summary — null until populated
  aiSummary: string | null
  hasDiagram: boolean | null
  diagramCropUrl: string | null
}

/** Mirrors aggregatedData QuestionDTO (analytics — accuracy overlay). */
interface QuestionDTO {
  id: number
  accuracy: number
  totalStudents: number
}

export interface QuestionRow {
  id: number
  q: string // 'Q1'
  title: string // questionText
  chapter: string
  concept: string
  type: string // CBSE type (MCQ/VSA/SA/LA/CASE_STUDY)
  bloomTaxonomy: string
  difficulty: string
  avg: number // class accuracy % (0 where analytics not available)
  marks: number
  totalStudents: number
}

/** One exam's questions, grouped for the accordion UI. */
export interface QuestionGroup {
  exam: string
  questions: QuestionRow[]
}

export async function fetchPaperQuestions(filters: AnalyticsFilters): Promise<PaperQuestion[]> {
  return apiGet<PaperQuestion[]>(AGGREGATED_API_BASE, '/api/question-paper/questions', {
    grade: filters.grade,
    subject: filters.subject,
    exam: filters.exam,
  })
}

export async function fetchQuestionById(id: number | string): Promise<PaperQuestion | null> {
  try {
    return await apiGet<PaperQuestion>(AGGREGATED_API_BASE, `/api/question-paper/questions/${id}`)
  } catch {
    return null
  }
}

/** Real exam header facts (date + total marks) for the exam detail page. */
export interface ExamInfo {
  exam: string
  examDate: string | null
  maxMarks: number | null
  // nullable AI copy for the exam Summary tab (Teacher Metrics spec)
  examSummaryTitle?: string | null
  examSummaryDescription?: string | null
}

export async function fetchExamInfo(filters: AnalyticsFilters): Promise<ExamInfo | null> {
  try {
    return await apiGet<ExamInfo>(AGGREGATED_API_BASE, '/api/question-paper/exam-info', {
      grade: filters.grade,
      subject: filters.subject,
      exam: filters.exam,
    })
  } catch {
    return null
  }
}

/** Pre-computed per-section AI summary for the exam Summary tab (teacher view).
 * Staff-only endpoint — do not call from student-role components (403s). */
export interface ExamSectionSummary {
  title: string | null
  subtitle: string | null
  generatedAt?: string | null
}

export async function fetchExamSectionSummary(f: {
  grade: string
  section: string
  subject: string
  exam: string
}): Promise<ExamSectionSummary | null> {
  return apiGet<ExamSectionSummary>(AGGREGATED_API_BASE, '/api/question-paper/exam-section-summary', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    exam: f.exam,
  }).catch(() => null)
}

/** Pre-computed per-student AI summary for the student-login exam detail page's
 * Summary card ("See where your marks went on this exam"). Self-scoped endpoint
 * — a student reads only their own row — so it is safe from student components. */
export interface StudentExamSummary {
  title: string | null
  subtitle: string | null
  generatedAt?: string | null
}

export async function fetchStudentExamSummary(f: {
  grade: string
  section: string
  subject: string
  exam: string
  admissionNo: string
}): Promise<StudentExamSummary | null> {
  return apiGet<StudentExamSummary>(AGGREGATED_API_BASE, '/api/question-paper/student-exam-summary', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    exam: f.exam,
    admissionNo: f.admissionNo,
  }).catch(() => null)
}

/** Pre-computed per-student AI summary for the student-login chapter-detail
 * page's Summary panel. Two pairs: examView fills the By Exam tab, conceptView
 * the By Concept tab. Self-scoped endpoint (matched by admissionNo + exam +
 * chapter) — a student reads only their own row — so it is safe to call from
 * student components. Returns null on any error so the UI keeps its
 * "No analysis yet" placeholder. */
export interface SummaryPair {
  title: string | null
  subtitle: string | null
}
export interface StudentChapterSummary {
  examView: SummaryPair | null
  conceptView: SummaryPair | null
  generatedAt?: string | null
}

export async function fetchStudentChapterSummary(f: {
  grade: string
  section: string
  subject: string
  exam: string
  chapter: string
  admissionNo: string
}): Promise<StudentChapterSummary | null> {
  return apiGet<StudentChapterSummary>(AGGREGATED_API_BASE, '/api/question-paper/student-chapter-summary', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    exam: f.exam,
    chapter: f.chapter,
    admissionNo: f.admissionNo,
  }).catch(() => null)
}

/** Pre-computed per-section AI summary for one question, shown on the Question
 * Detail page next to the "Section average" number (teacher view). Staff-only
 * endpoint — do not call from student-role components (403s). */
export interface QuestionSectionSummary {
  summary: string | null
  generatedAt?: string | null
}

export async function fetchQuestionSectionSummary(f: {
  grade: string
  section: string
  subject: string
  exam: string
  questionNumber: number | string
}): Promise<QuestionSectionSummary | null> {
  return apiGet<QuestionSectionSummary>(AGGREGATED_API_BASE, '/api/question-paper/question-section-summary', {
    grade: f.grade,
    section: f.section,
    subject: f.subject,
    exam: f.exam,
    questionNumber: String(f.questionNumber),
  }).catch(() => null)
}

/** Format an ISO exam date (YYYY-MM-DD) as "9 Feb, 2026"; passthrough on failure. */
export function formatExamDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = parseInt(m[3], 10)
  const mon = months[parseInt(m[2], 10) - 1]
  return mon ? `${day} ${mon}, ${m[1]}` : iso
}

/** Exam-level remediation (per-chapter errors + common mistakes). */
export interface RemediationChapter {
  chapter: string | null
  questions: number
  // error OCCURRENCES across the chapter's questions — not students, not marks
  errorCount: number
  dominantError: string | null
  // real figures from the scanned marks, over the sections that were
  // classified. Optional: an older API build does not send them.
  studentsAffected?: number
  marksLost?: number
  // What marksLost is out of: the whole-question maxes the scope was scored on
  // in this chapter (beaver#921 — "5.5/6", not a bare 5.5 that reads like a
  // score). Optional: an older API build does not send it.
  marksAvailable?: number
  // The earlier-class skill behind this student's own Procedural-Background
  // mistakes in the chapter (beaver#921 item 3), from error_code_prerequisite.
  // Only on a student's self-scoped view; absent when nothing is mapped.
  prerequisite?: { grade: number; subject: string; chapter: string | null; skill: string; status: string }
  // The recoverable slice of marksLost: marks this section still loses on the
  // questions the WHOLE GRADE already scores >=70% of. Drives the "Scoring
  // marks left on the table" card; the distribution card keeps marksLost.
  // Optional: an older API build does not send them.
  easyMarks?: number
  easyStudents?: number
  // Distinct easy questions this scope was actually scored on in the
  // chapter — the denominator easyMarks needs beside it. Self-scoped to one
  // student this is "how many of MY questions here does the grade call
  // easy"; unscoped it's "how many easy questions here had any scoring
  // activity at all".
  easyQuestions?: number
}
export interface MistakeEvidence {
  imageUrl: string
  student: string | null
  marks: number | null
  maxMarks: number | null
}
export interface RemediationMistake {
  chapter: string | null
  pattern: string
  count: number
  description: string
  questionNumber: number | null
  // real student work for this mistake's question (most-marks-lost crop)
  evidenceImageUrl: string | null
  evidenceStudent: string | null
  evidenceMarks: number | null
  evidenceMaxMarks: number | null
  evidencesJson?: string | null
  // parsed from evidencesJson by fetchRemediation — one entry per affected
  // student (worst first), for the evidence pager
  evidences?: MistakeEvidence[]
  // The error TYPE (Conceptual, Slip, ...) the API resolved for this pattern
  // through error_taxonomy; null for free-text patterns older runs wrote.
  // Optional: an older API build does not send it — every row then reads as
  // 'Other', never as an invented type.
  errorTypeName?: string | null
  // JSON list of the students.id values behind this row's count, so rows
  // merged across questions count each student once. Null from older runs
  // with no per-answer rows, and absent from an older API build.
  studentIds?: string | null
}
export interface Remediation {
  chapters: RemediationChapter[]
  mistakes: RemediationMistake[]
}

/**
 * Tagged result, because a failed fetch is NOT the same thing as "this section
 * has no remediation data" (beaver#831). The old `catch { return null }` shape
 * rendered a timeout, a 500 or an auth blip identically to an unclassified
 * section: the whole block silently disappeared, and remounting the page
 * "fixed" it by accident of the retry. Callers branch on `ok` and show a
 * retryable error state for `ok: false`; only a SUCCESSFUL response with zero
 * chapters may be treated as "no data".
 */
export type RemediationFetch = { ok: true; data: Remediation } | { ok: false }

// One fault, one entry. question_common_mistakes is rolled up per QUESTION, so a
// label that recurs on several questions of a chapter — "Agreement asserted
// without argument" on 16.1 and again on 16.2 — arrived as two rows and every
// consumer (Home, chapter, exam) rendered the same title twice, back to back,
// with a small count on each. Measured across prod: 1,012 (chapter, section,
// label) groups repeat a label, 1,244 extra entries a student scrolls past.
//
// Merge here, once, after humanising, so all three screens agree. Grouped by
// chapter + label: counts summed, evidence lists concatenated and re-sorted
// worst-first, the flat evidence* fields following the new first entry. The
// "N students made this error; ... One example: X" description is rebuilt
// with the merged N — the number in the text otherwise goes stale — keeping
// the largest contributor's example. Rows whose label is unique pass through
// untouched, and first-seen order is kept so a chapter's ranking survives.
const ONE_EXAMPLE = /One example:\s*([\s\S]+)$/

// Students, not rows. Each row's count is per question, so summing them
// counted a student once per question they made the mistake on: Jai Hind
// G10 Chemistry showed "7 students" for a section of fewer than six. Union
// the rows' studentIds when every row carries them; otherwise (older runs,
// older API) fall back to the sum, the best the counts alone can say.
function mergedStudentCount(g: RemediationMistake[]): number {
  const ids = new Set<number>()
  for (const m of g) {
    let list: unknown
    try {
      list = m.studentIds ? JSON.parse(m.studentIds) : null
    } catch {
      list = null
    }
    if (!Array.isArray(list)) return g.reduce((n, r) => n + (r.count ?? 0), 0)
    for (const id of list) ids.add(Number(id))
  }
  return ids.size
}
function mergeSameLabel(mistakes: RemediationMistake[]): RemediationMistake[] {
  const groups = new Map<string, RemediationMistake[]>()
  for (const m of mistakes) {
    const key = `${m.chapter ?? ''} ${m.pattern}`
    const g = groups.get(key)
    if (g) g.push(m)
    else groups.set(key, [m])
  }
  const out: RemediationMistake[] = []
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push(g[0])
      continue
    }
    const lost = (e: MistakeEvidence) => (e.maxMarks ?? 0) - (e.marks ?? 0)
    // One page per student: the same student's crop from each merged
    // question would otherwise page past more "students" than sat the paper.
    // Sorted worst-first, so the first seen per name is that student's worst.
    const seen = new Set<string>()
    const evidences = g
      .flatMap((m) => m.evidences ?? [])
      .sort((a, b) => lost(b) - lost(a))
      .filter((e) => {
        if (e.student == null) return true
        if (seen.has(e.student)) return false
        seen.add(e.student)
        return true
      })
    const count = mergedStudentCount(g)
    const top = g.reduce((a, b) => ((b.count ?? 0) > (a.count ?? 0) ? b : a))
    const example = ONE_EXAMPLE.exec(top.description)?.[1]?.trim() ?? top.description.trim()
    const first = evidences[0]
    out.push({
      ...g[0],
      count,
      description:
        count > 1 ? `${count} students made this error; their working differs. One example: ${example}` : top.description,
      evidences,
      evidenceImageUrl: first?.imageUrl ?? g[0].evidenceImageUrl,
      evidenceStudent: first ? first.student : g[0].evidenceStudent,
      evidenceMarks: first ? first.marks : g[0].evidenceMarks,
      evidenceMaxMarks: first ? first.maxMarks : g[0].evidenceMaxMarks,
    })
  }
  return out
}

export async function fetchRemediation(
  filters: AnalyticsFilters,
  /**
   * A staff caller viewing one student's profile page passes this to get
   * THAT student's own easyMarks/marksLost/studentsAffected/easyStudents
   * instead of the section aggregate — the same self-scoping lever a
   * logged-in student's own token already gets. The API authorizes it
   * against the target student's actual cohort, not this param, so passing
   * the wrong admission number here fails closed rather than leaking another
   * student's marks.
   */
  admissionNo?: string | null,
): Promise<RemediationFetch> {
  try {
    const rem = await apiGet<Remediation>(AGGREGATED_API_BASE, '/api/question-paper/remediation', {
      grade: filters.grade,
      subject: filters.subject,
      exam: filters.exam,
      // easyMarks is counted for THIS section (the classification behind it is
      // grade-wide). Omitting it makes the API fall back to the classified
      // sections, which is the same scope marksLost already uses.
      ...(filters.section ? { section: filters.section } : {}),
      ...(admissionNo ? { admissionNo } : {}),
    })
    for (const m of rem.mistakes) {
      m.pattern = humanizeMistakePattern(prettifyMath(m.pattern))
      m.description = prettifyMath(m.description)
      try {
        m.evidences = m.evidencesJson ? (JSON.parse(m.evidencesJson) as MistakeEvidence[]) : []
      } catch {
        m.evidences = []
      }
    }
    rem.mistakes = mergeSameLabel(rem.mistakes)
    return { ok: true, data: rem }
  } catch (err) {
    // With the request context, so a report like beaver#831's is diagnosable
    // from a screen share instead of a debugging session.
    console.error('[remediation] fetch failed', {
      grade: filters.grade,
      section: filters.section,
      subject: filters.subject,
      exam: filters.exam,
    }, err)
    return { ok: false }
  }
}

/** One row of `/api/question-paper/chapter-common-mistakes` — a mistake
 * pattern from `question_common_mistakes`, rolled up by chapter rather than
 * by one exam (unlike {@link RemediationMistake}). No evidence crops: the
 * Chapter page's mistake cards (chapter variant) show title/description/
 * question tags only. */
export interface ChapterMistake {
  chapter: string | null
  pattern: string
  count: number
  description: string
  questionNumber: number | null
  // The error TYPE (Conceptual, Slip, ...) the API resolves for the row;
  // null for free text no taxonomy entry matches. Absent from an older API
  // build — every row then reads as 'Other'.
  errorTypeName?: string | null
}
export type ChapterMistakesFetch = { ok: true; data: ChapterMistake[] } | { ok: false }

/** Every recorded mistake pattern for one chapter, across every exam the
 * grade has sat that tested it — the Chapter page's "This Chapter's Common
 * Mistakes" section. Same tagged-result shape as {@link fetchRemediation}
 * (beaver#831): a failed fetch must not render identically to "nothing to
 * show yet". */
export async function fetchChapterMistakes(params: {
  grade: string
  subject: string
  chapter: string
  section?: string
}): Promise<ChapterMistakesFetch> {
  try {
    const res = await apiGet<{ mistakes: ChapterMistake[] }>(
      AGGREGATED_API_BASE,
      '/api/question-paper/chapter-common-mistakes',
      {
        grade: params.grade,
        subject: params.subject,
        chapter: params.chapter,
        ...(params.section ? { section: params.section } : {}),
      },
    )
    for (const m of res.mistakes) {
      m.pattern = humanizeMistakePattern(prettifyMath(m.pattern))
      m.description = prettifyMath(m.description)
    }
    return { ok: true, data: res.mistakes }
  } catch (err) {
    console.error('[chapter-mistakes] fetch failed', {
      grade: params.grade,
      subject: params.subject,
      chapter: params.chapter,
      section: params.section,
    }, err)
    return { ok: false }
  }
}

/** The reviewed answer key for a question — R2 crop image + clean text. */
export interface AnswerKey {
  croppedImageUrl: string | null
  cleanText: string | null
  ocrText: string | null
  mcqChoice: string | null
  status: string | null
}

export async function fetchAnswerKey(id: number | string): Promise<AnswerKey | null> {
  try {
    return await apiGet<AnswerKey>(AGGREGATED_API_BASE, `/api/question-paper/questions/${id}/answer-key`)
  } catch {
    return null
  }
}

/** Single-question analytics (only populated for evaluated classes). */
export interface QuestionStats {
  totalStudents: number
  maxMarks: number | null
  averageMarks: { obtained: number; total: number; percentage: number } | null
  dominantErrorType: string | null
  // errorTypeName: the mistake's kind (Conceptual, Slip, ...); null when the
  // pattern resolves to no taxonomy type, absent from an older API build —
  // both read as 'Other'.
  commonMistakes: { rank: number; pattern: string; count: number; description: string; errorTypeName?: string | null }[]
  keyInsights: { errorType: string; percentage: number; description: string }[]
  studentList: { marksObtained: number | null; maxMarks: number | null }[]
}

export async function fetchQuestionStats(
  id: number | string,
  section: string,
): Promise<QuestionStats | null> {
  try {
    const stats = await apiGet<QuestionStats>(AGGREGATED_API_BASE, `/api/questions/${id}/stats`, { section })
    for (const m of stats.commonMistakes) {
      m.pattern = humanizeMistakePattern(prettifyMath(m.pattern))
    }
    return stats
  } catch {
    return null
  }
}

// Crops-backed stats for a question: score histogram + section average from
// scanned marks, shaped exactly like QuestionStats so the detail page renders
// unchanged. Mistakes/insights stay empty (those are AI-derived — honest gap).
// Exported too: the student detail page's "By Question" tooltip reuses
// `averageMarks` for its "Class average was X/Y marks" line.
export async function fetchCropDistributionAsStats(
  questionNumber: number,
  filters: AnalyticsFilters,
): Promise<QuestionStats | null> {
  try {
    const d = await apiGet<{
      students: number
      avgMarks: number | null
      maxMarks: number | null
      accuracy: number | null
      distribution: { marks: number; students: number }[]
    }>(AGGREGATED_API_BASE, '/api/answer-crops/question-distribution', {
      grade: filters.grade,
      section: filters.section,
      subject: filters.subject,
      exam: filters.exam,
      question: Math.trunc(questionNumber),
    })
    if (!d.students) return null
    const studentList = d.distribution.flatMap((b) =>
      Array.from({ length: b.students }, () => ({ marksObtained: b.marks, maxMarks: d.maxMarks })),
    )
    return {
      totalStudents: d.students,
      maxMarks: d.maxMarks,
      averageMarks:
        d.avgMarks != null && d.maxMarks
          ? { obtained: d.avgMarks, total: d.maxMarks, percentage: d.accuracy ?? (100 * d.avgMarks) / d.maxMarks }
          : null,
      dominantErrorType: null,
      commonMistakes: [],
      keyInsights: [],
      studentList,
    }
  } catch {
    return null
  }
}

/**
 * Every question's class average for one class and exam, in one request
 * (/question-averages), keyed by question number — the same averageMarks
 * fetchCropDistributionAsStats builds per question. Null when the endpoint
 * can't answer (e.g. an API without it yet); callers then fall back to the
 * per-question requests.
 */
export async function fetchQuestionAverages(
  filters: AnalyticsFilters,
): Promise<Map<number, QuestionStats['averageMarks']> | null> {
  try {
    const rows = await apiGet<{
      question: number
      students: number
      avgMarks: number | null
      maxMarks: number | null
      accuracy: number | null
    }[]>(AGGREGATED_API_BASE, '/api/answer-crops/question-averages', {
      grade: filters.grade,
      section: filters.section,
      subject: filters.subject,
      exam: filters.exam,
    })
    const out = new Map<number, QuestionStats['averageMarks']>()
    for (const d of rows) {
      const n = Number(d.question)
      // Only whole numbers: the per-question endpoint matched question_number
      // exactly with an integer, so that's what each tooltip asked for.
      if (!Number.isInteger(n) || !d.students) continue
      out.set(
        n,
        d.avgMarks != null && d.maxMarks
          ? { obtained: d.avgMarks, total: d.maxMarks, percentage: d.accuracy ?? (100 * d.avgMarks) / d.maxMarks }
          : null,
      )
    }
    return out
  } catch {
    return null
  }
}

/**
 * Stats for the question detail page. The scanned-marks (crop) layer drives the
 * Question Performance % and the score distribution — it is whole-question
 * correct. The legacy per-question analytics is NOT used for the average: for
 * multi-part questions the marks live on the parent whole-question crop and
 * every sub-part reads 0 in analytics, so analytics would show 0% (same root
 * cause as the list — see fetchQuestions). Analytics is only kept for its
 * commonMistakes / keyInsights / dominantErrorType overlay, and as the fallback
 * when there's no crop distribution at all.
 */
export async function fetchQuestionStatsSmart(
  id: number | string,
  questionNumber: number,
  filters: AnalyticsFilters,
): Promise<QuestionStats | null> {
  const [crop, analytics] = await Promise.all([
    fetchCropDistributionAsStats(questionNumber, filters),
    fetchQuestionStats(id, filters.section),
  ])
  if (crop?.averageMarks || crop?.studentList?.length) {
    return {
      ...crop,
      commonMistakes: analytics?.commonMistakes ?? crop.commonMistakes,
      keyInsights: analytics?.keyInsights ?? crop.keyInsights,
      dominantErrorType: analytics?.dominantErrorType ?? crop.dominantErrorType,
    }
  }
  return analytics ?? crop
}

// Analytics accuracy keyed by question id — best-effort (empty for classes with
// no evaluated answers in loam_db).
async function fetchAccuracyById(filters: AnalyticsFilters): Promise<Map<number, QuestionDTO>> {
  try {
    const rows = await apiGet<QuestionDTO[]>(
      AGGREGATED_API_BASE,
      '/api/questions',
      toQueryParams(filters, { includeExam: true, includeSection: true }),
    )
    return new Map(rows.map((r) => [r.id, r]))
  } catch {
    return new Map()
  }
}

// Per-question class stats computed from SCANNED MARKS (student_answer_crops)
// — the metrics-contract quantitative layer for classes with no LLM analytics.
// Keyed by question NUMBER (crops don't know question ids).
interface CropQuestionStat {
  questionNumber: number
  students: number
  avgMarks: number | null
  maxMarks: number | null
  accuracy: number | null
}

async function fetchCropQuestionStats(
  filters: AnalyticsFilters,
): Promise<Map<number, CropQuestionStat>> {
  try {
    const rows = await apiGet<CropQuestionStat[]>(
      AGGREGATED_API_BASE,
      '/api/answer-crops/question-stats',
      {
        grade: filters.grade,
        section: filters.section,
        subject: filters.subject,
        exam: filters.exam,
      },
    )
    return new Map(rows.map((r) => [r.questionNumber, r]))
  } catch {
    return new Map()
  }
}

export async function fetchQuestions(filters: AnalyticsFilters): Promise<QuestionGroup> {
  const [paper, accuracy] = await Promise.all([
    fetchPaperQuestions(filters),
    fetchAccuracyById(filters),
  ])
  // Crop-based class avg, ALWAYS fetched. It's the analytics fallback per
  // question, not just when analytics is wholly absent: the analytics
  // /api/questions join drops questions with no concept_id, so a concept-less
  // question is missing from `accuracy` while its section-mates are present —
  // without the crop stat its class avg would blank to "—" (beaver#693).
  const cropStats = await fetchCropQuestionStats(filters)

  // ONE row per whole question (Teacher Metrics spec): sub-parts (17.1, 17.2)
  // collapse into Q17. Marks = group-aware sum of sub-part maxes (OR
  // alternatives count once); metadata = first sub-part's non-null values;
  // class avg = whole-question accuracy (crop stats are whole-question
  // already; analytics sub-part accuracies are marks-weighted).
  const byWhole = new Map<number, PaperQuestion[]>()
  for (const p of paper) {
    const key = Math.trunc(p.questionNumber)
    byWhole.set(key, [...(byWhole.get(key) ?? []), p])
  }
  const questions: QuestionRow[] = Array.from(byWhole.entries())
    .map(([num, parts]) => {
      parts.sort((x, y) => x.questionNumber - y.questionNumber)
      const first = parts[0]
      const pick = <T>(get: (p: PaperQuestion) => T | null | undefined): T | null => {
        for (const part of parts) {
          const v = get(part)
          if (v != null && v !== '') return v
        }
        return null
      }
      const c = cropStats.get(num)
      // An either/or question (sub-parts sharing an option_group) is scoreable
      // out of LESS than the sum of every sub-part's max — you answer only one
      // alternative. For those, Marks = the whole-question ATTEMPTABLE MAX from
      // the crop stats (e.g. Q17 = 5, not 10), so Marks agrees with Class avg
      // and the score distribution. Normal all-attempted multi-part questions
      // keep the sum of sub-part maxes (which the crop max equals anyway); the
      // sum is also the fallback when no crop stat exists for this question.
      const isOrQuestion = parts.some((part) => part.optionGroup != null && part.optionGroup !== '')
      const sumOfPartMarks = parts.reduce((a, part) => a + (part.maxMarks ?? 0), 0)
      const marks = isOrQuestion && c?.maxMarks != null ? c.maxMarks : sumOfPartMarks
      // Analytics path: marks-weighted mean of the sub-part accuracies. This is
      // UNRELIABLE for multi-part questions — the marks live on the parent
      // whole-question crop, so every sub-part scores 0 in analytics and the
      // weighted mean collapses to 0 (beaver: Chemistry Q10/12/13/14/16 showed
      // 0% despite real crop averages). The crop stat below IS whole-question-
      // correct, so it takes precedence; analytics is only a fallback for
      // questions with no crop stat at all.
      let aAvg: number | null = null
      let aStudents = 0
      if (accuracy.size > 0) {
        let wSum = 0
        let w = 0
        for (const part of parts) {
          const a = accuracy.get(part.id)
          if (!a) continue
          const weight = part.maxMarks ?? 1
          wSum += a.accuracy * weight
          w += weight
          aStudents = Math.max(aStudents, a.totalStudents)
        }
        if (w > 0) aAvg = wSum / w
      }
      return {
        id: first.id,
        q: `Q${num}`,
        title: parts.map((p) => p.questionText).join('\n'),
        chapter: pick((p) => p.chapterName) ?? '—',
        concept: pick((p) => p.concept) ?? '—',
        type: pick((p) => p.questionType) ?? '—',
        bloomTaxonomy: pick((p) => p.bloomTaxonomy) ?? '—',
        difficulty: pick((p) => p.difficultyLevel) ?? '—',
        avg: c?.accuracy != null ? Math.round(c.accuracy) : aAvg != null ? Math.round(aAvg) : 0,
        marks,
        totalStudents: c?.students ?? aStudents,
      }
    })
    .sort((a, b) => Number(a.q.slice(1)) - Number(b.q.slice(1)))
  return { exam: filters.exam, questions }
}

/**
 * Every exam of the cohort's selected academic year, one group each
 * (Teacher Metrics spec: the Questions page groups by exam, expandable).
 */
export async function fetchQuestionGroups(
  filters: AnalyticsFilters,
  examIds: string[],
): Promise<QuestionGroup[]> {
  const groups = await Promise.all(
    examIds.map((exam) => fetchQuestions({ ...filters, exam }).catch(() => ({ exam, questions: [] }))),
  )
  return groups.filter((g) => g.questions.length > 0)
}
