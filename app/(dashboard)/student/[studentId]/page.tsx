'use client'

import { use, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusChartCard, type ChartTabOption } from '@/components/status-chart-card'
import { TopicTable, type TopicRow } from '@/components/topic-table'
import { QuestionDrawer, type StudentEvidence } from '@/components/question-drawer'
import { CommonMistakesSection, type MistakeItem } from '@/components/common-mistakes-section'
import { useFeatureFlag } from '@/components/config-provider'
import { classificationEnabledFor, useClassifiedCohorts } from '@/app/lib/classification-scope'
import { PerformanceTab } from '@/components/performance-tab'
import { BreadcrumbSwitcher } from '@/components/breadcrumb-switcher'
import { PrevNextNav } from '@/components/prev-next-nav'
import { usePageBreadcrumb } from '@/app/lib/breadcrumb'
import { fetchCropDistributionAsStats, fetchQuestionAverages, fetchPaperQuestions, fetchRemediation, type PaperQuestion, type Remediation } from '@/app/lib/questions'
import { fetchStudentAnswerErrors, type StudentAnswerError } from '@/app/lib/students'
import { formatExamName, matchesAcademicYear } from '@/app/lib/filters'
import { sortExamsChronologically } from '@/app/lib/subject-directory'
import { studentErrorTypeLabel, studentErrorTypeTitle } from '@/app/lib/error-type-labels'
import {
  fetchAnswerCrops,
  fetchCropFilters,
  fetchCropRoster,
  fetchStudentAnalysisStatus,
  fetchStudentBloomStats,
  fetchStudentChapterStats,
  wholeQuestionMax,
  type AnswerCrop,
  type CropRosterRow,
} from '@/app/lib/answer-crops'
import type { AnalyticsFilters } from '@/app/lib/filters'
import { practiseFor } from '@/app/lib/remediation-advice'
import { trackTabKey } from '@/app/lib/analytics'

// Analytics names for the tabs, keyed by state value — see the Tabs below.

// ─── data ────────────────────────────────────────────────────────────────────

// Format "10" / "10.5" without a trailing ".0".
function fmtMarks(n: number): string {
  return String(Math.round(n * 10) / 10)
}

