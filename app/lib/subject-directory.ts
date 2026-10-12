// Data for the leadership Subjects directory (/subject).
//
// A teacher's pages are scoped to one subject at a time; this page is the
// inverse — one grade + one exam, every subject the viewer is allowed to see,
// each with its grade-wide average. The subject list and section counts come
// from the crop filters every page already has; the averages from the Grade
// read model (one request for the whole grade), with the per-section roster as
// the fallback.

import { fetchCropRoster, fetchChapterStats, type CropFilterCombo } from './answer-crops'
import { examAcademicYear, logicalExamKey } from './filters'
import { fetchGradeRm, gradeRmExamKey, type GradeRmSubject } from './grade-rm'

export interface SubjectSummary {
  /** Raw backend subject name, e.g. 'Mathematics'. */
  subject: string
  /** How many sections of this grade take the subject. */
  sections: number
  /** Mark-weighted average as a percentage; null when nothing is marked yet. */
  average: number | null
  /**
   * This subject's own exam id for the sitting — e.g.
   * '11_PHYSICS_UNITTEST1_25-26' where the page's selection was
   * '11_ACCOUNTANCY_UNITTEST1_25-26'. Every per-subject link and fetch must
   * use this, not the selected id, or it asks for one subject's paper under
   * another subject's name.
   */
  examId: string
}

/**
 * The combos making up one sitting for a grade: every subject's copy of the
 * selected exam. `exam` is any one subject's id for it — what the Exam
 * dropdown stores.
 */
export function combosForSitting(
  combos: CropFilterCombo[],
  grade: string,
  exam: string,
): CropFilterCombo[] {
  const key = logicalExamKey(exam)
  return combos.filter((c) => c.grade === grade && logicalExamKey(c.exam) === key)
}

const uniq = (xs: string[]) => Array.from(new Set(xs)).sort()

/**
 * Subjects this viewer may see, optionally within one grade.
 *
 * Derived from `combos`, NOT from a fixture: /api/answer-crops/filters already
 * runs AccessGate.filterCombos, which trims the list to the caller's grants
 * from their JWT. Reading it back is the one source of truth — a hand-written
 * list could disagree with the server and silently hide allowed subjects.
 */
export function subjectsInScope(combos: CropFilterCombo[], grade?: string): string[] {
  return uniq(combos.filter((c) => !grade || c.grade === grade).map((c) => c.subject))
}

/**
 * One card per subject, for the given grade + exam.
 *
 * No second filter here — `combos` arrives already scoped, so every subject in
 * the sitting is one this viewer is allowed to see.
 *
 * The average is mark-weighted across the subject's sections (total marks over
 * total max marks), not the mean of each section's percentage — sections differ
 * in size, and averaging averages would over-weight the small ones.
 */
export async function fetchSubjectSummaries(params: {
  combos: CropFilterCombo[]
  grade: string
  exam: string
}): Promise<SubjectSummary[]> {
  const { combos, grade, exam } = params
  const sitting = combosForSitting(combos, grade, exam)
  const subjects = uniq(sitting.map((c) => c.subject))
  const rmAverages = await fetchGradeRmAverages(grade, sitting)

  return Promise.all(
    subjects.map(async (subject): Promise<SubjectSummary> => {
      const rows = sitting.filter((c) => c.subject === subject)
      const sections = uniq(rows.map((c) => c.section))
      const fromRm = rmAverages.get(subjectKey(subject))
      return {
        subject,
        sections: sections.length,
        // A subject the read model hasn't built yet falls back to the
        // per-section rosters, so the card is never emptier than before.
        average: fromRm !== undefined ? fromRm : await rosterAverage(grade, subject, rows),
        // The id embeds grade + subject but not section, so every row for this
        // subject carries the same one.
        examId: rows[0].exam,
      }
    }),
  )
}

const subjectKey = (subject: string) => subject.replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Grade-wide average per subject from the Grade read model: one request per
 * exam family (normally one for the whole sitting) instead of one roster per
 * subject and section. Same formula as rosterAverage — total marks over total
 * max marks across marked papers. A failed request just leaves its subjects
 * out of the map, so they take the roster path.
 */
async function fetchGradeRmAverages(
  grade: string,
  sitting: CropFilterCombo[],
): Promise<Map<string, number | null>> {
  const families = uniq(sitting.map((c) => gradeRmExamKey(c.exam, grade, c.subject)))
  const responses = await Promise.all(
    families.map((family) => fetchGradeRm({ grade, exam: family }).catch(() => null)),
  )
  const averages = new Map<string, number | null>()
  for (const response of responses) {
    for (const item of (response?.subjects ?? []) as GradeRmSubject[]) {
      const marked = item.averages?.markedStudentCount ?? 0
      averages.set(subjectKey(item.subject), marked > 0 ? Math.round(item.averages.gradeAverage) : null)
    }
  }
  return averages
}

