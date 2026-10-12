'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { fetchCropFilters, fetchCropRoster, fetchExamEvidence, type EvidenceCrop } from '@/app/lib/answer-crops'
import { fetchStudentAnswerErrors, type StudentAnswerError } from '@/app/lib/students'
import { fetchRemediation, fetchExamInfo, fetchExamSectionSummary, fetchPaperQuestions, formatExamDate, type Remediation, type ExamInfo, type ExamSectionSummary } from '@/app/lib/questions'
import type { AnalyticsFilters } from '@/app/lib/filters'
import { formatExamName, examAcademicYear, matchesAcademicYear } from '@/app/lib/filters'
import {
  ChevronRight, ChevronLeft, ChevronDown,
  BookmarkPlus, Maximize2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SectionAverageCard } from '@/components/section-average-card'
import { TopicTable } from '@/components/topic-table'
import { QuestionDrawer, type StudentEvidence } from '@/components/question-drawer'
import { AnalysisTab } from '@/components/analysis-tab'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TopicRow } from '@/components/topic-table'
import { useViewer, ViewerProvider } from '@/app/lib/viewer'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { usePageBreadcrumb } from '@/app/lib/breadcrumb'
import { StudentExamDetail } from '@/components/student-exam-detail'
import { useFeatureFlag, useShowAddToPlan } from '@/components/config-provider'
import { classificationEnabledFor, useClassifiedCohorts } from '@/app/lib/classification-scope'
import { practiseForClass, reteachFor } from '@/app/lib/remediation-advice'
import { mistakeTypeColor, mistakeTypeLegend } from '@/app/lib/mistake-type-legend'
import { MistakeTypeLegendBar } from '@/components/common-mistakes-section'
import { ClassTeachers } from '@/components/class-teachers'
import { useMaySeeClassTeachers } from '@/app/lib/caller-role'
import { leadsClass } from '@/app/lib/senior-scope'
import { fetchClassTeachers, type ClassTeacher } from '@/app/lib/teachers'
import { trackTabKey } from '@/app/lib/analytics'

// ─── data ────────────────────────────────────────────────────────────────────

// Placeholder fallback (overridden with the real exam + class average below).
const examHardcoded = {
  name: 'Mid-term 1',
  date: 'Sep 2, 2025',
  marks: 80,
  sectionAvg: 76,
  trend: '3.1',
  trendLabel: '+0.49% from midterm',
  marksSlipped: 28,
}

const scoringItemsHardcoded = [
  { id: 1, chapter: 'MCQs (Section A)', students: 11, mark: 14, goingWrong: 'Silly mistakes on easy MCQs that most of the class got right.', toPractise: 'Solve MCQs in timed sets; recheck every option before moving on.' },
  { id: 2, chapter: 'Differential Equations', students: 42, mark: 12, goingWrong: 'Knows the method, but is not spotting the standard form.', toPractise: 'Drill variable separable and linear DE sums, NCERT first, then PYQs.' },
  { id: 3, chapter: 'Integration', students: 39, mark: 11, goingWrong: 'Calculation and step slips in attempted sums.', toPractise: 'Practise substitution and by-parts sums from the exact wrong types.' },
  { id: 4, chapter: 'Application of Inte...', students: 40, mark: 7, goingWrong: 'Setup mistake while forming the area under the curve.', toPractise: 'Redo area-under-curve sums; draw the figure before integrating.' },
  { id: 5, chapter: 'Determinants', students: 41, mark: 5, goingWrong: 'Step and calculation mistakes in cofactor and properties.', toPractise: 'Practise cofactor expansion and property-based sums.' },
  { id: 6, chapter: 'Continuity & Differ...', students: 42, mark: 5, goingWrong: 'Skipping method steps and losing step marks.', toPractise: 'Solve while writing every step; practise from NCERT before timed sets.' },
]

const distributionItemsHardcoded = [
  { id: 1, chapter: 'Relations & Functions...', students: 11, mark: 3, goingWrong: 'Silly mistakes on easy MCQs that most of the class got right.', toPractise: 'Solve MCQs in timed sets; recheck every option before moving on.' },
  { id: 2, chapter: 'Continuity & Differen...', students: 42, mark: 1, goingWrong: 'Knows the method, but is not spotting the standard form.', toPractise: 'Drill variable separable and linear DE sums, NCERT first, then PYQs.' },
  { id: 3, chapter: 'Application of Deriva...', students: 39, mark: 4, goingWrong: 'Calculation and step slips in attempted sums.', toPractise: 'Practise substitution and by-parts sums from the exact wrong types.' },
  { id: 4, chapter: 'Vectors - geometrica...', students: 41, mark: 2, goingWrong: 'Step and calculation mistakes in cofactor and properties.', toPractise: 'Practise cofactor expansion and property-based sums.' },
  { id: 5, chapter: '3D Geometry - perpe...', students: 42, mark: 5.5, goingWrong: 'Skipping method steps and losing step marks.', toPractise: 'Solve while writing every step; practise from NCERT before timed sets.' },
]

const mistakeItemsHardcoded = [
  {
    id: 'cm1',
    errorTypeName: 'Procedural-Background' as string | null,
    chapter: 'Application of complementary events',
    descriptor: 'Foundational gaps',
    marksLost: 18,
    students: 11,
    example: {
      student: 'Naina verma',
      earned: 0,
      total: 4,
      description: "Student mistakenly used Bayes' theorem in (ii) where it was a simple question of using complementary events",
      count: 11,
    },
  },
  {
    id: 'cm2',
    errorTypeName: 'Procedural-Background' as string | null,
    chapter: 'Application of complementary events',
    descriptor: 'Foundational gaps',
    marksLost: 18,
    students: 11,
    example: null,
  },
  {
    id: 'cm3',
    errorTypeName: 'Procedural-Syllabus' as string | null,
    chapter: 'Bayes theorem and applications',
    descriptor: 'Mistakes in steps',
    marksLost: 18,
    students: 11,
    example: null,
  },
]