// Spec labels the difficulty Hard / Moderate / Easy — normalise the paper's
// raw value ("medium" etc.) to that casing/wording.
function fmtDifficulty(raw: string): string {
  const t = raw.trim().toLowerCase()
  if (t === 'medium' || t === 'moderate') return 'Moderate'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const student = {
  name: 'Shristi',
  meta: 'Grade 8 · Sec 1',
  status: 'Harder than expected',
  statusDescription:
    'Foundational gaps in Application of Derivatives have widened across exams - consider chapter-level reteach before Pre-Board 2.',
}

// Student detail page graphs use a 0–100 scale (marks are percentages), unlike
// the 0–60 default shared with the chapter detail page's charts.
const studentYDomain: [number, number] = [0, 100]
const studentYTicks = [0, 25, 50, 75, 100]

const chartTabs: ChartTabOption[] = [
  {
    key: 'exam',
    label: 'By Exam',
    chartTitle: 'Student average across exams',
    kind: 'line',
    yDomain: studentYDomain,
    yTicks: studentYTicks,
    legendLabel: 'Marks Scored',
    valueSuffix: '%',
    data: [
      { label: 'Unit test', value: 32 },
      { label: 'Mid term1', value: 35 },
      { label: 'Mid term 2', value: 26 },
      { label: 'Sem 1', value: 28 },
    ],
  },
  {
    key: 'chapter',
    label: 'By Chapter',
    chartTitle: 'Student average across chapters',
    kind: 'bar',
    barColor: '#58728d',
    yDomain: studentYDomain,
    yTicks: studentYTicks,
    legendLabel: 'Marks Scored in a Chapter',
    tooltipLabel: 'Scored',
    data: [
      { label: 'Fraction', value: 32, valueLabel: '6/20', detail: 'This chapter was worth 20 marks in the exam.' },
      { label: 'Algebra', value: 55, valueLabel: '11/20', detail: 'This chapter was worth 20 marks in the exam.' },
      { label: 'Mensuration', value: 43, valueLabel: '9/20', detail: 'This chapter was worth 20 marks in the exam.' },
      { label: 'Force and Pressure', value: 12, valueLabel: '2/20', detail: 'This chapter was worth 20 marks in the exam.' },
      { label: 'Light', value: 38, valueLabel: '8/20', detail: 'This chapter was worth 20 marks in the exam.' },
      { label: 'Cell structure', value: 40, valueLabel: '8/20', detail: 'This chapter was worth 20 marks in the exam.' },
    ],
  },
  {
    key: 'question',
    label: 'By Question',
    chartTitle: 'Student average across questions',
    kind: 'bar',
    barColor: '#58728d',
    scrollable: true,
    yDomain: studentYDomain,
    yTicks: studentYTicks,
    legendLabel: 'Question-wise Performance',
    tooltipLabel: 'Marks Scored',
    data: [
      { label: 'Q1', value: 32, valueLabel: '2/5', detail: 'Class average was 2.5/5 marks. Below average performance.' },
      { label: 'Q2', value: 55, valueLabel: '3/5', detail: 'Class average was 2.5/5 marks. Above average performance.' },
      { label: 'Q3', value: 43, valueLabel: '2/5', detail: 'Class average was 2/5 marks. Average performance.' },
      { label: 'Q4', value: 12, valueLabel: '1/5', detail: 'Class average was 2.5/5 marks. Below average performance.' },
      { label: 'Q5', value: 38, valueLabel: '2/5', detail: 'Class average was 1.5/5 marks. Above average performance.' },
      { label: 'Q6', value: 40, valueLabel: '2/5', detail: 'Class average was 2/5 marks. Average performance.' },
    ],
  },
]

const scoringItemsHardcoded = [
  { id: 1, chapter: 'MCQs (Section A)',       students: 11, mark: 14, goingWrong: 'Silly mistakes on easy MCQs that most of the class got right.',    toPractise: 'Solve MCQs in timed sets; recheck every option before moving on.' },
  { id: 2, chapter: 'Differential Equations', students: 42, mark: 12, goingWrong: 'Knows the method, but is not spotting the standard form.',         toPractise: 'Drill variable separable and linear DE sums, NCERT first, then PYQs.' },
  { id: 3, chapter: 'Integration',            students: 39, mark: 11, goingWrong: 'Calculation and step slips in attempted sums.',                     toPractise: 'Practise substitution and by-parts sums from the exact wrong types.' },
  { id: 4, chapter: 'Application of Inte...', students: 40, mark: 7,  goingWrong: 'Setup mistake while forming the area under the curve.',             toPractise: 'Redo area-under-curve sums; draw the figure before integrating.' },
  { id: 5, chapter: 'Determinants',           students: 41, mark: 5,  goingWrong: 'Step and calculation mistakes in cofactor and properties.',         toPractise: 'Practise cofactor expansion and property-based sums.' },
  { id: 6, chapter: 'Continuity & Differ...', students: 42, mark: 5,  goingWrong: 'Skipping method steps and losing step marks.',                      toPractise: 'Solve while writing every step; practise from NCERT before timed sets.' },
]


const mistakeLegendHardcoded = [
  { label: 'Foundational gaps', color: '#16a34a', value: 44 },
  { label: 'Mistakes in steps', color: '#3b82f6', value: 19 },
  { label: 'Calculation',       color: '#ffa940', value: 19 },
  { label: 'Reads wrong',       color: '#e76e4f', value: 19 },
]

const mistakesHardcoded = [
  { id: 'm1', color: '#16a34a', title: 'Confused critical point with optimum',  description: "Reported a critical point without verifying it's a max/min",               questions: ['Q1', 'Q5', 'Q4'] },
  { id: 'm2', color: '#16a34a', title: 'Related rates: wrong chain',             description: 'Missed a chain rule step linking dx/dt and dy/dt',                         questions: ['Q1', 'Q5', 'Q4'] },
  { id: 'm3', color: '#16a34a', title: 'Quotient rule arithmetic',               description: 'Made a sign or product error in quotient rule',                             questions: ['Q1', 'Q5', 'Q4'] },
  { id: 'm4', color: '#16a34a', title: 'Misidentified the variable',             description: 'Differentiated w.r.t. wrong variable when problem had two parameters',     questions: ['Q1', 'Q5', 'Q4'] },
]

const compareLegend = [
  { label: 'Carried from class 11 (35%)', color: '#ffa940' },
  { label: 'New in class 12 (65%)',        color: '#e76e4f' },
]

const compareMistakesHardcoded = [
  { id: 'c1', color: '#ffa940', title: 'Quotient rule arithmetic',          description: 'Made a sign or product error in quotient rule',                         questions: ['Q1', 'Q5', 'Q4'] },
  { id: 'c2', color: '#ffa940', title: "Didn't differentiate constraint",   description: 'Set up Lagrange-like reasoning informally without using',               questions: ['Q1', 'Q5', 'Q4'] },
  { id: 'c3', color: '#e76e4f', title: 'Wrong area/volume function setup',  description: 'Set up V or A in terms of wrong variable',                             questions: ['Q1', 'Q5', 'Q4'] },
  { id: 'c4', color: '#e76e4f', title: 'Confused critical point with optimum', description: "Reported a critical point without verifying it's a max/min",         questions: ['Q1', 'Q5', 'Q4'] },
]

const allStudents = [
  { id: 'r01', label: 'Marvin McKinney' },
  { id: 'r02', label: 'Devon Lane' },
  { id: 'r03', label: 'Dianne Russell' },
  { id: 'r04', label: 'Annette Black' },
  { id: 'r05', label: 'Kristin Watson' },
  { id: 'r06', label: 'Floyd Miles' },
  { id: 'r07', label: 'Jane Cooper' },
  { id: 'r08', label: 'Esther Howard' },
  { id: 'r09', label: 'Albert Flores' },
  { id: 'r10', label: 'Savannah Nguyen' },
  { id: 'r11', label: 'Cameron Williamson' },
]

// ─── helpers ─────────────────────────────────────────────────────────────────

// This page is about ONE student. Everything below it renders comes from that
// student's own scanned answers and their own classified errors
// (`student_error_type_summary`). It used to render the exam-wide remediation
// feed — the section's chapters, the section's twelve common mistakes — which
// put other people's numbers on a named student's page, and left the rows
// unclickable because the section's evidence rarely included this student.
function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Marks this student lost on a scanned answer, or null when it isn't marked. */
function marksLostOn(c: AnswerCrop): number | null {
  return c.marks != null && c.maxMarks != null ? c.maxMarks - c.marks : null
}

/**
 * The drawer's "Marks lost" figure. It used to print `marks/maxMarks` — the
 * marks SCORED — under a "Marks lost" heading, so a full-marks answer read
 * "1/1 marks" as though one mark had been dropped.
 */
function marksLostLabel(marks: number | null, maxMarks: number | null): string {
  if (marks == null || maxMarks == null) return '—'
  return `${fmtMarks(maxMarks - marks)} of ${fmtMarks(maxMarks)} marks lost`
}

/** Same, for a classified answer. */
function lostOn(a: StudentAnswerError): number | null {
  return a.marks != null && a.maxMarks != null ? a.maxMarks - a.marks : null
}

/**
 * SME severity, ranked. Marks lost alone put a Minor notation slip worth 3
 * marks above a Major conceptual error worth 2, which is the wrong thing to
 * show a teacher first: severity is how expensive the error is to fix, not how
 * many marks it cost this time. Unrated codes sort last rather than first, so
 * an unclassified answer never outranks a diagnosed one.
 */
const SEVERITY_RANK: Record<string, number> = { major: 3, moderate: 2, minor: 1 }
function severityRank(a: StudentAnswerError): number {
  return SEVERITY_RANK[(a.severity ?? '').trim().toLowerCase()] ?? 0
}

/**
 * The question label for a classified answer. Sub-parts keep theirs — the run
 * classifies 18.1 and 18.2 separately and their diagnoses differ, so collapsing
 * both to "Q18" would put two different mistakes on the same label.
 */
function qKey(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function StudentDetailPage({ params }: { params: Promise<{ studentId: string }> }) {
  // beaver#566/#575/#577 — error-classification-derived; hidden until it's trustworthy.
  const showRemediationTableFlag = useFeatureFlag('show_remediation_table_student_page')
  const showCommonMistakesFlag = useFeatureFlag('show_common_mistakes_student_page')
  const classifiedCohorts = useClassifiedCohorts()
  const showAnswerScriptFeedback = useFeatureFlag('show_answer_script_feedback_student_page')
  const showPerformanceTab = useFeatureFlag('show_performance_tab_student_detail_page')
  const router = useRouter()
  const { studentId } = use(params)
  const searchParams = useSearchParams()
  const classificationOn = classificationEnabledFor(classifiedCohorts, searchParams.get('grade'), searchParams.get('subject'))
  const showRemediationTable = showRemediationTableFlag && classificationOn
  const showCommonMistakes = showCommonMistakesFlag && classificationOn
  const [tab, setTab] = useState('analysis')
  
  const activeTab = showPerformanceTab ? tab : 'analysis'
  const [drawer, setDrawer] = useState<{ topic: string; subtitle: string; students: StudentEvidence[] } | null>(null)
  // This student's own scanned answers — what the chapter tables' View button
  // opens. That drawer used to be filled with invented classmates.
  const [ownCrops, setOwnCrops] = useState<AnswerCrop[]>([])
  // The paper's own question -> chapter mapping (complete, unlike the
  // remediation mistakes feed, which the API caps at 12 rows).
  const [paperQs, setPaperQs] = useState<PaperQuestion[]>([])

  // The roster links carry the real student name + filter context (grade/
  // section/subject/exam) so this page shows the right student and fetches the
  // right scanned answers. Falls back to the mock student when opened directly.
  const activeStudent = allStudents.find((s) => s.id === studentId) ?? allStudents[0]
  const studentName = searchParams.get('name') ?? activeStudent.label
  const hasRealCtx = Boolean(searchParams.get('grade') && searchParams.get('subject'))
  const cropCtx = {
    grade: searchParams.get('grade') ?? '12',
    section: searchParams.get('section') ?? 'S',
    subject: searchParams.get('subject') ?? 'Mathematics',
    exam: searchParams.get('exam') ?? 'Preboard 1',
    roll: studentId,
    // Stable key: crops match by admission first (roll/section can drift
    // between the scan batch and the roster).
    admissionNo: searchParams.get('admission') ?? undefined,
  }

  // Exam scope follows the roster's filter: a single exam, or the academic
  // year's exams when the list page was on 'All Exams' (chapter page's spec).
  const examAll = searchParams.get('examAll') === 'true'
  // Grade and section lead the line (same wording as the exam page's header):
  // without them nothing on screen says which class the roster position and
  // class averages belong to.
  const classLabel = searchParams.get('section')
    ? `Grade ${cropCtx.grade} · Section ${cropCtx.section}`
    : `Grade ${cropCtx.grade}`
  const studentMeta = hasRealCtx
    ? `${classLabel} · ${examAll ? 'Across all Exams' : formatExamName(cropCtx.exam)} · ${cropCtx.subject}`
    : student.meta

  // Real roster (same fetchCropRoster used elsewhere on this page) — feeds the
  // breadcrumb switcher's sibling list instead of the old hardcoded names.
  const [roster, setRoster] = useState<CropRosterRow[]>([])
  useEffect(() => {
    if (!hasRealCtx) { setRoster([]); return }
    let ignore = false
    fetchCropRoster({ grade: cropCtx.grade, section: cropCtx.section, subject: cropCtx.subject, exam: cropCtx.exam })
      .then((rows) => { if (!ignore) setRoster(rows) })
      .catch(() => { if (!ignore) setRoster([]) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRealCtx, cropCtx.grade, cropCtx.section, cropCtx.subject, cropCtx.exam])
  const scopeYear = searchParams.get('year') ?? undefined
  const performanceScopeTitle = examAll ? 'Performance across all exams' : 'Performance in this exam'
  // null = the analysis fetch hasn't resolved yet; [] = it resolved with nothing.
  // Keeping those distinct is what lets the card show a skeleton instead of
  // claiming "No analysis yet" before it has looked (beaver#786).
  const [realTabs, setRealTabs] = useState<ChartTabOption[] | null>(null)
  const analysisLoading = hasRealCtx && realTabs === null
  // Tab scaffolding for the loading pass: same keys as the real tabs, so the
  // user's tab choice survives the swap. The status/chart slots are left empty
  // because `loading` on the card renders skeletons over both of them.
  const loadingTabs: ChartTabOption[] = [
    { key: 'exam', label: 'By Exam', chartTitle: 'Performance across Exams', kind: 'line' },
    { key: 'chapter', label: 'By Chapter', chartTitle: performanceScopeTitle, kind: 'bar' },
    { key: 'question', label: 'By Question', chartTitle: performanceScopeTitle, kind: 'bar' },
  ].map((t) => ({
    ...t,
    kind: t.kind as ChartTabOption['kind'],
    data: [],
    status: '',
    statusDescription: '',
  }))
  useEffect(() => {
    if (!hasRealCtx) { setRealTabs(null); return }
    // Re-entering with a different student/scope must show the skeleton again,
    // not the previous selection's charts while the new fetch runs.
    setRealTabs(null)
    const { grade, section, subject, exam, admissionNo } = cropCtx
    let ignore = false
    ;(async () => {
      const combos = await fetchCropFilters().catch(() => [])
      // Oldest first, so the By Exam line runs Unit Test 1 → Mid Term → …
      // rather than in the API's order.
      const cohortExams = sortExamsChronologically(Array.from(
        new Set(
          combos
            .filter((c) => c.grade === grade && c.subject === subject && c.section === section)
            .map((c) => c.exam),
        ),
      ))
      const scopeExams = examAll ? cohortExams.filter((e) => matchesAcademicYear(e, scopeYear)) : [exam]

      const [statusRows, chapterStats, bloomStats, examPoints, crops, paperQuestions] = await Promise.all([
        // one exam: that exam's cards; All Exams: the latest exam's
        admissionNo ? fetchStudentAnalysisStatus(admissionNo, subject, examAll ? undefined : exam).catch(() => []) : Promise.resolve([]),
        admissionNo
          ? fetchStudentChapterStats({ grade, section, subject, exams: scopeExams }).catch(() => [])
          : Promise.resolve([]),
        admissionNo && examAll
          ? fetchStudentBloomStats({ grade, section, subject, admissionNo, exams: scopeExams }).catch(() => [])
          : Promise.resolve([]),
        // By Exam: the student's % in every exam of the cohort, plus (teacher
        // view has the full roster, unlike the student's own self-scoped
        // view) a real section-average comparison for the tooltip.
        Promise.all(
          cohortExams.map(async (e) => {
            const roster = await fetchCropRoster({ grade, section, subject, exam: e }).catch(() => [])
            const row = roster.find((r) =>
              admissionNo ? r.admissionNo === admissionNo : r.rollNumber.replace(/^0+/, '') === studentId.replace(/^0+/, ''),
            )
            if (!row || row.totalMarks == null || !((row.totalMaxMarks ?? 0) > 0)) return null
            const maxMarks = row.totalMaxMarks as number
            const pct = Math.round((1000 * row.totalMarks) / maxMarks) / 10
            const marked = roster.filter((r) => r.totalMarks != null && (r.totalMaxMarks ?? 0) > 0)
            const classAvgPct = marked.length
              ? (100 * marked.reduce((sum, r) => sum + (r.totalMarks as number), 0)) / marked.length / maxMarks
              : null
            // Same ±10 percentage-point "around" band as the By Student
            // distribution tooltip (beaver#743).
            const position = classAvgPct == null ? null : pct <= classAvgPct - 10 ? 'below' : pct >= classAvgPct + 10 ? 'above' : 'around'
            return {
              label: formatExamName(e),
              value: pct,
              detail: position
                ? `Student has scored ${fmtMarks(row.totalMarks)}/${fmtMarks(maxMarks)} marks. This is ${position} the section's avg on this exam.`
                : undefined,
            }
          }),
        ),
        // By Question (single exam): the student's own crops
        !examAll ? fetchAnswerCrops(cropCtx).catch(() => []) : Promise.resolve([]),
        // Question difficulty (beaver#746), from the paper — single exam only.
        !examAll ? fetchPaperQuestions(cropCtx).catch(() => []) : Promise.resolve([]),
      ])
      if (ignore) return
      setOwnCrops(crops)
      setPaperQs(paperQuestions)

      const statusFor = (graph: string) => {
        const row = statusRows.find((r) => r.graph === graph)
        return {
          status: row?.statusTitle ?? 'No analysis yet',
          statusDescription: row?.statusDescription ?? 'Analysis for this view appears once generated.',
        }
      }

      // By Chapter: this student's rows only (endpoint returns the section)
      const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10))
      const myChapters = chapterStats
        .filter((c) => (admissionNo ? c.admissionNo === admissionNo : (c.rollNumber ?? '').replace(/^0+/, '') === studentId.replace(/^0+/, '')))
        .filter((c) => c.chapterMax > 0)
        .map((c) => ({
          label: c.chapter,
          value: Math.round((1000 * c.got) / c.chapterMax) / 10,
          valueLabel: `${fmtNum(c.got)}/${fmtNum(c.chapterMax)}`,
          detail: `This chapter was worth ${fmtNum(c.chapterMax)} marks ${examAll ? 'across exams' : 'in the exam'}.`,
        }))

      // By Question: single exam -> per question %; All Exams -> bloom types
      let byQuestion: { label: string; value: number; valueLabel?: string; detail?: string }[]
      if (examAll) {
        byQuestion = bloomStats
          .filter((b) => b.maxMarks > 0)
          .map((b) => ({ label: b.bloomType, value: Math.round((1000 * b.got) / b.maxMarks) / 10 }))
      } else {
        // group rows per question; marks = max-marked row (sub-parts mirror
        // the parent), max = whole-question attemptable max
        const byQ = new Map<number, typeof crops>()
        for (const c of crops) {
          if (c.questionNumber == null) continue
          byQ.set(c.questionNumber, [...(byQ.get(c.questionNumber) ?? []), c])
        }
        const perQuestion = Array.from(byQ.entries())
          .map(([n, rows]) => {
            const marks = Math.max(...rows.map((r) => r.marks ?? 0))
            const max = wholeQuestionMax(rows)
            return max ? { n, marks, max } : null
          })
          .filter((q): q is { n: number; marks: number; max: number } => q !== null)
          .sort((a, b) => a.n - b.n)

        // Class average per question, from scanned marks — powers the "Class
        // average was X/Y marks. Below/Above/Average performance" tooltip line.
        // One request for the whole paper; the per-question requests (one per
        // question, 33 on a Grade 12 paper) only if that endpoint can't answer.
        const averages = await fetchQuestionAverages(cropCtx)
        const classStats = averages
          ? perQuestion.map((q) => ({ averageMarks: averages.get(q.n) ?? null }))
          : await Promise.all(
              perQuestion.map((q) => fetchCropDistributionAsStats(q.n, cropCtx).catch(() => null)),
            )
        // beaver#746: question difficulty from the paper, one line above the
        // class-average sentence.
        const difficultyByQ = new Map(
          paperQuestions
            .filter((pq) => pq.difficultyLevel)
            .map((pq) => [Math.trunc(pq.questionNumber), pq.difficultyLevel as string]),
        )
        byQuestion = perQuestion.map((q, i) => {
          const avg = classStats[i]?.averageMarks
          const performance = !avg ? null : q.marks > avg.obtained ? 'Above average' : q.marks < avg.obtained ? 'Below average' : 'Average'
          const difficulty = difficultyByQ.get(q.n)
          const lines = [
            ...(difficulty ? [`Question Difficulty: ${fmtDifficulty(difficulty)}`] : []),
            ...(avg && performance ? [`Class average was ${fmtNum(avg.obtained)}/${fmtNum(avg.total)} marks. ${performance} performance.`] : []),
          ]
          return {
            label: `Q${q.n}`,
            value: Math.round((1000 * q.marks) / q.max) / 10,
            valueLabel: `${fmtNum(q.marks)}/${fmtNum(q.max)}`,
            detail: lines.length ? lines.join('\n') : undefined,
          }
        })
      }

      setRealTabs([
        {
          key: 'exam',
          label: 'By Exam',
          chartTitle: `Performance across Exams`,
          kind: 'line',
          yDomain: studentYDomain,
          yTicks: studentYTicks,
          legendLabel: 'Marks Scored',
          valueSuffix: '%',
          data: examPoints.filter((x): x is { label: string; value: number; detail: string | undefined } => x !== null),
          ...statusFor('exam'),
        },
        {
          key: 'chapter',
          label: 'By Chapter',
          chartTitle: performanceScopeTitle,
          kind: 'bar',
          barColor: '#58728d',
          yDomain: studentYDomain,
          yTicks: studentYTicks,
          legendLabel: 'Marks Scored in a Chapter',
          tooltipLabel: 'Scored',
          data: myChapters,
          ...statusFor('chapter'),
        },
        {
          key: 'question',
          label: 'By Question',
          chartTitle: performanceScopeTitle,
          kind: 'bar',
          barColor: '#58728d',
          scrollable: true,
          yDomain: studentYDomain,
          yTicks: studentYTicks,
          legendLabel: 'Question-wise Performance',
          tooltipLabel: 'Marks Scored',
          data: byQuestion,
          ...statusFor('question'),
        },
      ])
    })().catch(() => {
      // An unexpected throw must not strand the card on "Loading…" forever —
      // fall back to the honest empty state.
      if (!ignore) setRealTabs([])
    })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, examAll, scopeYear, hasRealCtx, cropCtx.grade, cropCtx.section, cropCtx.subject, cropCtx.exam, cropCtx.admissionNo])

  // Real remediation context (same pattern as the exam pages): when the link
  // carries grade/section/subject/exam, every remediation block derives from
  // the exam's real error analytics — empty when none exist, never another
  // subject's hardcoded content.
  const examCtx: AnalyticsFilters | undefined = searchParams.get('exam')
    ? {
        grade: searchParams.get('grade') ?? '',
        section: searchParams.get('section') ?? '',
        subject: searchParams.get('subject') ?? '',
        exam: searchParams.get('exam') ?? '',
      }
    : undefined
  /**
   * This student's own classified answers: one row per answer the run looked
   * at, carrying the model's diagnosis of THAT answer and the crop it read.
   *
   * One request, and it is exact. The previous pass had to intersect the
   * student's error-type counts with the per-question types for the whole
   * section, because nothing recorded which of a student's answers carried
   * which error — a candidate set wider than the student's own count. heron
   * now exports that grain (`student_answer_errors`).
   */
  const [answerErrors, setAnswerErrors] = useState<StudentAnswerError[]>([])
  useEffect(() => {
    if (!examCtx) { setAnswerErrors([]); return }
    let ignore = false
    fetchStudentAnswerErrors(examCtx, { roll: studentId, admissionNo: cropCtx.admissionNo }).then((e) => {
      if (!ignore) setAnswerErrors(e)
    })
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.grade, examCtx?.section, examCtx?.subject, studentId, cropCtx.admissionNo])

  /**
   * This student's OWN easy-marks figures — same grade-wide "easy" filter
   * (≥70% average score rate on a question) as the exam page's "Scoring
   * marks left on the table" card, but self-scoped to this one student
   * instead of the whole section. Without this, the card had to be rebuilt
   * client-side from this student's crops with no way to know which
   * questions the grade finds easy, so it showed EVERY chapter where they
   * lost any marks (labelled "Easy marks" regardless), and the question
   * count next to it was just "how many questions in this chapter", not
   * "how many easy ones" — the two numbers didn't share a filter.
   */
  const [studentRem, setStudentRem] = useState<Remediation | null>(null)
  useEffect(() => {
    if (!examCtx) { setStudentRem(null); return }
    let ignore = false
    fetchRemediation(examCtx, cropCtx.admissionNo).then((r) => {
      if (!ignore) setStudentRem(r.ok ? r.data : null)
    })
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.grade, examCtx?.section, examCtx?.subject, cropCtx.admissionNo])

  /**
   * Every answer the run faulted, `clean` dropped. This is the denominator for
   * real faults — marks lost, and whether this section has been classified at
   * all — so it deliberately still includes answers the taxonomy had no code
   * for. `codedAnswers` below is what reaches the screen.
   */
  const faultedAnswers = answerErrors
    .filter((a) => a.verdict !== 'clean')
    // Severity first, marks lost to break ties.
    .sort((a, b) => severityRank(b) - severityRank(a) || (lostOn(b) ?? 0) - (lostOn(a) ?? 0))

  /**
   * What the teacher actually sees. An answer the model faulted but could not
   * code used to render as a card headed "Not in the taxonomy yet" — a statement
   * about our vocabulary, not about the student, and nothing a teacher can act
   * on. Those answers are still in `student_answer_errors` and go to the SMEs as
   * a gap list; they are simply not shown here.
   *
   * `faultedAnswers` is kept for anything counting real faults (marks lost,
   * whether this section has been classified at all), so hiding a card never
   * changes a number.
   */
  const codedAnswers = faultedAnswers.filter((a) => a.errorTypeName)

  // The chapter of every question on the paper, and the reverse map.
  const questionsByChapter = new Map<string, Set<number>>()
  const chapterOfQuestion = new Map<number, string>()
  for (const q of paperQs) {
    if (!q.chapterName || q.questionNumber == null) continue
    const n = Math.trunc(q.questionNumber)
    const set = questionsByChapter.get(q.chapterName) ?? new Set<number>()
    set.add(n)
    questionsByChapter.set(q.chapterName, set)
    chapterOfQuestion.set(n, q.chapterName)
  }

  /** The chapter of one classified answer — its own, else the paper's map. */
  function chapterOfAnswer(a: StudentAnswerError): string | null {
    return a.chapterName ?? chapterOfQuestion.get(Math.trunc(a.questionNumber)) ?? null
  }

  /**
   * The dominant error type among THIS student's faulted answers in a chapter.
   * Null when the run classified none of their answers there — that happens
   * (it skips MCQs, full marks and answers with no OCR text), and the table
   * shows an em dash rather than borrowing the section's.
   */
  function chapterErrorTypes(chapter: string): { type: string; count: number }[] {
    const acc = new Map<string, number>()
    for (const a of faultedAnswers) {
      if (chapterOfAnswer(a) !== chapter || !a.errorTypeName) continue
      acc.set(a.errorTypeName, (acc.get(a.errorTypeName) ?? 0) + 1)
    }
    return Array.from(acc, ([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
  }

  /**
   * The paper's attemptable max per WHOLE question — sub-part maxes summed
   * (14.1 + 14.2 = 4), taken from the paper rather than the crops.
   *
   * The crops cannot be trusted for this. A question carries both a whole-
   * question row and its sub-part rows, and the parent's max_marks follows no
   * consistent convention: Q18's parent says 5 and its parts are 2 + 3, but
   * Q14's parent says 2 while its parts are 2 + 2. Summing crop rows
   * double-counts, and `wholeQuestionMax` (written for the two bbox
   * conventions) reads Q14 as 2. The paper is unambiguous.
   */
  const wholeMaxByQuestion = (() => {
    // An either/or pair is ONE question's worth of marks, not two. Paper 83
    // groups 14.1/14.2 as `14_opt` (2 marks each) and 19.1/19.2 as `19_opt`
    // (5 each): the student answers one branch and that branch IS the
    // question. Summing the parts makes Q19 worth 10, which inflated every
    // chapter containing it. Take the MAX within an option group and SUM
    // across groups; parts with no group (18.1 + 18.2, 20.1 + 20.2) genuinely
    // sum to the parent.
    const byGroup = new Map<number, Map<string, number>>()
    for (const q of paperQs) {
      if (q.questionNumber == null || q.maxMarks == null) continue
      const n = Math.trunc(q.questionNumber)
      const grp = q.optionGroup || String(q.questionNumber)
      const groups = byGroup.get(n) ?? new Map<string, number>()
      groups.set(grp, Math.max(groups.get(grp) ?? 0, q.maxMarks))
      byGroup.set(n, groups)
    }
    const out = new Map<number, number>()
    for (const [n, groups] of byGroup) {
      out.set(n, Array.from(groups.values()).reduce((a, b) => a + b, 0))
    }
    return out
  })()

  /**
   * This student's score per whole question. Sub-part crop rows mirror the
   * parent's whole-question mark, so the highest marked row IS their score on
   * the question — the same rule `personalQuestionStats` uses.
   */
  const gotByQuestion = new Map<number, number>()
  for (const c of ownCrops) {
    if (c.questionNumber == null || c.marks == null) continue
    const n = Math.trunc(c.questionNumber)
    gotByQuestion.set(n, Math.max(gotByQuestion.get(n) ?? 0, c.marks))
  }

  /** Whether any crop image exists for a whole question. */
  const hasCropForQuestion = new Map<number, boolean>()
  for (const c of ownCrops) {
    if (c.questionNumber == null) continue
    const n = Math.trunc(c.questionNumber)
    hasCropForQuestion.set(n, (hasCropForQuestion.get(n) ?? false) || Boolean(c.croppedImageUrl))
  }

  /**
   * "Scoring marks left on the table": this student's OWN easy-marks figures
   * — same grade-wide "easy" filter (≥70% average score rate on a question)
   * the exam page's identical card uses, self-scoped to this one student via
   * `studentRem` (fetched with their admissionNo). This used to be built
   * entirely from this student's crops with no "easy" filter at all — every
   * chapter where they lost ANY marks showed up, labelled "Easy marks"
   * regardless, and the row's question count was just "how many questions in
   * the chapter", unrelated to which ones the grade actually finds easy.
   * Both numbers now come from the same filtered scope, so they finally
   * agree.
   */
  const scoringItems = examCtx
    ? (studentRem?.chapters ?? [])
        .filter((c) => (c.easyMarks ?? 0) > 0)
        .map((c, i) => {
          const chapter = c.chapter ?? '—'
          const dominant = chapterErrorTypes(chapter)[0]?.type ?? null
          // A bare em dash on the chapter with the most easy marks left reads
          // as a gap in the product. Usually it is a gap in the scan: the run
          // skips answers with no OCR text, and a chapter whose answers were
          // never captured has nothing to diagnose. Say which.
          const qs = questionsByChapter.get(chapter)
          const withCrop = qs ? Array.from(qs).some((n) => hasCropForQuestion.get(n)) : false
          const uncaptured = !dominant && !withCrop
          return {
            id: i + 1,
            chapter,
            students: c.easyQuestions ?? 0,
            mark: fmtMarks(c.easyMarks ?? 0),
            sort: c.easyMarks ?? 0,
            goingWrong: dominant ? studentErrorTypeLabel(dominant) : uncaptured ? 'No answer captured' : '—',
            toPractise: dominant
              ? practiseFor(dominant) ?? '—'
              : uncaptured
              // Deliberately neutral about why. No crop and no text means the
              // bbox has no region — the student left it blank, or the box was
              // never drawn. The dashboard cannot tell those apart, so it does
              // not pick one.
              ? 'Nothing was scanned for these questions, so there is no diagnosis.'
              : '—',
            col2Tooltip: c.easyMarks
              ? `${fmtMarks(c.easyMarks)} marks were lost on ${c.easyQuestions ?? 0} question${(c.easyQuestions ?? 0) === 1 ? '' : 's'}` +
                ` that the whole grade already scores at least 70% of the marks on, on average — the fastest marks to recover.`
              : undefined,
          }
        })
        .sort((a, b) => b.sort - a.sort)
    : scoringItemsHardcoded

  // Nothing on this page's error-classification surfaces renders for a student
  // whose answers have not been classified: no rows, and no empty shells
  // either.
  // Sections that have not been through a heron run keep behaving
  // exactly as they did before this data existed.
  const hasOwnErrorData = !examCtx || faultedAnswers.length > 0

  const ERROR_TYPE_COLORS = ['#16a34a', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#64748b', '#ec4899']
  const UNCODED_COLOR = '#94a3b8'
  const colorForType = (type: string | null) => {
    if (!type) return UNCODED_COLOR
    const known = Array.from(new Set(codedAnswers.map((a) => a.errorTypeName).filter(Boolean) as string[]))
    const at = known.indexOf(type)
    return at < 0 ? UNCODED_COLOR : ERROR_TYPE_COLORS[at % ERROR_TYPE_COLORS.length]
  }

  /**
   * One row per answer of this student's that the run faulted, worst first.
   * Per answer rather than per error type, because that is the grain the
   * diagnosis is written at: `what_went_wrong` describes ONE answer, so
   * grouping several under a single type would attach one answer's sentence to
   * the others.
   *
   * The "Seen in" chip is now the student's actual question, not a candidate
   * set — this is their answer, on that question, with that diagnosis.
   */
  const mistakes: MistakeItem[] = examCtx
    ? codedAnswers.map((a, i) => ({
        id: `a${i}`,
        color: colorForType(a.errorTypeName),
        // The taxonomy label when there is one. When there is not, say so:
        // the model faulted the answer and no code fitted, which is a fact
        // about the taxonomy worth surfacing rather than hiding.
        title: a.errorLabel ?? studentErrorTypeTitle(a.errorTypeName as string),
        description: a.whatWentWrong ?? '',
        questions: [`Q${qKey(a.questionNumber)}`],
        example: null,
        evidences: [],
      }))
    : mistakesHardcoded

  /** The single answer behind a mistake row — this student's own work on it. */
  function ownAnswerFor(item: MistakeItem): StudentEvidence[] {
    const a = codedAnswers[Number(item.id.replace(/^a/, ''))]
    if (!a?.croppedImageUrl) return []
    return [{
      id: 1,
      name: studentName,
      initials: initialsOf(studentName),
      questionNumber: `Q${qKey(a.questionNumber)}`,
      marksLost: marksLostLabel(a.marks, a.maxMarks),
      chapter: chapterOfAnswer(a) ?? '—',
      goingWrong: a.whatWentWrong ?? '',
      nextPractise: practiseFor(a.errorTypeName) ?? '—',
      imageUrl: a.croppedImageUrl,
    }]
  }
  /**
   * This student's own answers in a chapter, for the row's View button —
   * worst first, and ONLY the ones where they lost marks.
   *
   * It used to include every scanned answer in the chapter, on the reasoning
   * that hiding View for a chapter with no losses looks broken. In a table
   * called "Scoring marks left on the table" that put full-marks answers in
   * the evidence: Q5 scored 1 of 1, listed under a chapter's lost marks and
   * captioned with the chapter's dominant error type. There is no mark to
   * recover on an answer that scored full, so it does not belong in either
   * drawer. A chapter with nothing lost simply has no View — which is what
   * `canOpenRow` is for.
   *
   * Each answer carries its OWN diagnosis where the run classified it, so the
   * drawer explains that answer rather than repeating the chapter's headline
   * on every crop. Answers the run never classified fall back to the row's
   * text, which is still true of the chapter.
   */
  function ownAnswersForChapter(row: TopicRow): StudentEvidence[] {
    const qs = questionsByChapter.get(row.topic)
    if (!qs?.size) return []
    const diagnosisFor = (n: number) =>
      faultedAnswers.find((a) => Math.trunc(a.questionNumber) === n) ?? null
    // One entry per WHOLE question. A question with sub-parts has a crop row
    // per part plus a parent row, all pointing at the same image, so paging
    // over the raw rows showed the same answer three times.
    //
    // MCQs are outside error-classification scope (fix/evidence-exclude-mcq):
    // a bare option letter has nothing to diagnose, so diagnosisFor(n) always
    // misses for one and the code below falls back to the chapter's dominant
    // error — presented beside that student's own answer as a diagnosis of
    // it, which nobody made. Excluded only when the paper positively types
    // the question MCQ; an unknown/missing type stays in.
    const byQuestion = new Map<number, AnswerCrop>()
    for (const c of ownCrops) {
      if (c.questionNumber == null || !c.croppedImageUrl) continue
      if ((c.questionType ?? '').toUpperCase() === 'MCQ') continue
      const n = Math.trunc(c.questionNumber)
      if (!qs.has(n) || !byQuestion.has(n)) byQuestion.set(n, c)
    }
    return Array.from(byQuestion.keys())
      .filter((n) => qs.has(n))
      .map((n) => ({ n, got: gotByQuestion.get(n), max: wholeMaxByQuestion.get(n) }))
      .filter((x) => x.got != null && x.max != null && x.max - x.got > 0)
      .sort((a, b) => (b.max! - b.got!) - (a.max! - a.got!))
      .map(({ n, got, max }, i) => {
        const own = diagnosisFor(n)
        return {
          id: i + 1,
          name: studentName,
          initials: initialsOf(studentName),
          questionNumber: `Q${n}`,
          marksLost: marksLostLabel(got as number, max as number),
          chapter: row.topic,
          goingWrong: own?.whatWentWrong || row.whatGoingWrong,
          nextPractise: (own ? practiseFor(own.errorTypeName) : null) ?? row.whatToPractise,
          imageUrl: byQuestion.get(n)!.croppedImageUrl,
        }
      })
  }

  // The bar is this student's real mix of error types, counted over their own
  // faulted answers. It used to split the rows on `i % 2` into "Foundational
  // gaps" and "Mistakes in steps" — alternate-row striping presented as a
  // diagnosis.
  const mistakeLegend = examCtx
    ? (() => {
        const acc = new Map<string, number>()
        for (const a of codedAnswers) {
          const key = a.errorTypeName as string
          acc.set(key, (acc.get(key) ?? 0) + 1)
        }
        return Array.from(acc, ([label, value]) => ({
          label: studentErrorTypeLabel(label),
          color: colorForType(label),
          value,
        })).sort((a, b) => b.value - a.value)
      })()
    : mistakeLegendHardcoded
  // Cross-grade provenance needs multi-year runs — no real source yet.
  const compareMistakes = examCtx ? [] : compareMistakesHardcoded

  // Roster navigation, shared by the breadcrumb dropdown and the prev/next
  // stepper below the chart. A roll number that isn't in the roster (deep link)
  // still navigates, just without the class context the crops need.
  function goToStudent(id: string) {
    const target = roster.find((r) => r.rollNumber.toLowerCase() === id)
    if (!target) { router.push(`/student/${id}`); return }
    const p = new URLSearchParams({
      name: target.studentName,
      admission: target.admissionNo ?? '',
      grade: cropCtx.grade,
      section: cropCtx.section,
      subject: cropCtx.subject,
      exam: cropCtx.exam,
    })
    if (examAll) p.set('examAll', 'true')
    router.push(`/student/${id}?${p.toString()}`)
  }

  const studentIndex = roster.findIndex((r) => r.rollNumber.toLowerCase() === studentId)
  const prevStudent = studentIndex > 0 ? roster[studentIndex - 1] : null
  const nextStudent =
    studentIndex >= 0 && studentIndex < roster.length - 1 ? roster[studentIndex + 1] : null

  usePageBreadcrumb(
    <BreadcrumbSwitcher
      parentLabel="Students"
      parentHref="/student"
      activeId={studentId}
      activeLabel={studentName}
      sectionLabel="Students"
      searchable
      searchPlaceholder="Search students..."
      items={roster.length
        ? roster.map((r) => ({ id: r.rollNumber.toLowerCase(), label: r.studentName }))
        : [{ id: studentId, label: studentName }]}
      drilldownEntity="student"
      onSelect={goToStudent}
    />,
    [studentId, studentName, roster.length, examAll]
  )
  const currentStudent = roster.find(
    (r) => r.rollNumber.toLowerCase() === studentId.toLowerCase()
  )

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col">

      {/* ── Scrollable content ── */}
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-6 pb-12 flex justify-center">
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-[1280px] flex flex-col gap-3">

            {/* ── Title row ── */}
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0 whitespace-nowrap">
                <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.144px] text-black flex items-center gap-5">
                  {studentName}
                  {tab === 'performance' &&
                    currentStudent?.totalMarks != null &&
                    currentStudent?.totalMaxMarks != null &&
                    (() => {
                      const percentage =
                        (currentStudent.totalMarks / currentStudent.totalMaxMarks) * 100

                      const marksClass =
                        percentage >= 80
                          ? 'border-green-500 text-green-600'
                          : percentage >= 60
                            ? 'border-orange-500 text-orange-600'
                            : 'border-red-500 text-red-600'

                      return (
                        <span
                          className={`ml-2 rounded-lg border px-3 py-1 text-sm font-medium ${marksClass}`}
                        >
                          {fmtMarks(currentStudent.totalMarks)}/{fmtMarks(currentStudent.totalMaxMarks)}
                        </span>
                      )
                    })()}
                </h1>
                <p className="text-[16px] font-medium leading-6 text-muted-foreground">
                  {studentMeta}
                </p>
              </div>

              {/* Analysis alone is not a choice — the switcher appears with the
                  second tab, so enabling that flag brings it back on its own. */}
              {showPerformanceTab && (
                <Tabs value={tab} onValueChange={(t) => { trackTabKey(t); setTab(t) }}>
                  <TabsList className="h-auto group-data-[orientation=horizontal]/tabs:h-auto bg-secondary p-1 rounded-md gap-0">
                    <TabsTrigger value="analysis" className="h-auto px-3 py-2 rounded-sm text-base font-medium leading-6 data-[state=active]:bg-background data-[state=active]:shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
                      Analysis
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="h-auto px-3 py-2 rounded-sm text-base font-medium leading-6 data-[state=active]:bg-background data-[state=active]:shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
                      Answer Paper
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>

            {activeTab === 'analysis' && <>

            {/* ── Status + Chart ── */}
            <StatusChartCard
              statusLabel="Summary"
              loading={analysisLoading}
              status={hasRealCtx ? 'No analysis yet' : student.status}
              statusDescription={hasRealCtx ? 'Analysis for this view appears once generated.' : student.statusDescription}
              chartTabs={realTabs ?? (hasRealCtx ? loadingTabs : chartTabs)}
            />

            <PrevNextNav
              className="mt-4"
              showLabels
              drilldownEntity="student"
              itemLabel="student"
              current={(studentIndex < 0 ? 0 : studentIndex) + 1}
              total={roster.length}
              prevTooltip={prevStudent?.studentName}
              nextTooltip={nextStudent?.studentName}
              onPrev={prevStudent && (() => goToStudent(prevStudent.rollNumber.toLowerCase()))}
              onNext={nextStudent && (() => goToStudent(nextStudent.rollNumber.toLowerCase()))}
            />

            {/* ── How to recover marks — gated by show_remediation_table_student_page (beaver#566/#575, title included) ── */}
            {showRemediationTable && hasOwnErrorData && <>
            <div className="flex flex-col gap-6 mt-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-[20px] font-medium leading-7 tracking-[-0.12px] text-foreground whitespace-nowrap">
                  How to recover marks
                </h2>
              </div>

            </div>

            <TopicTable
              title="Scoring marks left on the table"
              subtitle="Practice-first opportunities that can recover marks quickly."
              col2Label="Easy marks lost"
              col2Width="w-[160px]"
              showDot
              countLabel="Question"
              canOpenRow={(row) => ownAnswersForChapter(row).length > 0}
              onView={(row) => setDrawer({
                topic: row.topic,
                subtitle: `${studentName} · ${row.col2Value} easy marks lost in this chapter`,
                students: ownAnswersForChapter(row),
              })}
              rows={scoringItems.map((item) => ({
                id: item.id,
                topic: item.chapter,
                studentCount: item.students,
                col2Value: item.mark,
                col2Tooltip: 'col2Tooltip' in item ? item.col2Tooltip : undefined,
                whatGoingWrong: item.goingWrong,
                whatToPractise: item.toPractise,
              }))}
            />

            </>}

            {/* ── Common mistakes ── */}
            {showCommonMistakes && hasOwnErrorData && (
            <CommonMistakesSection
              className="mt-4"
              tabs={[
                { key: 'mistakes', label: 'Mistakes', legend: mistakeLegend, items: mistakes },
                // Needs a second exam to compare against — visible, not selectable.
                { key: 'compare', label: 'Compare across exams', disabled: true, legend: compareLegend, items: compareMistakes },
              ]}
              // Only rows where this student has a scanned answer open, so a
              // row never looks clickable and then does nothing.
              canOpenRow={(item) => ownAnswerFor(item).length > 0}
              onRowClick={(item) => {
                const mine = ownAnswerFor(item)
                if (!mine.length) return
                setDrawer({
                  topic: item.title,
                  subtitle: `${studentName} · ${item.questions?.[0] ?? ''}`,
                  students: mine,
                })
              }}
            />
            )}

            </>}

            {activeTab === 'performance' && <PerformanceTab cropContext={cropCtx} showAnswerScriptFeedback={showAnswerScriptFeedback} />}

          </div>
        </div>
      </main>

      {drawer && (
        <QuestionDrawer
          open={!!drawer}
          onClose={() => setDrawer(null)}
          topic={drawer.topic}
          subtitle={drawer.subtitle}
          students={drawer.students}
        />
      )}
    </div>
  )
}