async function rosterAverage(grade: string, subject: string, rows: CropFilterCombo[]): Promise<number | null> {
  const rosters = await Promise.all(
    // Each (subject, section) carries its own exam id — read it off the
    // combo rather than reusing the selected one.
    rows.map((c) => fetchCropRoster({ grade, section: c.section, subject, exam: c.exam }).catch(() => [])),
  )
  let marks = 0
  let max = 0
  for (const roster of rosters) {
    for (const row of roster) {
      // Unmarked scans have no honest score to contribute — skipping them
      // keeps the average over what was actually marked instead of
      // dragging it toward zero.
      if (row.totalMarks == null || !row.totalMaxMarks) continue
      marks += row.totalMarks
      max += row.totalMaxMarks
    }
  }
  return max > 0 ? Math.round((marks / max) * 100) : null
}

// ─── Subject detail (/subject/[subjectId], Figma 1550-20532) ─────────────────
//
// Two shapes, both keyed on section so the charts share an x-axis: the
// subject's average per section, and each chapter's average per section.

/**
 * One plotted value. The chart uses `average` (a percentage) so bars stay
 * comparable, while `marks`/`max` carry the real figures for the tooltip —
 * a principal reads "28 of 45 marks", not "62%".
 */
export interface ScorePoint {
  /** percentage 0-100; null when nothing is marked */
  average: number | null
  /** average marks per marked student */
  marks: number | null
  /** marks the paper (or chapter) was out of */
  max: number | null
}

/** One bar: a section and its average, or null when nothing there is marked. */
export interface SectionAverage extends ScorePoint {
  section: string
}

export interface ChapterSectionAverages {
  chapter: string
  sections: SectionAverage[]
}

/** Every section of this grade that takes the subject, in label order. */
export function sectionsForSubject(
  combos: CropFilterCombo[],
  grade: string,
  subject: string,
): string[] {
  return uniq(
    combos.filter((c) => c.grade === grade && c.subject === subject).map((c) => c.section),
  )
}

/** Every exam id of this subject in this grade (the "Exam: All" scope). */
export function examsForSubject(
  combos: CropFilterCombo[],
  grade: string,
  subject: string,
): string[] {
  return uniq(
    combos.filter((c) => c.grade === grade && c.subject === subject).map((c) => c.exam),
  )
}

/**
 * Mark-weighted percentage over roster rows, plus the average marks behind it.
 *
 * The percentage is total-over-total (papers differ in size, so averaging each
 * student's percentage would over-weight the small papers). The marks figures
 * are per student, which is what the tooltip quotes — a section total of
 * "1,240 marks" means nothing to a reader.
 */
function aggregate(rosters: { totalMarks: number | null; totalMaxMarks: number | null }[][]): ScorePoint {
  let marks = 0
  let max = 0
  let marked = 0
  for (const roster of rosters) {
    for (const row of roster) {
      if (row.totalMarks == null || !row.totalMaxMarks) continue
      marks += row.totalMarks
      max += row.totalMaxMarks
      marked += 1
    }
  }
  if (max <= 0 || marked === 0) return { average: null, marks: null, max: null }
  return {
    average: Math.round((marks / max) * 100),
    marks: roundScore(marks / marked),
    max: roundScore(max / marked),
  }
}

/**
 * "Section performance" — the subject's average in each section, across the
 * exams in scope. Weighted by marks rather than averaging each exam's
 * percentage, for the same reason as the directory: papers differ in size.
 */
export async function fetchSectionPerformance(params: {
  grade: string
  subject: string
  sections: string[]
  exams: string[]
}): Promise<SectionAverage[]> {
  const { grade, subject, sections, exams } = params
  return Promise.all(
    sections.map(async (section) => {
      const rosters = await Promise.all(
        exams.map((exam) =>
          fetchCropRoster({ grade, section, subject, exam }).catch(() => []),
        ),
      )
      return { section, ...aggregate(rosters) }
    }),
  )
}

/**
 * "<Chapter> performance" — one entry per chapter, each carrying that
 * chapter's average in every section.
 *
 * One request per section (chapter-stats already accepts the exam list), then
 * pivoted from section→chapters into chapter→sections, which is the axis the
 * cards plot. Chapters are unioned across sections so one that only appears in
 * some sections still gets a card, with the others reading null rather than
 * being silently dropped.
 */