// ─── page ────────────────────────────────────────────────────────────────────

function makeStudents(row: TopicRow): StudentEvidence[] {
  const names = [
    { name: 'Naina Verma', initials: 'NV' },
    { name: 'Aarav Shah', initials: 'AS' },
    { name: 'Priya Iyer', initials: 'PI' },
    { name: 'Kabir Singh', initials: 'KS' },
    { name: 'Ananya Roy', initials: 'AR' },
    { name: 'Rohan Mehta', initials: 'RM' },
    { name: 'Meera Nair', initials: 'MN' },
    { name: 'Dev Patel', initials: 'DP' },
    { name: 'Sanya Gupta', initials: 'SG' },
    { name: 'Arjun Kapoor', initials: 'AK' },
    { name: 'Divya Sharma', initials: 'DS' },
  ]
  return names.slice(0, Math.min(row.studentCount, names.length)).map((n, i) => ({
    id: i + 1,
    name: n.name,
    initials: n.initials,
    questionNumber: `Q${i + 1}`,
    marksLost: `0/${row.col2Value} marks`,
    chapter: row.topic,
    goingWrong: row.whatGoingWrong,
    nextPractise: row.whatToPractise,
  }))
}

// This answer's own diagnosis, from the whole-section classification pull —
// not the chapter's dominant-error headline, which beside a specific child's
// specific answer reads as a diagnosis of THAT answer that nobody made (same
// rule as loam#247 on the student view). Matched by roll number (crops carry
// it as a possibly-zero-padded string; students.roll_number is a clean int)
// and whole question number — sub-parts (18.1, 18.2) share one crop, so
// their diagnoses join into one panel rather than showing only the first.
// A mistake the run never classified (verdict 'clean', or no row at all)
// renders nothing, same honest-silence rule as everywhere else this pattern
// is used.
function diagnosisFor(
  answerErrors: StudentAnswerError[],
  rollNumber: string | null | undefined,
  questionNumber: number | null,
): { goingWrong: string | null; nextPractise: string | null } {
  if (rollNumber == null || questionNumber == null) return { goingWrong: null, nextPractise: null }
  const roll = Number(rollNumber)
  if (Number.isNaN(roll)) return { goingWrong: null, nextPractise: null }
  const matches = answerErrors.filter(
    (a) =>
      a.rollNumber != null &&
      Number(a.rollNumber) === roll &&
      Math.trunc(a.questionNumber) === questionNumber &&
      a.verdict !== 'clean',
  )
  if (matches.length === 0) return { goingWrong: null, nextPractise: null }
  const seen = new Set<string>()
  const parts: string[] = []
  for (const m of matches) {
    const t = m.whatWentWrong?.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    parts.push(/[.!?]$/.test(t) ? t : `${t}.`)
  }
  const nextPractise = matches.map((m) => practiseForClass(m.errorTypeName)).find((p) => p) ?? null
  return { goingWrong: parts.length ? parts.join(' ') : null, nextPractise }
}

