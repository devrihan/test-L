'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { fetchCropFilters, fetchCropRoster, fetchExamEvidence, type EvidenceCrop } from '@/app/lib/answer-crops'
import { fetchRemediation, fetchExamInfo, fetchStudentExamSummary, formatExamDate, type Remediation, type ExamInfo, type StudentExamSummary } from '@/app/lib/questions'
import type { AnalyticsFilters } from '@/app/lib/filters'
import { formatExamName, examAcademicYear, matchesAcademicYear } from '@/app/lib/filters'
import { useLoggedInStudent } from '@/app/lib/student-identity'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import {
  ChevronRight, ChevronLeft, ChevronDown,
} from 'lucide-react'
import { SectionAverageCard } from '@/components/section-average-card'
import { TopicTable } from '@/components/topic-table'
import { QuestionDrawer, type StudentEvidence } from '@/components/question-drawer'
import { StudentAnalysisTab } from '@/components/student-analysis-tab'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TopicRow } from '@/components/topic-table'
import { usePageBreadcrumb } from '@/app/lib/breadcrumb'
import { useFeatureFlag } from '@/components/config-provider'
import { classificationEnabledFor, useClassifiedCohorts } from '@/app/lib/classification-scope'
import { practiseFor, practiseWithPrerequisite } from '@/app/lib/remediation-advice'
import { studentErrorTypeLabel } from '@/app/lib/error-type-labels'
import { mistakeTypeColor, mistakeTypeLegend } from '@/app/lib/mistake-type-legend'
import { MistakeTypeLegendBar } from '@/components/common-mistakes-section'
import { fetchStudentAnswerErrors } from '@/app/lib/students'
import { trackTabKey } from '@/app/lib/analytics'
import { useQuestionRefs, type QuestionRef } from '@/app/lib/question-refs'
import { AnswerKeyButton, QuestionPill } from '@/components/question-ref'

// Analytics names for the tabs, keyed by state value — see the Tabs below.
// Whitespace-insensitive subject compare — backend combos sometimes differ
// only in spacing ("BUSINESS STUDIES" vs "BUSINESSSTUDIES").
const normSubject = (s: string) => s.replace(/\s+/g, '').toUpperCase()

// Real evidence for the drawer: this student's own lost-mark answers (the
// backend self-scopes /evidence for a student token), labelled with the
// remediation topic they were opened from.
//
// `diagnoses` is the student's own per-answer classification, by whole question
// number. It used to stamp the ROW's chapter-level headline on every crop —
// "What went wrong: Slip" beside an answer the run never faulted for a slip, or
// never classified at all. Now an answer shows its own diagnosis or nothing:
// the drawer hides the panel for null (same rule as loam#247 on the teacher
// side), and honest silence beats a confident wrong sentence on a child's own
// screen.
function evidenceToStudents(
  ev: EvidenceCrop[],
  row: TopicRow,
  diagnoses?: Map<number, { goingWrong: string | null; nextPractise: string | null }>,
  questions?: Map<number, QuestionRef>,
): StudentEvidence[] {
  return ev.map((e, i) => {
    const name = e.studentName?.trim() || `Roll ${e.rollNumber}`
    const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
    const lost = Math.max(0, (e.maxMarks ?? 0) - (e.marks ?? 0))
    const own = e.questionNumber != null ? diagnoses?.get(Math.trunc(e.questionNumber)) : undefined
    const q = e.questionNumber != null ? questions?.get(Math.trunc(e.questionNumber)) : undefined
    return {
      id: i + 1,
      name,
      initials,
      questionNumber: e.questionNumber != null ? `Q${e.questionNumber}` : '—',
      marksLost: `${lost}/${e.maxMarks ?? 0} marks`,
      chapter: row.topic,
      goingWrong: own?.goingWrong ?? null,
      nextPractise: own?.nextPractise ?? null,
      imageUrl: e.croppedImageUrl ?? undefined,
      questionText: q?.text ?? undefined,
      question: q,
    }
  })
}

function LineChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path fillRule="evenodd" clipRule="evenodd" d="M2.66667 2C2.66667 1.63181 2.36819 1.33333 2 1.33333C1.63181 1.33333 1.33333 1.63181 1.33333 2V14C1.33333 14.3682 1.63181 14.6667 2 14.6667H14C14.3682 14.6667 14.6667 14.3682 14.6667 14C14.6667 13.6318 14.3682 13.3333 14 13.3333H2.66667V2ZM13.1381 5.5286C12.8777 5.26825 12.4556 5.26825 12.1953 5.5286L9.33333 8.39052L7.13807 6.19526C6.87772 5.93491 6.45561 5.93491 6.19526 6.19526L4.19526 8.19526C3.93491 8.45561 3.93491 8.87772 4.19526 9.13807C4.45561 9.39842 4.87772 9.39842 5.13807 9.13807L6.66667 7.60948L8.86193 9.80474C9.12228 10.0651 9.54439 10.0651 9.80474 9.80474L13.1381 6.4714C13.3984 6.21105 13.3984 5.78894 13.1381 5.5286Z" fill="currentColor" />
    </svg>
  )
}

export function StudentExamDetail() {
  // beaver#644 — student-role own exam page; hide the Remediation section.
  const showRemediationTableFlag = useFeatureFlag('show_remediation_student_exam_page')
  const classifiedCohorts = useClassifiedCohorts()
  const showScoringTable = useFeatureFlag('show_scoring_left_table_student_exam_page')
  const showCommonMistakesFlag = useFeatureFlag('show_common_mistakes_student_exam_page')
  const searchParams = useSearchParams()
  const routeParams = useParams<{ examId?: string }>()
  const [tab, setTab] = useState('remediation')
  const [expandedChapter, setExpandedChapter] = useState<string | null>('ch0')
  const chapterRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [patternIndex, setPatternIndex] = useState(1)
  const [studentIndex, setStudentIndex] = useState(1)
  const [drawerRow, setDrawerRow] = useState<TopicRow | null>(null)

  const student = useLoggedInStudent()
  // Persisted cross-page selection (Home/Exams/Chapter dropdowns) — used as a
  // fallback below so a link that's missing query params still resolves to
  // the same context the student already had selected, instead of going undefined.
  const { filters: savedFilters } = useAnalyticsFilters()

  // The exam is already known from the URL PATH itself ([examId]) — read
  // that first so a query string missing `exam` still resolves; grade/
  // section/subject fall back to the student's own identity and the
  // already-selected analytics filters rather than going undefined and
  // silently breaking downstream features (e.g. the chapter table's
  // navigate-vs-drawer behaviour).
  const examCtx: AnalyticsFilters | undefined = (() => {
    const exam = searchParams.get('exam') ?? (routeParams.examId ? decodeURIComponent(routeParams.examId) : '')
    if (!exam) return undefined
    const grade = searchParams.get('grade') ?? student?.grade ?? savedFilters?.grade
    const section = searchParams.get('section') ?? student?.section ?? savedFilters?.section
    const subject = searchParams.get('subject') ?? savedFilters?.subject
    if (!grade || !section || !subject) return undefined
    return { grade, section, subject, exam }
  })()
  // The paper's questions: every scanned answer shown here names its question
  // (hover: the text) and offers the answer key beside it.
  const questionRefs = useQuestionRefs(examCtx ? { grade: examCtx.grade, subject: examCtx.subject, exam: examCtx.exam } : null)

  // Header loading (beaver#786). Score, date and the summary copy all start
  // absent, and the card prints '—' for "not marked yet" — so while the fetches
  // are out the student is told their paper is unmarked. Two keys because the
  // exam-info fetch is class-scoped while the summary/score are per-student.
  const classificationOn = classificationEnabledFor(classifiedCohorts, examCtx?.grade, examCtx?.subject)
  const showRemediationTable = showRemediationTableFlag && classificationOn
  const showCommonMistakes = showCommonMistakesFlag && classificationOn
  const ctxKey = examCtx ? [examCtx.grade, examCtx.section, examCtx.subject, examCtx.exam].join('|') : null
  const studentKey = ctxKey ? `${ctxKey}|${student?.admissionNo?.trim() ?? ''}` : null
  const [infoLoadedFor, setInfoLoadedFor] = useState<string | null>(null)
  const [summaryLoadedFor, setSummaryLoadedFor] = useState<string | null>(null)
  const [scoreLoadedFor, setScoreLoadedFor] = useState<string | null>(null)
  const headerLoading =
    ctxKey !== null &&
    (infoLoadedFor !== ctxKey || summaryLoadedFor !== studentKey || scoreLoadedFor !== studentKey)

  const [rem, setRem] = useState<Remediation | null>(null)
  const [info, setInfo] = useState<ExamInfo | null>(null)
  useEffect(() => {
    if (!examCtx) { setRem(null); setInfo(null); return }
    let ignore = false
    const key = [examCtx.grade, examCtx.section, examCtx.subject, examCtx.exam].join('|')
    // Tagged result (beaver#831). This page's remediation blocks degrade to
    // their empty states on failure rather than showing an error — a student's
    // own page should not surface a retry control for a class-level rollup —
    // but the failure is still logged with context by fetchRemediation.
    const remDone = fetchRemediation(examCtx).then((r) => { if (!ignore) setRem(r.ok ? r.data : null) })
    const infoDone = fetchExamInfo(examCtx).then((i) => { if (!ignore) setInfo(i) })
    // Settled: a failed fetch must still end the loading state, and neither
    // call had a rejection handler before this.
    void Promise.allSettled([remDone, infoDone]).then(() => { if (!ignore) setInfoLoadedFor(key) })
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject])

  // The logged-in student's own pre-computed Summary-card copy for this exam
  // (student_exam_summary, self-scoped by admissionNo). Falls back to the
  // per-paper exam-info copy, then a neutral message, when absent.
  const [examSummary, setExamSummary] = useState<StudentExamSummary | null>(null)
  useEffect(() => {
    if (!examCtx || !student) { setExamSummary(null); setSummaryLoadedFor(studentKey); return }
    let ignore = false
    const key = `${[examCtx.grade, examCtx.section, examCtx.subject, examCtx.exam].join('|')}|${student.admissionNo.trim()}`
    fetchStudentExamSummary({ ...examCtx, admissionNo: student.admissionNo.trim() })
      .then((s) => { if (!ignore) { setExamSummary(s); setSummaryLoadedFor(key) } })
      .catch(() => { if (!ignore) setSummaryLoadedFor(key) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject, student?.admissionNo])

  // The logged-in student's own marks on this exam (Score card), plus their
  // previous exam of the same cohort/subject for the comparison line.
  const [score, setScore] = useState<{ marks: number; max: number } | null>(null)
  const [prev, setPrev] = useState<{ exam: string; pct: number } | null>(null)
  useEffect(() => {
    if (!examCtx || !student) { setScore(null); setPrev(null); setScoreLoadedFor(studentKey); return }
    let ignore = false
    const admissionNo = student.admissionNo.trim()
    const key = `${[examCtx.grade, examCtx.section, examCtx.subject, examCtx.exam].join('|')}|${admissionNo}`
    // marked papers only — an unmarked scan must not read as a zero
    const myScore = async (exam: string): Promise<{ marks: number; max: number; pct: number } | null> => {
      // Self-scoped roster (access policy): a student token only gets its own row.
      const rows = await fetchCropRoster({ grade: examCtx.grade, section: examCtx.section, subject: examCtx.subject, exam, admissionNo }).catch(() => [])
      const mine = rows.find((r) => (r.admissionNo ?? '').trim() === admissionNo)
      if (!mine || mine.totalMarks == null || (mine.totalMaxMarks ?? 0) <= 0) return null
      const max = mine.totalMaxMarks as number
      return { marks: mine.totalMarks, max, pct: (100 * mine.totalMarks) / max }
    }
    myScore(examCtx.exam)
      .then((s) => { if (!ignore) { setScore(s ? { marks: s.marks, max: s.max } : null); setScoreLoadedFor(key) } })
      .catch(() => { if (!ignore) setScoreLoadedFor(key) })
    // previous exam by date among this cohort+subject's exams (same academic year)
    ;(async () => {
      const combos = await fetchCropFilters().catch(() => [])
      const year = examAcademicYear(examCtx.exam) ?? undefined
      const exams = Array.from(new Set(
        combos
          .filter((c) =>
            c.grade === examCtx.grade &&
            normSubject(c.subject) === normSubject(examCtx.subject) &&
            c.section === examCtx.section &&
            matchesAcademicYear(c.exam, year))
          .map((c) => c.exam),
      )).filter((e) => e !== examCtx.exam)
      const dated = (await Promise.all(exams.map(async (e) => {
        const i = await fetchExamInfo({ ...examCtx, exam: e }).catch(() => null)
        return i?.examDate ? { exam: e, date: i.examDate } : null
      }))).filter((x): x is { exam: string; date: string } => x !== null)
      const curInfo = await fetchExamInfo(examCtx).catch(() => null)
      const before = dated
        .filter((x) => !curInfo?.examDate || x.date < curInfo.examDate)
        .sort((a, b) => b.date.localeCompare(a.date))
      for (const cand of before) {
        const p = await myScore(cand.exam)
        if (p) { if (!ignore) setPrev({ exam: cand.exam, pct: p.pct }); return }
      }
      if (!ignore) setPrev(null)
    })()
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject, student?.admissionNo])

  // Real lost-marks evidence (scanned crops) for the drawer — fetched for the
  // CHAPTER whose row was opened, exactly like the teacher page. It used to be
  // fetched once for the whole exam and handed to every chapter's drawer, so
  // each drawer showed the paper's biggest losses whatever chapter they came
  // from, with the row's chapter stamped on them: a Determinants Q19 rendered
  // under "Chapter: Inverse Trigonometric Functions" (JOHANN S VARGHESE,
  // 2026-08-13). The backend's chapter filter exists for precisely this.
  const [evidence, setEvidence] = useState<EvidenceCrop[]>([])
  useEffect(() => {
    if (!examCtx || !drawerRow) { setEvidence([]); return }
    let ignore = false
    fetchExamEvidence(examCtx, drawerRow.topic).then((e) => { if (!ignore) setEvidence(e) })
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject, drawerRow?.topic])

  // This student's own per-answer diagnoses, by whole question number, for the
  // drawer. `clean` is dropped (the run looked, found nothing wrong — nothing
  // to say); `uncoded_error` kept (real diagnosis, no taxonomy code). Sub-part
  // diagnoses (18.1, 18.2) are joined per whole question, not truncated. Empty
  // for an unclassified section — the drawer then shows the crop alone.
  const [ownDiagnoses, setOwnDiagnoses] = useState<Map<number, { goingWrong: string | null; nextPractise: string | null }>>(new Map())
  useEffect(() => {
    if (!examCtx || !student?.admissionNo) { setOwnDiagnoses(new Map()); return }
    let ignore = false
    fetchStudentAnswerErrors(examCtx, { roll: student.rollNumber != null ? String(student.rollNumber) : null, admissionNo: student.admissionNo })
      .then((errors) => {
        if (ignore) return
        const byNum = new Map<number, { texts: string[]; practise: string | null }>()
        for (const e of errors) {
          if (e.verdict === 'clean') continue
          const n = Math.trunc(e.questionNumber)
          const cur = byNum.get(n) ?? { texts: [], practise: null }
          const t = e.whatWentWrong?.trim()
          if (t && !cur.texts.includes(t)) cur.texts.push(/[.!?]$/.test(t) ? t : `${t}.`)
          cur.practise = cur.practise ?? practiseFor(e.errorTypeName)
          byNum.set(n, cur)
        }
        setOwnDiagnoses(new Map(Array.from(byNum, ([n, v]) => [n, {
          goingWrong: v.texts.length ? v.texts.join(' ') : null,
          nextPractise: v.practise,
        }])))
      })
      .catch(() => { if (!ignore) setOwnDiagnoses(new Map()) })
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject, student?.admissionNo])

  // Spec (Student Login Metrics — Single Exam Page): absolute score out of the
  // exam max, percentage below it, and the change vs the previous exam in
  // percentage points — blank if this is the student's first exam.
  const examMax = info?.maxMarks && info.maxMarks > 0 ? info.maxMarks : score?.max ?? null
  const pctNow = score && examMax ? Math.round((1000 * score.marks) / examMax) / 10 : null
  const comparisonLabel = (() => {
    if (pctNow == null || !prev) return '' // first exam (or nothing comparable): no comparison
    const diff = Math.round((pctNow - prev.pct) * 100) / 100
    return `${diff >= 0 ? '+' : ''}${diff}% from ${formatExamName(prev.exam)}`
  })()

  const exam = {
    name: examCtx ? `${examCtx.subject} ${formatExamName(examCtx.exam)}` : '—',
    date: (examCtx && formatExamDate(info?.examDate)) || '—',
    marks: examCtx && info?.maxMarks ? Math.round(info.maxMarks) : null,
  }

  usePageBreadcrumb(
    <div className="flex items-center gap-1.5">
      <Link href="/exams" className="text-muted-foreground hover:text-foreground transition-colors">
        Exams
      </Link>
      <ChevronRight className="size-4 text-muted-foreground" />
      <span className="text-foreground">{exam.name}</span>
    </div>,
    [exam.name]
  )

  // No mock fallbacks on the student page — without real analytics the
  // sections are simply empty (hardcoded content must never render here).
  // These two cards printed `errorCount` — the number of error OCCURRENCES —
  // in both the students column and the marks column, so a row read
  // "53 Students / 53 marks" where neither figure was a mark nor a student
  // count. The teacher page was moved onto the real figures; this is the same
  // pair of cards on the student view, and it was left behind.
  const fmt = (n: number) => String(Math.round(n * 10) / 10)
  // Empty chapters means the section has no classification data yet, not that
  // there is nothing to remediate — hide the block instead of heading two
  // empty tables.
  const hasRemediation = (rem?.chapters?.length ?? 0) > 0
  const scoringItems = (rem?.chapters ?? [])
    .filter((c) => (c.easyMarks ?? 0) > 0)
    .map((c, i) => ({
      id: i + 1, chapter: c.chapter ?? '—', students: c.easyStudents ?? 0,
      mark: c.easyMarks ? fmt(c.easyMarks) : '—', sort: c.easyMarks ?? 0,
      goingWrong: c.dominantError ? `Most errors: ${studentErrorTypeLabel(c.dominantError)}` : '—',
      toPractise: practiseFor(c.dominantError) ?? '—',
      col2Tooltip: c.easyMarks
        ? `${fmt(c.easyMarks)} marks were lost on ${c.easyQuestions ?? 0} question${(c.easyQuestions ?? 0) === 1 ? '' : 's'}` +
          ` that the whole grade already scores at least 70% of the marks on, on average — the fastest marks to recover.`
        : undefined,
    }))
    .sort((a, b) => b.sort - a.sort)
  // "5.5/6" rather than a bare 5.5: next to the drawer's per-question "3/4" a
  // lone number read like a score (beaver#921). An older API without
  // marksAvailable keeps the bare figure. The type name is translated for the
  // student — "Procedural-Background" is taxonomy jargon (error-type-labels.ts).
  const distributionItems = (rem?.chapters ?? []).map((c, i) => ({
    id: i + 1, chapter: c.chapter ?? '—', students: c.studentsAffected ?? 0,
    mark: c.marksLost == null ? '—'
      : c.marksAvailable ? `${fmt(c.marksLost)}/${fmt(c.marksAvailable)}` : fmt(c.marksLost),
    goingWrong: c.dominantError ? studentErrorTypeLabel(c.dominantError) : '—',
    // Names the earlier-class skill when the student's own mistakes here map
    // to one (beaver#921 item 3); otherwise the usual line for the type.
    toPractise: practiseWithPrerequisite(c.dominantError, c.prerequisite) ?? '—',
  }))
  // Coloured by KIND of mistake (errorTypeName, null → 'Other'), with the
  // same fixed colours and legend bar as Home and the chapter page. This
  // card used to draw every chapter with the same grey dot and no bar.
  const mistakeItems = (rem?.mistakes ?? []).map((m, i) => ({ id: `cm${i}`, question: m.questionNumber != null ? questionRefs.get(Math.trunc(m.questionNumber)) : undefined, errorTypeName: m.errorTypeName ?? null, color: mistakeTypeColor(m.errorTypeName), chapter: m.chapter ?? '—', descriptor: m.pattern, marksLost: m.count, students: m.count, example: { student: m.evidenceStudent ?? '', earned: m.evidenceMarks ?? 0, total: m.evidenceMaxMarks ?? 0, description: m.description, count: m.count, image: m.evidenceImageUrl, evidences: m.evidences ?? [] } }))

  // One accordion row per CHAPTER, not per mistake pattern — a chapter with
  // several patterns used to print its own name as the bold title on every
  // one of them (beaver: "Accounting for Partnership Firms" three times in a
  // row), which reads as duplicate/broken rather than three real mistakes in
  // one chapter. Order follows the backend's qcm.count DESC (first-seen chapter
  // wins the group's position); patterns stay in that order within the group.
  const chapterGroups = (() => {
    const order: string[] = []
    const byChapter = new Map<string, typeof mistakeItems>()
    for (const item of mistakeItems) {
      if (!byChapter.has(item.chapter)) { byChapter.set(item.chapter, []); order.push(item.chapter) }
      byChapter.get(item.chapter)!.push(item)
    }
    return order.map((chapter, i) => ({ id: `ch${i}`, chapter, items: byChapter.get(chapter)! }))
  })()

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">

      {/* ── Scrollable content ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-6 pb-12 ">
         <div className="bg-background p-6 border rounded-2xl">
          {/* ── Title row — plain text, no card border ──────────────────── */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold font-['Inter'] leading-8 tracking-[-0.132px] text-foreground">{exam.name}</h1>
              <p className=" leading-6 text-muted-foreground text-base font-medium font-['Inter']">
                {headerLoading ? 'Loading…' : `${exam.date}${exam.marks != null ? ` · ${exam.marks} marks` : ''}`}
              </p>
            </div>
            {/* Label, not the state key: this tab reads "Summary" on screen
                but its value is "remediation". */}
            <Tabs value={tab} onValueChange={(t) => { trackTabKey(t); setTab(t) }}>
              <TabsList className="h-auto group-data-[orientation=horizontal]/tabs:h-auto bg-secondary p-1 rounded-md gap-0 w-60">
                <TabsTrigger value="remediation" className="flex-1 px-3 py-2 rounded-sm text-base font-medium leading-6 text-muted-foreground data-[state=active]:bg-background data-[state=active]:shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] data-[state=active]:text-foreground">
                  Summary
                </TabsTrigger>
                <TabsTrigger value="analysis" className="flex-1 px-3 py-2 rounded-sm text-base font-medium leading-6 text-muted-foreground data-[state=active]:bg-background data-[state=active]:shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] data-[state=active]:text-foreground">
                  Analysis
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* ── Analysis tab content ─────────────────────────────────────── */}
          {tab === 'analysis' && <StudentAnalysisTab examCtx={examCtx} />}

          {/* ── Remediation-only content ─────────────────────────────────── */}
          {tab === 'remediation' && <>

          {/* ── Stats — two separate cards: SectionAverageCard + description ── */}
          <div className="mt-4 flex gap-4">
            {/* Score card — the student's own marks out of the exam max (spec:
                [Student Score]/[Exam Max Marks]), percentage + change vs the
                previous exam below; '—' until their paper is marked. */}
            <SectionAverageCard
              label="Score"
              loading={headerLoading}
              value={score && examMax ? `${score.marks}/${Math.round(examMax)}` : '—'}
              suffix=""
              trendValue={pctNow != null ? `${pctNow}%` : ''}
              trendLabel={comparisonLabel}
              variant={pctNow == null || pctNow >= 60 ? 'good' : pctNow >= 40 ? 'warning' : 'danger'}
              className="w-[285px] shrink-0"
            />

            {/* Description / alert card — AI summary fields off the exam
                (exam_summary_title / exam_summary_description), neutral
                fallback while they're unpopulated. */}
            <div className="flex-1 border border-border rounded-xl bg-card px-6 py-4">
              {/* Holding the neutral fallback back until we know whether this
                  student has their own summary — otherwise they read the
                  generic line and then watch it be replaced. */}
              {headerLoading ? (
                <p role="status" className="text-base font-normal leading-6 text-muted-foreground">
                  Loading…
                </p>
              ) : (
                <>
                  <h2 className="text-2xl font-medium leading-8 tracking-[-0.108px] text-foreground">
                    {examSummary?.title ?? info?.examSummaryTitle ?? 'See where your marks went on this exam'}
                  </h2>
                  <p className="text-base font-normal leading-6 text-muted-foreground mt-1">
                    {examSummary?.subtitle ?? info?.examSummaryDescription ??
                      'Question and chapter breakdowns show where you gained and lost marks — open the Analysis tab for the full picture.'}
                  </p>
                </>
              )}
              <div className="mt-3">
                <Button onClick={() => { trackTabKey('analysis'); setTab('analysis') }} className="bg-[var(--inferentics-brand-primary)] hover:bg-[var(--inferentics-brand-primary-hover)] text-white gap-2 h-10 px-5 rounded-md text-[14px] font-medium tracking-[-0.084px]">
                  <LineChartIcon />
                  View personalised analysis
                </Button>
              </div>
            </div>
          </div>

          {/* ── Remediation heading card + scoring/distribution — gated by show_remediation_student_exam_page (beaver#644) ── */}
          {showRemediationTable && hasRemediation && <>
          <div className="mt-6 overflow-hidden bg-card">
            <div className="">
              <div>
                <h3 className="text-xl font-['Inter'] font-semibold leading-7 text-foreground">Remediation</h3>
              </div>
              <div className="mt-3">

              </div>
            </div>
          </div>

          {/* ── Scoring marks — standalone TopicTable card. Hidden while the
              classification coverage is thin: with sparse data the table reads
              as broken rather than helpful (config: flip the flag to bring it
              back once coverage is worth showing). ── */}
          {showScoringTable && (
          <TopicTable
            className="mt-6"
            title="Scoring marks left on the table"
            subtitle="Practice-first opportunities that can recover marks quickly."
            col2Label="Easy marks lost"
            col2Width="w-[160px]"
            countLabel={null}
            showGoingWrong={false}
            showDot
            onView={(row) => setDrawerRow(row)}
            rows={scoringItems.map((item) => ({
              id: item.id,
              topic: item.chapter,
              studentCount: item.students,
              col2Value: item.mark,
              col2Tooltip: item.col2Tooltip,
              whatGoingWrong: item.goingWrong,
              whatToPractise: item.toPractise,
            }))}
          />
          )}

          {/* ── Score distribution — standalone TopicTable card ──────────── */}
          <TopicTable
            className="mt-4"
            title="Score distribution"
            col2Label="Marks lost"
            col2Width="w-[164px]"
            countLabel={null}
            showDot={false}
            onView={(row) => setDrawerRow(row)}
            rows={distributionItems.map((item) => ({
              id: item.id,
              topic: item.chapter,
              studentCount: item.students,
              col2Value: item.mark,
              whatGoingWrong: item.goingWrong,
              whatToPractise: item.toPractise,
            }))}
          />
          </>}

          {/* ── Common mistakes card — gated by show_common_mistakes_student_exam_page.
              The flag is school-wide, so a subject with no error classification
              yet would otherwise render a titled card with nothing in it (the
              same rule the dashboard and chapter pages already apply). ── */}
          {showCommonMistakes && chapterGroups.length > 0 && (
          <div className="mt-4 border border-border rounded-xl overflow-hidden bg-card">
            <div className="px-6 pt-6 pb-4">
              <h3 className="text-xl font-medium leading-7 font-['Inter'] text-foreground">Common mistakes</h3>
              <p className="mt-1 text-[14px] leading-5 text-muted-foreground">
                Common mistakes made across your section. Where your own answer shows one, it appears as the example.
              </p>
              <div className="mt-3">
                <MistakeTypeLegendBar legend={mistakeTypeLegend(mistakeItems)} />
              </div>
            </div>

            {/* Common mistakes accordion — edge-to-edge, one row per CHAPTER.
                A chapter with several mistake patterns used to print its own
                name as the title on every one of them; now one row opens to a
                pattern pager (like the evidence pager below it, one level up)
                so the chapter name appears exactly once. */}
            <div className="border-t border-border divide-y divide-border overflow-hidden">
              {chapterGroups.map((group) => {
                const isOpen = expandedChapter === group.id
                const item = group.items[Math.min(patternIndex, group.items.length) - 1]
                const totalAnswers = group.items.reduce((sum, x) => sum + x.students, 0)
                return (
                  <div
                    key={group.id}
                    ref={(el) => {
                      chapterRefs.current[group.id] = el
                    }}
                  >
                    <div
                      className="px-4 py-[22px] flex items-start justify-between gap-4 cursor-pointer"
                      onClick={() => {
                        const willOpen = !isOpen

                        setExpandedChapter(willOpen ? group.id : null)
                        setPatternIndex(1)
                        setStudentIndex(1)

                        if (willOpen) {
                          setTimeout(() => {
                            const element = chapterRefs.current[group.id]

                            if (!element) return

                            element.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            })
                          }, 100)
                        }
                      }}
                    >
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        {/* One dot per kind present in this chapter's patterns
                            — the group folds by chapter, the legend is by kind. */}
                        <div className="flex items-center gap-[3px] shrink-0 mt-[7px]">
                          {Array.from(new Set(group.items.map((x) => x.color))).map((c) => (
                            <div key={c} className="size-3 rounded-[4px] shrink-0" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-semibold leading-7 text-foreground">
                            {group.chapter}
                            {group.items.length > 1 && (
                              <span className="ml-1.5 text-muted-foreground font-normal">({group.items.length})</span>
                            )}
                          </p>
                          <p className="text-base font-normal leading-6 text-muted-foreground">
                            {group.items.length} mistake{group.items.length === 1 ? '' : 's'} · {totalAnswers} answers
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          className="p-1 rounded-md text-muted-foreground hover:bg-accent transition-colors"
                        >
                          <ChevronDown className={`size-5 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                        </button>
                      </div>
                    </div>

                    {/* Pattern pager — only shown when the chapter has more
                        than one mistake pattern to page through. */}
                    {isOpen && group.items.length > 1 && (
                      <div className="px-4 pb-2 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-[6px] min-w-0">
                          <div className="size-3 rounded-[4px] shrink-0" style={{ backgroundColor: item.color }} />
                          <p className="text-[14px] leading-5 text-foreground font-medium min-w-0 truncate">{item.descriptor}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => { setPatternIndex((i) => Math.max(1, i - 1)); setStudentIndex(1) }}
                            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                          >
                            <ChevronLeft className="size-4" />
                          </button>
                          <span className="text-[13px] leading-4 text-muted-foreground">
                            {patternIndex}/{group.items.length}
                          </span>
                          <button
                            onClick={() => { setPatternIndex((i) => Math.min(group.items.length, i + 1)); setStudentIndex(1) }}
                            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                          >
                            <ChevronRight className="size-4" />
                          </button>
                        </div>
                      </div>
                    )}
                    {isOpen && group.items.length === 1 && (
                      <div className="px-4 pb-2 flex items-center gap-[6px]">
                        <div className="size-3 rounded-[4px] shrink-0" style={{ backgroundColor: item.color }} />
                        <p className="text-[14px] leading-5 text-foreground font-medium">{item.descriptor}</p>
                      </div>
                    )}

                    {/* Student tokens get evidence narrowed to their OWN
                        answers by the API (classmates' names and scripts
                        never arrive). A mistake the student did not make
                        carries no evidence — the description alone renders,
                        without the evidence card and pager. */}
                    {isOpen && item.example && !item.example.student && (item.example.evidences?.length ?? 0) === 0 && (
                      <div className="px-4 pb-4">
                        <p className="text-[13px] leading-5 text-muted-foreground border border-border rounded-xl p-4">
                          {item.example.description}
                        </p>
                      </div>
                    )}
                    {isOpen && item.example && (item.example.student || (item.example.evidences?.length ?? 0) > 0) && (
                      <div className="px-4 pb-4">
                        <div className="border border-border rounded-xl overflow-hidden">
                          <div className="flex">
                            {(() => {
                              const evs = 'evidences' in item.example ? item.example.evidences : []
                              const ev = evs[Math.min(studentIndex, Math.max(1, evs.length)) - 1]
                              const shownStudent = ev?.student ?? item.example.student
                              const shownEarned = ev ? ev.marks ?? 0 : item.example.earned
                              const shownTotal = ev ? ev.maxMarks ?? 0 : item.example.total
                              const shownImage = ev?.imageUrl ?? ('image' in item.example ? item.example.image : undefined)
                              return (
                                <>
                            <div className="flex-1 p-4 flex flex-col gap-1.5 border-r border-border min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                {item.question && <QuestionPill question={item.question} />}
                                <p className="flex-1 text-[15px] font-semibold leading-6 text-foreground">{shownStudent}</p>
                                <p className="text-[13px] font-medium text-orange-500 shrink-0">
                                  {shownEarned}/{shownTotal} marks
                                </p>
                              </div>
                              <p className="text-[13px] leading-5 text-muted-foreground">{item.example.description}</p>
                            </div>
                            <div className="relative flex-1 bg-amber-50 min-h-[208px] flex items-center justify-center overflow-hidden">
                              {shownImage && item.question && (
                                <AnswerKeyButton question={item.question} className="absolute bottom-3 right-3" />
                              )}
                              {shownImage ? (
                                <img src={shownImage} alt="Student work" className="w-full h-full object-contain bg-[#A9A9A9]" />
                              ) : (
                                <span className="text-[12px] text-muted-foreground">Student work</span>
                              )}
                            </div>
                                </>
                              )
                            })()}
                          </div>
                          <div className="h-16 flex items-center justify-center gap-3 border-t border-border">
                            <button
                              onClick={() => setStudentIndex((i) => Math.max(1, i - 1))}
                              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                            >
                              <ChevronLeft className="size-4" />
                            </button>
                            <span className="text-[13px] leading-4 text-muted-foreground">
                              {studentIndex}/{('evidences' in item.example && item.example.evidences.length) ? item.example.evidences.length : item.example.count}
                            </span>
                            <button
                              onClick={() => setStudentIndex((i) => Math.min(('evidences' in item.example! && item.example!.evidences.length) ? item.example!.evidences.length : item.example!.count, i + 1))}
                              className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                            >
                              <ChevronRight className="size-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

          </div>
          )}{/* end Common mistakes card */}

          </>}{/* end remediation-only content */}

        </div>
        </div>
      </main>

      {/* Question evidence drawer */}
      {drawerRow && (
        <QuestionDrawer
          open={!!drawerRow}
          onClose={() => setDrawerRow(null)}
          topic={drawerRow.topic}
          subtitle={`Recover with practice · ${drawerRow.col2Value} Marks lost · ${drawerRow.studentCount} students`}
          students={examCtx && evidence.length ? evidenceToStudents(evidence, drawerRow, ownDiagnoses, questionRefs) : []}
        />
      )}
    </div>
  )
}