export async function fetchChapterPerformance(params: {
  grade: string
  subject: string
  sections: string[]
  exams: string[]
}): Promise<ChapterSectionAverages[]> {
  const { grade, subject, sections, exams } = params
  const perSection = await Promise.all(
    sections.map(async (section) => ({
      section,
      stats: await fetchChapterStats({ grade, section, subject, exams }).catch(() => []),
    })),
  )

  const chapters = uniq(perSection.flatMap((s) => s.stats.map((st) => st.chapter)))
  return chapters.map((chapter) => ({
    chapter,
    sections: perSection.map(({ section, stats }) => {
      // avgPct arrives as a raw float — a chapter worth 2.8% comes back as
      // 2.8000000000000003 and rendered straight into the tooltip. Every other
      // figure on this page is rounded at the source; this one wasn't.
      const stat = stats.find((st) => st.chapter === chapter)
      return {
        section,
        average: stat?.avgPct == null ? null : roundScore(stat.avgPct),
        marks: stat?.avgMarks == null ? null : roundScore(stat.avgMarks),
        max: stat?.chapterMax == null ? null : roundScore(stat.chapterMax),
      }
    }),
  }))
}

/** At most one decimal: 2.8000000000000003 -> 2.8, 76 stays 76. */
export function roundScore(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * The tooltip's sentence: how this section compares with the mean of the
 * sections that have marks. Returns undefined when there's nothing to compare
 * against (one section, or only one marked), rather than "0 points below".
 */
export function marksDetail(
  point: ScorePoint,
  peers: ScorePoint[],
  averageNoun = 'average',
): string | undefined {
  if (point.marks == null || point.max == null) return undefined
  const head = `${point.marks} of ${point.max} marks`

  // Marks only compare when everything is out of the same total. Across exams
  // or across chapters the maxes differ — "3 marks below average" would then
  // be comparing a 40-mark unit test with an 80-mark semester paper. In that
  // case state the marks and stop.
  const comparable = peers.filter((p) => p.marks !== null && p.max === point.max)
  if (comparable.length < 2) return `${head}.`

  const mean = comparable.reduce((sum, p) => sum + (p.marks as number), 0) / comparable.length
  // Round the gap, not just the operands: 2.8 - 3 is -0.19999999999999996 in
  // binary floating point, which would print in full inside the sentence.
  const diff = roundScore(point.marks - mean)
  if (diff === 0) return `${head}, level with the ${averageNoun}.`
  return `${head}, ${Math.abs(diff)} marks ${diff > 0 ? 'above' : 'below'} the ${averageNoun}.`
}

// ─── Single-section view (Figma 1550-20854) ─────────────────────────────────
//
// With one section chosen there is nothing to compare across, so the question
// becomes "how is this section doing over time" — the x-axis turns into exams.

export interface ExamAverage extends ScorePoint {
  /** raw exam id, kept for links */
  exam: string
}

/**
 * Coarse chronological rank for an exam id. The CBSE year runs Unit Test 1 →
 * Mid Term / Half Yearly → Unit Test 2 → Mid Term 2 → Preboards → Annual.
 *
 * Needed because exam ids sort alphabetically as ANNUALEXAM < MIDTERM <
 * PREBOARD < UNITTEST — which would draw the year's trend line backwards,
 * opening on the final exam. Mirrors examChronoRank in
 * components/student-dashboard.tsx; kept separate rather than exported from
 * there so the student view can't be disturbed by a change made for this page.
 */
function examChronoRank(examId: string): number {
  // Separators kept so the sitting number is only a digit that ends the
  // token: in 'MIDTERM_26-27' the '2' is the year, not Mid Term 2.
  const u = examId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  const ut = /UNIT_?TE[SX]T_?(\d)?(?![0-9])/.exec(u) // covers the UNITTEXT typo in ids
  if (ut) return Number(ut[1] || '1') <= 1 ? 1 : 3
  const mid = /MID_?TERM_?(\d)?(?![0-9])/.exec(u)
  if (mid) return Number(mid[1] || '1') <= 1 ? 2 : 4
  if (/HALF_?YEARLY/.test(u)) return 2
  if (/PRE_?BOARD/.test(u)) return 5
  if (/ANNUAL_?EXAM|FINAL_?EXAM/.test(u)) return 6
  return 7
}

/** Exam ids in the order they were sat: academic year first, then the CBSE
 * exam-calendar rank; ties fall back to the id. */
export function sortExamsChronologically(exams: string[]): string[] {
  return [...exams].sort(
    (a, b) =>
      (examAcademicYear(a) ?? '').localeCompare(examAcademicYear(b) ?? '') ||
      examChronoRank(a) - examChronoRank(b) ||
      a.localeCompare(b),
  )
}

/**
 * "Section performance" in single-section mode: one section's average in each
 * exam, oldest first. One roster request per exam.
 */
export async function fetchExamTrend(params: {
  grade: string
  subject: string
  section: string
  exams: string[]
}): Promise<ExamAverage[]> {
  const { grade, subject, section, exams } = params
  const ordered = sortExamsChronologically(exams)
  return Promise.all(
    ordered.map(async (exam) => {
      const roster = await fetchCropRoster({ grade, section, subject, exam }).catch(() => [])
      return { exam, ...aggregate([roster]) }
    }),
  )
}