// Real evidence for the drawer: actual students who lost marks on this exam
// (scanned crops), labelled with the remediation topic they were opened from.
export function evidenceToStudents(
  ev: EvidenceCrop[],
  row: TopicRow,
  answerErrors: StudentAnswerError[] = [],
  questionText: Map<number, string> = new Map(),
): StudentEvidence[] {
  return ev.map((e, i) => {
    const name = e.studentName?.trim() || `Roll ${e.rollNumber}`
    const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
    const lost = Math.max(0, (e.maxMarks ?? 0) - (e.marks ?? 0))
    const { goingWrong, nextPractise } = diagnosisFor(answerErrors, e.rollNumber, e.questionNumber)
    return {
      id: i + 1,
      name,
      initials,
      questionNumber: e.questionNumber != null ? `Q${e.questionNumber}` : '—',
      questionText: e.questionNumber != null
        ? (questionText.get(e.questionNumber) ?? questionText.get(Math.trunc(e.questionNumber)))
        : undefined,
      // "5/5 marks" under a heading reading "Marks lost" is ambiguous — it is
      // 5 lost out of 5, not 5 scored. Same wording as the student page.
      marksLost: `${lost} of ${e.maxMarks ?? 0} marks lost`,
      chapter: row.topic,
      goingWrong,
      nextPractise,
      imageUrl: e.croppedImageUrl ?? undefined,
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

export default function ExamDetailPage() {
  return (
    <ViewerProvider>
      <ExamDetailDispatch />
    </ViewerProvider>
  )
}

function ExamDetailDispatch() {
  const { activeRole, roleResolved } = useViewer()

  // activeRole falls back to TEACHER until the stored user is read
  // (viewer.tsx roleResolved), so without this gate the TEACHER body mounts
  // for one frame on a student login and fires its class-level fetches —
  // every one a 403 for a student token (console noise + wasted round trips).
  // Render nothing for that frame instead; the resolved role then mounts once.
  if (!roleResolved) return null
  if (activeRole === 'STUDENT') return <StudentExamDetail />
  return <TeacherExamDetail />
}

// Untouched below this line — original teacher exam detail body, just
// renamed from the default export so this file can dispatch on role.
function TeacherExamDetail() {
  // beaver#566/#575 — error-classification-derived; hidden until it's trustworthy.
  const classifiedCohorts = useClassifiedCohorts()
  const showRemediationTableFlag = useFeatureFlag('show_remediation_table_exam_page')
  const showCommonMistakesFlag = useFeatureFlag('show_common_mistakes_exam_page')
  const showAddToPlan = useShowAddToPlan()
  const searchParams = useSearchParams()
  // Classification surfaces show only for cohorts that have classification.
  const classificationOn = classificationEnabledFor(classifiedCohorts, searchParams.get('grade'), searchParams.get('subject'))
  const showRemediationTable = showRemediationTableFlag && classificationOn
  const showCommonMistakes = showCommonMistakesFlag && classificationOn
  // Context from the exam link — lets the Analysis tab show the exam's real
  // questions (paper text + analytics where available).
  const examCtx: AnalyticsFilters | undefined = searchParams.get('exam')
    ? {
      grade: searchParams.get('grade') ?? '',
      section: searchParams.get('section') ?? '',
      subject: searchParams.get('subject') ?? '',
      exam: searchParams.get('exam') ?? '',
    }
    : undefined
  const [tab, setTab] = useState('remediation')

  // Section filter beside the tabs. It writes the section back into the URL
  // rather than holding its own state, because `examCtx` above is derived from
  // the URL — so one router call re-scopes the header, the average card, the
  // section summary, the prev/next nav and the whole Analysis tab at once.
  //
  // replace(), not push(): a filter shouldn't leave a history entry per flick,
  // so Back still returns to the exam list rather than stepping back through
  // every section you looked at.
  const router = useRouter()
  const pathname = usePathname()
  // The sidebar's Chapter/Students/Questions links carry no query params —
  // those pages read the SHARED filter store (useAnalyticsFilters), which
  // this picker historically never wrote. So a teacher who switched to
  // section W here and clicked "Chapter" landed back on the previous
  // section: two section states, and the picker updated only the URL one.
  const { combos, filters: sharedFilters, setFilters: setSharedFilters } = useAnalyticsFilters()
  function changeSection(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('section', next)
    router.replace(`${pathname}?${params.toString()}`)
    // Write the WHOLE exam context, not just the section. The store's exam can
    // be a different exam than this page's (e.g. Midterm chosen on the chapter
    // page): overriding section alone could leave the store on a combo that
    // never sat together, like (W, Midterm). And clear examAll — a teacher who
    // follows this exam into the sidebar expects it pinned, not "All Exams".
    //
    // Deliberately ONLY here, on an explicit picker action. Merely opening a
    // deep-linked exam URL must not clobber the cohort the teacher chose on
    // the list pages — a visit is not an intent.
    if (examCtx) {
      setSharedFilters({
        ...(sharedFilters ?? {}),
        grade: examCtx.grade,
        subject: examCtx.subject,
        exam: examCtx.exam,
        section: next,
        examAll: false,
      })
    }
  }

  // Options: the sections that actually sat THIS exam. Scoping by exam as well
  // as grade+subject matters — offering a section that never sat the paper
  // would switch the page to an empty one.
  const [sectionOptions, setSectionOptions] = useState<string[]>([])
  useEffect(() => {
    if (!examCtx) return
    const { grade, subject, exam } = examCtx
    let ignore = false
    fetchCropFilters()
      .then((combos) => {
        if (ignore) return
        setSectionOptions(
          Array.from(
            new Set(
              combos
                .filter((c) => c.grade === grade && c.subject === subject && c.exam === exam)
                .map((c) => c.section),
            ),
          ).sort(),
        )
      })
      .catch(() => { /* nav still works without the picker */ })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCtx?.grade, examCtx?.subject, examCtx?.exam])

  // Real exam header: name from the link, section average from the class roster.
  const [avg, setAvg] = useState<number | null>(null)
  const [info, setInfo] = useState<ExamInfo | null>(null)
  // per-section AI summary (teacher-only endpoint) — first choice for the
  // headline card, ahead of exam-info's per-paper copy
  const [sectionSummary, setSectionSummary] = useState<ExamSectionSummary | null>(null)
  // previous exam of the cohort (by exam date) for the comparison line
  const [prev, setPrev] = useState<{ exam: string; pct: number } | null>(null)
  // Who takes this class (beaver#806) — appended to the grade/section subtext.
  // Fetched only once the caller's role says it will be shown: the endpoint
  // refuses accounts with no claim to staff rosters, and asking anyway would
  // buy a 403 for something we were never going to render.
  const maySeeTeachers = useMaySeeClassTeachers()
  // Tagged with the class it was fetched for, the same way the header tracks
  // `headerLoadedKey` — a class switch then shows no names rather than the
  // previous class's while the new list is in flight. A null list is a fetch
  // that failed: the roster is then unknown, which renders as nothing, distinct
  // from an empty list, which renders as "Teacher assignment unknown".
  const [teachers, setTeachers] = useState<{ classKey: string; list: ClassTeacher[] | null } | null>(null)
  // `avg == null` means BOTH "still fetching" and "no marked papers yet", and
  // the card renders '—' for both — so a slow network looks exactly like an
  // unmarked exam (beaver#786). Remembering which exam the header data belongs
  // to keeps the two apart, and makes an exam switch read as loading from the
  // first render instead of showing the previous exam's average.
  const headerKey = examCtx ? [examCtx.grade, examCtx.section, examCtx.subject, examCtx.exam].join('|') : null
  const [headerLoadedKey, setHeaderLoadedKey] = useState<string | null>(null)
  const headerLoading = headerKey !== null && headerLoadedKey !== headerKey
  useEffect(() => {
    if (!examCtx) { setAvg(null); setInfo(null); setSectionSummary(null); setPrev(null); return }
    let ignore = false
    const key = [examCtx.grade, examCtx.section, examCtx.subject, examCtx.exam].join('|')
    const sectionAvgPct = async (exam: string): Promise<{ avg: number; pct: number } | null> => {
      const r = await fetchCropRoster({ grade: examCtx.grade, section: examCtx.section, subject: examCtx.subject, exam }).catch(() => [])
      // marked papers only — an unmarked scan must not read as a zero
      const marked = r.filter((x) => x.totalMarks != null && (x.totalMaxMarks ?? 0) > 0)
      if (!marked.length) return null
      const a = marked.reduce((s, x) => s + (x.totalMarks as number), 0) / marked.length
      const max = Math.max(...marked.map((x) => x.totalMaxMarks as number))
      return { avg: a, pct: (100 * a) / max }
    }
    const avgDone = sectionAvgPct(examCtx.exam)
      .then((cur) => { if (!ignore) setAvg(cur ? Math.round(cur.avg * 10) / 10 : null) })
      .catch(() => { })
    const infoDone = fetchExamInfo(examCtx).then((i) => { if (!ignore) setInfo(i) })
    const summaryDone = fetchExamSectionSummary(examCtx).then((s) => { if (!ignore) setSectionSummary(s) })
    // Settled, not resolved: a failed header fetch must still end the loading
    // state, or the card sits on '…' forever instead of the honest '—'.
    void Promise.allSettled([avgDone, infoDone, summaryDone]).then(() => {
      if (!ignore) setHeaderLoadedKey(key)
    })
      // find the previous exam by date among the cohort's exams
      ; (async () => {
        const combos = await fetchCropFilters().catch(() => [])
        // Same academic year only. Filtering by date alone compared this year's
        // unit test against LAST year's annual — a different cohort sitting a
        // different paper. matchesAcademicYear also drops hard-excluded years.
        const thisYear = examAcademicYear(examCtx.exam)
        const inSameYear = (e: string) =>
          matchesAcademicYear(e, thisYear ?? undefined) && examAcademicYear(e) === thisYear
        const exams = Array.from(new Set(
          combos.filter((c) => c.grade === examCtx.grade && c.subject === examCtx.subject && c.section === examCtx.section).map((c) => c.exam),
        )).filter((e) => e !== examCtx.exam && inSameYear(e))
        const dated = (await Promise.all(exams.map(async (e) => {
          const i = await fetchExamInfo({ ...examCtx, exam: e }).catch(() => null)
          return i?.examDate ? { exam: e, date: i.examDate } : null
        }))).filter((x): x is { exam: string; date: string } => x !== null)
        const curInfo = await fetchExamInfo(examCtx).catch(() => null)
        const before = dated
          .filter((x) => !curInfo?.examDate || x.date < curInfo.examDate)
          .sort((a, b) => b.date.localeCompare(a.date))
        for (const cand of before) {
          const p = await sectionAvgPct(cand.exam)
          if (p) { if (!ignore) setPrev({ exam: cand.exam, pct: p.pct }); return }
        }
        if (!ignore) setPrev(null)
      })()
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject])

  // beaver#806 — the class's teachers, keyed on grade/section/subject only:
  // allocation does not vary by exam, so switching exams within a class does
  // not refetch.
  const classKey = examCtx ? [examCtx.grade, examCtx.section, examCtx.subject].join('|') : null
  const classTeachers = teachers && teachers.classKey === classKey ? teachers.list : null
  // Names belong to the classes the viewer leads; a class merely taught shows
  // none, and asking the roster endpoint for it would only buy a 403.
  const leads = !!examCtx && !!combos && leadsClass(combos, examCtx.grade, examCtx.subject, examCtx.section)
  useEffect(() => {
    if (!examCtx || !maySeeTeachers || !leads) return
    let ignore = false
    const { grade, section, subject } = examCtx
    const key = [grade, section, subject].join('|')
    fetchClassTeachers({ grade, section, subject })
      .then((list) => { if (!ignore) setTeachers({ classKey: key, list }) })
      // The subtext is the exam header's, not the roster's — a roster failure
      // must not take it down. A failed fetch leaves the roster unknown (null),
      // not empty: claiming "Teacher assignment unknown" off a network error
      // would state a data gap that may not exist.
      .catch((err) => {
        console.error('[exam] class teachers failed to load — the subtext drops them', err)
        if (!ignore) setTeachers({ classKey: key, list: null })
      })
    return () => { ignore = true }
  }, [examCtx?.grade, examCtx?.section, examCtx?.subject, maySeeTeachers, leads])

  // Spec: percentage under the absolute average; comparison vs previous exam
  const pctNow = avg != null && info?.maxMarks ? Math.round((1000 * avg) / info.maxMarks) / 10 : null
  const comparisonLabel = (() => {
    if (pctNow == null || !prev) return '' // first exam (or nothing comparable): no comparison
    const diff = Math.round((pctNow - prev.pct) * 100) / 100
    return `${diff >= 0 ? '+' : ''}${diff}% from ${formatExamName(prev.exam)}`
  })()
  const exam = {
    ...examHardcoded,
    name: examCtx
      ? `${examCtx.subject} ${formatExamName(examCtx.exam, { year: false })}`
      : examHardcoded.name,
    subtitle: examCtx
      ? `Grade ${examCtx.grade} · Section ${examCtx.section}`
      : `${examHardcoded.date} · ${examHardcoded.marks} marks`,
    sectionAvg: avg ?? examHardcoded.sectionAvg,
  }

  usePageBreadcrumb(
    <div className="flex items-center gap-1.5">
      <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
        Exam
      </Link>
      <ChevronRight className="size-4 text-muted-foreground" />
      <span className="text-foreground">{exam.name}</span>
    </div>,
    [exam.name]
  )

  // Real remediation (per-chapter errors + common mistakes) for this exam. Empty
  // for exams with no analytics — so we never show another exam's data.
  const [rem, setRem] = useState<Remediation | null>(null)
  // Same key trick as the header (beaver#786): `rem == null` means BOTH
  // "still fetching" and "this exam has no remediation", and both render an
  // empty table — so a slow network looks exactly like an exam with no data.
  // Remembering which exam the rows belong to also stops the PREVIOUS exam's
  // rows sitting there while the new fetch runs.
  const [remLoadedKey, setRemLoadedKey] = useState<string | null>(null)
  // A failed fetch is not "no data" (beaver#831). This flag is what separates
  // the two: hiding the block is only honest after a SUCCESSFUL response with
  // zero chapters. On failure the page shows a retryable error instead —
  // `remAttempt` is the retry: bumping it re-runs the effect for the same key.
  const [remFailed, setRemFailed] = useState(false)
  const [remAttempt, setRemAttempt] = useState(0)
  const remLoading = headerKey !== null && remLoadedKey !== headerKey
  useEffect(() => {
    if (!examCtx) { setRem(null); setRemFailed(false); setRemLoadedKey(null); return }
    let ignore = false
    const key = [examCtx.grade, examCtx.section, examCtx.subject, examCtx.exam].join('|')
    // Entering loading again — a stale error from the previous section must not
    // sit beside the new section's skeleton.
    setRemFailed(false)
    fetchRemediation(examCtx)
      .then((r) => {
        if (ignore) return
        setRem(r.ok ? r.data : null)
        setRemFailed(!r.ok)
      })
      // finally, not then: a failed fetch must still end the loading state, or
      // the tables sit on skeletons instead of the honest empty message.
      .finally(() => { if (!ignore) setRemLoadedKey(key) })
    return () => { ignore = true }
    // `section` belongs here — the data is section-scoped and the key includes
    // it, so without it a section switch kept the old section's rows.
  }, [examCtx?.exam, examCtx?.grade, examCtx?.subject, examCtx?.section, remAttempt])

  const tc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  // `errorCount` is the number of error OCCURRENCES. It used to fill BOTH the
  // students column and the marks column, so every row read "53 Students /
  // 53 marks" — the same number twice, and neither of them a mark or a student
  // count. The API now sends the real figures, computed from the scanned marks
  // at whole-question grain for the section on screen.
  const fmt = (n: number) => String(Math.round(n * 10) / 10)
  // The API returns chapters only for a section that has classification data,
  // so an empty list means "not classified yet" — not "nothing to remediate".
  // Hide the whole block rather than render a heading over two empty tables.
  // Gated on the loaded result, not on `remLoading`, so a section without data
  // never flashes a skeleton that then vanishes.
  const hasRemediation = !examCtx || (rem?.chapters?.length ?? 0) > 0
  // "Easy marks" is NOT marksLost. Ranking by marks lost put the chapter the
  // class understands LEAST at the top of a card promising quick wins — on
  // 12 Maths that was Inverse Trigonometric Functions at 164, of which 113
  // marks sit on one question only a quarter of the grade can do. easyMarks
  // counts only the questions the whole grade already scores >=70% of, so the
  // card lists marks this class has shown it can get. Chapters with no such
  // question fall to the bottom showing "—": honest, and it points the teacher
  // at the distribution card below, which still ranks by marks lost.
  const scoringItems = examCtx
    ? (rem?.chapters ?? [])
      // Only chapters with recoverable (grade-easy) marks belong on this
      // card. A chapter whose losses are all on hard questions used to
      // render a "— / 0 students" row that read as broken next to a View
      // drawer full of students — those chapters live on the distribution
      // card below instead.
      .filter((c) => (c.easyMarks ?? 0) > 0)
      .map((c, i) => ({
        id: i + 1, chapter: c.chapter ?? '—',
        students: c.easyStudents ?? 0,
        mark: c.easyMarks ? fmt(c.easyMarks) : '—',
        sort: c.easyMarks ?? 0,
        goingWrong: c.dominantError ? `Most errors: ${tc(c.dominantError)}` : '—',
        toPractise: practiseForClass(c.dominantError) ?? '—',
        col2Tooltip: c.easyMarks
          ? `${fmt(c.easyMarks)} marks were lost by ${c.easyStudents ?? 0} student${(c.easyStudents ?? 0) === 1 ? '' : 's'}` +
          ` on ${c.easyQuestions ?? 0} question${(c.easyQuestions ?? 0) === 1 ? '' : 's'} that the whole grade already` +
          ` scores at least 70% of the marks on, on average — the fastest marks to recover.`
          : undefined,
      }))
      // the API orders by marksLost for the distribution card; this card has
      // its own ranking
      .sort((a, b) => b.sort - a.sort)
    : scoringItemsHardcoded
  const distributionItems = examCtx
    ? (rem?.chapters ?? []).map((c, i) => ({
      id: i + 1, chapter: c.chapter ?? '—',
      students: c.studentsAffected ?? 0,
      mark: c.marksLost != null ? fmt(c.marksLost) : '—',
      goingWrong: c.dominantError ? tc(c.dominantError) : '—',
      toPractise: reteachFor(c.dominantError) ?? '—',
    }))
    : distributionItemsHardcoded
  const mistakeItems = examCtx
    ? (rem?.mistakes ?? []).map((m, i) => ({
      id: `cm${i}`,
      errorTypeName: m.errorTypeName ?? null,
      chapter: m.chapter ?? '—',
      descriptor: m.pattern,
      students: m.count,
      example: { student: m.evidenceStudent ?? '', earned: m.evidenceMarks ?? 0, total: m.evidenceMaxMarks ?? 0, description: m.description, count: m.count, image: m.evidenceImageUrl, evidences: m.evidences ?? [] },
    }))
    : mistakeItemsHardcoded

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table')
  const [expandedMistake, setExpandedMistake] = useState<string | null>('cm0')
  const mistakeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [studentIndex, setStudentIndex] = useState(1)
  const [imageLoading, setImageLoading] = useState(false)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)

  const scrollMistakeToTop = (id: string) => {
    setTimeout(() => {
      const element = mistakeRefs.current[id]

      if (!element) return

      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 100)
  }

  const [drawerRow, setDrawerRow] = useState<TopicRow | null>(null)

  // Real "students who lost marks" evidence (scanned crops) for the drawer,
  // fetched for the chapter whose row was opened. It used to be fetched once
  // for the whole exam and handed to every chapter, so each drawer showed the
  // same 60 answers — the paper's biggest losses, whatever chapter they came
  // from. Opening Matrices and opening Determinants both led with the same
  // student's Q18, which is Inverse Trigonometry.
  const [evidence, setEvidence] = useState<EvidenceCrop[]>([])
  useEffect(() => {
    if (!examCtx || !drawerRow) { setEvidence([]); return }
    let ignore = false
    fetchExamEvidence(examCtx, drawerRow.topic).then((e) => { if (!ignore) setEvidence(e) })
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject, drawerRow?.topic])

  // Every classified answer for the WHOLE section, one call — the real
  // per-answer diagnosis the evidence drawer's "What went wrong"/"Next practise"
  // panels used to leave blank (see evidenceToStudents below). Fetched once
  // for the exam, not per chapter drawer: a section is a few hundred rows at
  // most, so there's no reason to re-fetch it every time a different row's
  // drawer opens.
  const [sectionAnswerErrors, setSectionAnswerErrors] = useState<StudentAnswerError[]>([])
  useEffect(() => {
    if (!examCtx) { setSectionAnswerErrors([]); return }
    let ignore = false
    fetchStudentAnswerErrors(examCtx).then((rows) => { if (!ignore) setSectionAnswerErrors(rows) })
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject])

  const [questionText, setQuestionText] = useState<Map<number, string>>(new Map())
  useEffect(() => {
    if (!examCtx) { setQuestionText(new Map()); return }
    let ignore = false
    fetchPaperQuestions(examCtx)
      .catch(() => [])
      .then((qs) => {
        if (ignore) return
        const m = new Map<number, string>()
        const subParts = new Map<number, string[]>()
        for (const q of [...qs].sort((a, b) => a.questionNumber - b.questionNumber)) {
          if (!q.questionText) continue
          m.set(q.questionNumber, q.questionText)
          const whole = Math.trunc(q.questionNumber)
          if (q.questionNumber === whole) continue
          subParts.set(whole, [...(subParts.get(whole) ?? []), q.questionText])
        }
        for (const [whole, texts] of subParts) {
          if (m.has(whole)) continue
          m.set(whole, texts.length === 1 ? texts[0] : texts.map((t, i) => `${i + 1}. ${t}`).join('\n'))
        }
        setQuestionText(m)
      })
    return () => { ignore = true }
  }, [examCtx?.exam, examCtx?.section, examCtx?.grade, examCtx?.subject])

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
                {/* Grade/section come from the URL, so this line is correct from
                  the first render — it's held back deliberately so the header
                  settles as one block instead of standing filled-in beside two
                  cards that are still loading (beaver#786). */}
                <p className=" leading-6 text-muted-foreground text-base font-medium font-['Inter']">
                  {headerLoading ? 'Loading…' : (
                    <>
                      {exam.subtitle}
                      {/* beaver#806 — the teachers join this same line, behind the
                        same interpunct the grade/section pair already uses. */}
                      <ClassTeachers teachers={classTeachers} leads={leads} leadingSeparator />
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
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

                {/* Only when there's an actual choice — a one-option picker is a
                  dead control (same reasoning as PageFilters' Section rule). */}
                {examCtx && sectionOptions.length > 1 && (
                  <Select value={examCtx.section} onValueChange={changeSection}>
                    <SelectTrigger className="h-10 p-2 gap-1 rounded-md bg-background text-base [&_svg:last-child]:size-5 [&_svg:last-child]:opacity-100">
                      <span className="text-muted-foreground font-normal">Section:</span>
                      <span className="font-medium text-foreground">
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                      {sectionOptions.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* ── Analysis tab content ─────────────────────────────────────── */}
            {tab === 'analysis' && <AnalysisTab context={examCtx} />}

            {/* ── Remediation-only content ─────────────────────────────────── */}
            {tab === 'remediation' && <>

              {/* ── Stats — two separate cards: SectionAverageCard + description ── */}
              <div className="mt-4 flex gap-4">
                {/* Section average card — variant driven by score */}
                <SectionAverageCard
                  loading={Boolean(examCtx) && headerLoading}
                  value={examCtx ? (avg != null && info?.maxMarks ? `${avg}/${Math.round(info.maxMarks)}` : '—') : `${exam.sectionAvg}%`}
                  suffix=""
                  trendValue={examCtx ? (pctNow != null ? `${pctNow}%` : '') : exam.trend}
                  trendLabel={examCtx ? comparisonLabel : exam.trendLabel}
                  variant={pctNow == null || pctNow >= 60 ? 'good' : pctNow >= 40 ? 'warning' : 'danger'}
                  className="w-[285px] shrink-0"
                />

                {/* Description / alert card */}
                <div className="flex-1 border border-border rounded-xl bg-card px-6 py-4">
                  {/* The heading and body are this exam's AI summary when one exists.
                  Showing the generic fallback while it loads means the teacher
                  reads one message and then watches it be replaced — so hold a
                  placeholder until we know which copy applies. */}
                  {examCtx && headerLoading ? (
                    <p role="status" className="text-base font-normal leading-6 text-muted-foreground">
                      Loading…
                    </p>
                  ) : (
                    <>
                      <h2 className="text-2xl font-medium leading-8 tracking-[-0.108px] text-foreground">
                        {examCtx
                          ? (sectionSummary?.title ?? info?.examSummaryTitle ?? 'See which topics are worth re-teaching')
                          : `${exam.marksSlipped} marks slipped on specific topics — see which ones are worth re-teaching`}
                      </h2>
                      <p className="text-base font-normal leading-6 text-muted-foreground mt-1 whitespace-pre-line">
                        {(examCtx && (sectionSummary?.subtitle ?? info?.examSummaryDescription)) ??
                          'Question and chapter breakdowns show where most students went wrong — so you can plan one focused lesson that moves marks for the whole class.'}
                      </p>
                    </>
                  )}
                  <div className="mt-3">
                    <Button onClick={() => { trackTabKey('analysis'); setTab('analysis') }} className="bg-[var(--inferentics-brand-primary)] hover:bg-[var(--inferentics-brand-primary-hover)] text-white gap-2 h-10 px-5 rounded-md text-[14px] font-medium tracking-[-0.084px]">
                      <LineChartIcon />
                      View analysis
                    </Button>
                  </div>
                </div>
              </div>

              {/* ── Failed fetch ≠ "no data" (beaver#831): a transient error used to
              render as a silently missing block, indistinguishable from an
              unclassified section, until the page happened to be remounted.
              Now it says so, and Retry re-fires the same fetch in place. ── */}
              {showRemediationTable && remFailed && !remLoading && (
                <div className="mt-6 rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Couldn&apos;t load the remediation data for this section — this is a loading problem, not an empty section.
                  </p>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setRemAttempt((a) => a + 1)}>
                    Retry
                  </Button>
                </div>
              )}

              {/* ── Remediation heading card + scoring/distribution — gated by show_remediation_table_exam_page (beaver#566/#575, title included) ── */}
              {showRemediationTable && hasRemediation && <>
                <div className="mt-6 overflow-hidden bg-card">
                  <div className="">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-['Inter'] font-semibold leading-7 text-foreground">Remediation</h3>
                      </div>

                      {/* Hidden the view toggle button as of now since it isnt under function */}
                      {/* <div className="flex items-center bg-secondary rounded-md p-1 gap-0">
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`flex flex-1 items-center justify-center h-8 px-3 rounded-[4px] transition-all ${viewMode === 'grid'
                              ? 'bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]'
                              : ''
                            }`}
                        >
                          <LayoutGrid className="size-4 text-foreground" />
                        </button>
                        <button
                          onClick={() => setViewMode('table')}
                          className={`flex flex-1 items-center justify-center h-8 px-3 rounded-[4px] transition-all ${viewMode === 'table'
                              ? 'bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]'
                              : ''
                            }`}
                        >
                          <Table className="size-4 text-foreground" />
                        </button>
                      </div> */}
                    </div>
                    <div className="mt-3">

                    </div>
                  </div>
                </div>

                <TopicTable
                  className="mt-6"
                  title="Scoring marks left on the table"
                  subtitle="Practice-first opportunities that can recover marks quickly."
                  col2Label="Easy marks lost"
                  col2Width="w-[160px]"
                  showDot
                  loading={Boolean(examCtx) && remLoading}
                  emptyMessage="No remediation data for this exam."
                  onView={(row) => setDrawerRow(row)}
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

                {/* ── Score distribution — standalone TopicTable card ──────────── */}
                <TopicTable
                  className="mt-4"
                  title="Score distribution"
                  subtitle="Absent students are excluded from calculations."
                  col2Label="Marks lost"
                  col2Width="w-[164px]"
                  showDot={false}
                  loading={Boolean(examCtx) && remLoading}
                  emptyMessage="No remediation data for this exam."
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

              {/* ── Common mistakes card (beaver#575) ── */}
              <Dialog open={expandedImage !== null} onOpenChange={(open) => { if (!open) setExpandedImage(null) }}>
                <DialogContent className="max-w-[90vw] sm:max-w-[90vw] p-2 bg-[#A9A9A9] border-none">
                  <DialogTitle className="sr-only">Student answer</DialogTitle>
                  {expandedImage && (
                    <img src={expandedImage} alt="Student answer" className="w-full max-h-[85vh] object-contain" />
                  )}
                </DialogContent>
              </Dialog>

              {showCommonMistakes && (
                <div className="mt-4 border border-border rounded-xl overflow-hidden bg-card">
                  {examCtx && remLoading ? (
                    <div className="px-6 py-6">
                      <Skeleton className="h-7 w-48" />

                      <div className="mt-4 divide-y divide-border">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="py-5 flex items-start justify-between gap-4">
                            <div className="flex items-start gap-2 flex-1">
                              <Skeleton className="size-3 rounded-full mt-[7px] shrink-0" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-6 w-72" />
                                <Skeleton className="h-5 w-44" />
                              </div>
                            </div>
                            <Skeleton className="h-9 w-24 shrink-0" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="px-6 pt-6 pb-4">
                        <h3 className="text-xl font-medium leading-7 font-['Inter'] text-foreground">Common mistakes</h3>
                        {/* By kind of mistake, with the same fixed colours as
                            Home and the chapter page — this slot sat empty and
                            every row wore the same grey dot. */}
                        {mistakeItems.length > 0 && (
                          <div className="mt-3">
                            <MistakeTypeLegendBar legend={mistakeTypeLegend(mistakeItems)} />
                          </div>
                        )}
                      </div>

                        {/* Common mistakes accordion — edge-to-edge */}
                        <div className="border-t border-border divide-y divide-border overflow-hidden">
                          {mistakeItems.map((item) => {
                            const isOpen = expandedMistake === item.id

                            return (
                              <div
                                key={item.id}
                                ref={(el) => {
                                  mistakeRefs.current[item.id] = el
                                }}
                                className="transition-colors"
                              >

                                {/* Accordion header — ONLY this area opens/closes */}
                                <div
                                  onClick={() => {
                                    const willOpen = !isOpen

                                    setExpandedMistake(willOpen ? item.id : null)
                                    setStudentIndex(1)

                                    if (willOpen) {
                                      scrollMistakeToTop(item.id)
                                    }
                                  }}
                                  className="px-4 py-[22px] flex items-start justify-between gap-4 cursor-pointer hover:bg-muted/40"
                                >
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    <div className="size-3 rounded-[4px] shrink-0 mt-[7px]" style={{ backgroundColor: mistakeTypeColor(item.errorTypeName) }} />

                                    <div className="min-w-0">
                                      <p className="text-lg font-semibold leading-7 text-foreground">
                                        {item.chapter}
                                      </p>

                                      <p className="text-base font-normal leading-6 text-muted-foreground">
                                        {item.descriptor} · {item.students} students
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {showAddToPlan && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-[12px] h-9 px-3"
                                      >
                                        <BookmarkPlus className="size-3.5" />
                                        Add to plan
                                      </Button>
                                    )}

                                    <button
                                      className="p-1 rounded-md text-muted-foreground hover:bg-accent transition-colors"
                                    >
                                      <ChevronDown
                                        className={`size-5 transition-transform ${isOpen ? '' : '-rotate-90'
                                          }`}
                                      />
                                    </button>
                                  </div>
                                </div>

                                {/* Student content — clicking here does NOT close accordion */}
                                {isOpen && item.example && (
                                  <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
                                    <div className="border border-border rounded-xl overflow-hidden">
                                      <div className="flex">

                                        {/* AI analysis */}
                                        <div className="flex-1 p-4 flex flex-col gap-1.5 border-r border-border min-w-0">
                                          <p className="text-[13px] leading-5 text-muted-foreground">
                                            {item.example.description}
                                          </p>
                                        </div>

                                        {/* Student-specific answer */}
                                        <div className="flex-1 min-w-0">
                                          {(() => {
                                            const evs =
                                              'evidences' in item.example
                                                ? item.example.evidences
                                                : []

                                            const ev =
                                              evs.length > 0
                                                ? evs[Math.min(studentIndex, evs.length) - 1]
                                                : undefined

                                            const shownStudent =
                                              ev?.student ?? item.example.student

                                            const shownEarned =
                                              ev ? ev.marks ?? 0 : item.example.earned

                                            const shownTotal =
                                              ev ? ev.maxMarks ?? 0 : item.example.total

                                            const shownImage =
                                              ev?.imageUrl ??
                                              ('image' in item.example
                                                ? item.example.image
                                                : undefined)

                                            return (
                                              <>
                                                {/* Student name + marks */}
                                                <div className="flex items-center justify-between gap-2 p-4 pb-3">
                                                  <p className="text-[15px] font-semibold leading-6 text-foreground">
                                                    {shownStudent}
                                                  </p>

                                                  <p className="text-[13px] font-medium text-orange-500 shrink-0">
                                                    {shownEarned}/{shownTotal} marks
                                                  </p>
                                                </div>

                                                {/* Answer image + navigation */}
                                                <div className="relative min-h-[256px] bg-amber-50 flex flex-col overflow-hidden">

                                                  <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
                                                    {shownImage ? (
                                                      <>
                                                        {imageLoading && (
                                                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                                                            <div className="size-5 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
                                                          </div>
                                                        )}

                                                        <img
                                                          src={shownImage}
                                                          alt="Student work"
                                                          onLoad={() => setImageLoading(false)}
                                                          className="w-full h-full object-contain bg-[#A9A9A9]"
                                                        />
                                                        <button
                                                          type="button"
                                                          onClick={() => setExpandedImage(shownImage)}
                                                          className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 bg-[#3f3f46] text-white text-[12px] font-medium leading-4 tracking-[-0.072px] px-2 py-1.5 rounded hover:bg-[#52525b] transition-colors"
                                                        >
                                                          <Maximize2 className="size-4" />
                                                          Click to expand
                                                        </button>
                                                      </>
                                                    ) : (
                                                      <span className="text-[12px] text-muted-foreground">
                                                        Student work
                                                      </span>
                                                    )}
                                                  </div>

                                                  {/* Navigation */}
                                                  <div className="h-9 shrink-0 flex items-center justify-center gap-2 bg-white">
                                                    <button
                                                      disabled={studentIndex <= 1}
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        setImageLoading(true)
                                                        setStudentIndex((i) => Math.max(1, i - 1))
                                                        scrollMistakeToTop(item.id)
                                                      }}
                                                      className="size-7 flex items-center justify-center rounded-md border border-border bg-white text-black  hover:bg-muted hover:shadow transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:shadow-none"
                                                    >
                                                      <ChevronLeft className="size-4" />
                                                    </button>

                                                    <span className="text-[12px] leading-4 text-black min-w-[32px] text-center">
                                                      {studentIndex}/
                                                      {('evidences' in item.example &&
                                                        item.example.evidences.length)
                                                        ? item.example.evidences.length
                                                        : item.example.count}
                                                    </span>

                                                    <button
                                                      disabled={studentIndex >= (
                                                        ('evidences' in item.example && item.example.evidences.length)
                                                          ? item.example.evidences.length
                                                          : item.example.count
                                                      )}
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        setImageLoading(true)
                                                        setStudentIndex((i) =>
                                                          Math.min(
                                                            ('evidences' in item.example &&
                                                              item.example.evidences.length)
                                                              ? item.example.evidences.length
                                                              : item.example.count,
                                                            i + 1
                                                          )
                                                        )
                                                        scrollMistakeToTop(item.id)
                                                      }}
                                                      className="size-7 flex items-center justify-center rounded-md border border-border bg-white text-black  hover:bg-muted hover:shadow transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:shadow-none"
                                                    >
                                                      <ChevronRight className="size-4" />
                                                    </button>
                                                  </div>
                                                </div>
                                              </>
                                            )
                                          })()}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                    </>
                  )}
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
          // With a real exam, only real scanned answers. The fallback invents
          // classmates (Naina Verma, Aarav Shah, …) with "0/<col2> marks", so a
          // chapter with no evidence crops used to open a drawer full of people
          // who do not exist — and now that col2 is a marks-lost figure it would
          // read "0/286.5 marks" as well. An empty evidence list renders nothing
          // (the drawer already returns null with no student).
          students={examCtx ? evidenceToStudents(evidence, drawerRow, sectionAnswerErrors, questionText) : makeStudents(drawerRow)}
        />
      )}
    </div>
  )
}
