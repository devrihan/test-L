'use client'

// Student chapter detail — Student Login Metrics (7) spec ("Chapter Detail
// Page"). Everything on this screen is the logged-in student's OWN data from
// scanned, marked papers:
//   • By exam:    (their marks on this chapter in each exam / chapter max in
//                 that exam) × 100 — one line point per marked exam.
//   • By concept: (their marks on questions testing a concept in an exam /
//                 that concept's max in that exam) × 100 — bars grouped by exam.
//   • Status:     AI fields (per-view when the backend has them, else the
//                 chapter AI status, else the computed status) — honest
//                 "No analysis yet" when nothing exists.
//   • Q-chips:    only when a single exam was selected on the previous screen.
// Nothing here is hardcoded: a scope with no data renders an honest empty state.

import { use, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchChapterDetail, type ChapterDetail } from '@/app/lib/chapter-detail'
import {
  fetchAnswerCrops,
  fetchCropFilters,
  fetchStudentChapterStats,
  personalQuestionStats,
  type StudentChapterStat,
} from '@/app/lib/answer-crops'
import { fetchExamInfo, fetchPaperQuestions, fetchRemediation, fetchStudentChapterSummary, type Remediation, type StudentChapterSummary } from '@/app/lib/questions'
import { fetchStudentAnswerErrors, type StudentAnswerError } from '@/app/lib/students'
import { CommonMistakesSection, type MistakeItem } from '@/components/common-mistakes-section'
import { useFeatureFlag } from '@/components/config-provider'
import { classificationEnabledFor, useClassifiedCohorts } from '@/app/lib/classification-scope'
import { errorTypeFromCode, studentErrorTypeLabel, studentErrorTypeTitle } from '@/app/lib/error-type-labels'
import { mistakeTypeColor, mistakeTypeLegend, mistakeTypeRank } from '@/app/lib/mistake-type-legend'
import { fetchLoggedInStudent, type LoggedInStudent } from '@/app/lib/student-identity'
import { academicYearsOf, formatExamName, matchesAcademicYear } from '@/app/lib/filters'
import { StatusChartCard, type GroupedBarSeries } from '@/components/status-chart-card'
import { BreadcrumbSwitcher } from '@/components/breadcrumb-switcher'
import { usePageBreadcrumb } from '@/app/lib/breadcrumb'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import LatexPreview from '@/components/latex-preview'
import { trackDrilldown } from '@/app/lib/analytics'
import { useQuestionRefs } from '@/app/lib/question-refs'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Whitespace- and case-insensitive key for backend name comparisons. */
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/** Roll numbers differ in zero-padding across sources ('016' vs '16'). */
const normRoll = (roll: string) => roll.replace(/^0+/, '') || roll

const round1 = (n: number) => Math.round(n * 10) / 10

/** 'three dimensional geometry' -> 'Three Dimensional Geometry'. */
function titleCaseChapterName(name: string): string {
  return name.split(' ').map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
}

/** Rows of student-chapter-stats that belong to this student + chapter. */
function myChapterRows(
  stats: StudentChapterStat[], student: LoggedInStudent, chapterName: string,
): StudentChapterStat[] {
  return stats.filter(
    (s) =>
      (s.admissionNo
        ? s.admissionNo === student.admissionNo
        : normRoll(s.rollNumber ?? '') === normRoll(String(student.rollNumber))) &&
      norm(s.chapter) === norm(chapterName) &&
      s.chapterMax > 0,
  )
}

/** One line-chart point: the student's chapter % in one exam. */
interface ExamPoint {
  label: string
  pct: number
  got: number
  max: number
}

// Exam series colors for the grouped concept bars (cycled past 4 exams).
const EXAM_COLORS = ['#22d3ee', '#818cf8', '#c084fc', '#2dd4bf']

// ─── page ────────────────────────────────────────────────────────────────────

export function StudentChapterDetail({ params }: { params: Promise<{ chapterId: string }> }) {
  const router = useRouter()
  const { chapterId } = use(params)
  const searchParams = useSearchParams()

  const ctxChapterName = decodeURIComponent(chapterId)
  const grade = searchParams.get('grade') ?? ''
  const section = searchParams.get('section') ?? ''
  const subject = searchParams.get('subject') ?? ''
  // 'All Exams' on the previous screen → examAll=true (no exam param); a single
  // exam → exam=<backend id>. Older links carry neither → treated as all exams.
  const examAll = searchParams.get('examAll') === 'true'
  const ctxExam = examAll ? null : searchParams.get('exam')
  const hasCtx = Boolean(grade && subject)

  // undefined = still resolving; null = login has no linked student record.
  const [student, setStudent] = useState<LoggedInStudent | null | undefined>(undefined)
  useEffect(() => {
    let ignore = false
    fetchLoggedInStudent().then((s) => { if (!ignore) setStudent(s) })
    return () => { ignore = true }
  }, [])

  // AI status + question chips, scoped to the selection made on the previous
  // screen (single exam → that exam's paper; All Exams → cross-exam rollup).
  // undefined = loading; null = the analytics endpoint has nothing here.
  const [detail, setDetail] = useState<ChapterDetail | null | undefined>(undefined)
  useEffect(() => {
    if (!hasCtx) { setDetail(null); return }
    let ignore = false
    fetchChapterDetail({
      grade,
      chapterName: ctxChapterName,
      section,
      subject,
      exam: ctxExam ?? undefined,
    }).then((d) => { if (!ignore) setDetail(d) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, hasCtx])

  // The student's own numbers, one point per marked exam of the academic year.
  const [examPoints, setExamPoints] = useState<ExamPoint[] | null>(null)
  const [conceptChart, setConceptChart] = useState<{
    rows: Record<string, string | number>[]
    series: GroupedBarSeries[]
  } | null>(null)
  const [myChapters, setMyChapters] = useState<{ id: string; name: string }[]>([])

  // Common mistakes for THIS chapter (beaver#643/644: the flag
  // show_common_mistakes_student_chapter_page existed but no component ever
  // read it — this is the section it was minted for). Remediation is per
  // exam, so under 'All Exams' the section stays hidden, same as the
  // dashboard. Rows are filtered to this chapter by the mistake's own
  // chapter name.
  const showCommonMistakesFlag = useFeatureFlag('show_common_mistakes_student_chapter_page')
  const classifiedCohorts = useClassifiedCohorts()
  const showCommonMistakes = showCommonMistakesFlag && classificationEnabledFor(classifiedCohorts, grade, subject)
  const [rem, setRem] = useState<Remediation | null>(null)
  useEffect(() => {
    if (!hasCtx || !ctxExam || !section) { setRem(null); return }
    let ignore = false
    fetchRemediation({ grade, section, subject, exam: ctxExam }).then((r) => {
      if (!ignore) setRem(r.ok ? r.data : null)
    })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCtx, ctxExam, grade, section, subject])
  // The logged-in student's OWN classified answers for this exam, filtered to
  // this chapter below. This is the personal half the section rollup cannot
  // give: `what_went_wrong` is written about ONE answer of ONE student. Empty
  // for a full-marks chapter (classification skips full marks) or an
  // unclassified section — the personal card then simply does not render.
  const [ownErrors, setOwnErrors] = useState<StudentAnswerError[]>([])
  useEffect(() => {
    if (!hasCtx || !ctxExam || !section || !student?.admissionNo) { setOwnErrors([]); return }
    let ignore = false
    fetchStudentAnswerErrors(
      { grade, section, subject, exam: ctxExam },
      { roll: student.rollNumber != null ? String(student.rollNumber) : null, admissionNo: student.admissionNo },
    ).then((errs) => { if (!ignore) setOwnErrors(errs) })
      .catch(() => { if (!ignore) setOwnErrors([]) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCtx, ctxExam, grade, section, subject, student?.admissionNo])

  // One card per faulted answer, worst first — per answer, not per error type,
  // because that is the grain the diagnosis is written at. Same colour rule as
  // the student page: one FIXED colour per error type, grey for uncoded.
  // A row classified against a code that is not in error_taxonomy carries no
  // errorTypeName and no errorLabel, but the code's own leading segment names
  // the bucket — so read the type through the code rather than dropping the
  // answer into 'Other' beside a card titled with a bare question number.
  const ownType = (e: StudentAnswerError) => e.errorTypeName ?? errorTypeFromCode(e.errorCode)
  // Typed answers only, as on the student page (codedAnswers there). An
  // answer with no type at all has nothing to title its card with but the
  // question number, so it headlined as a bare "Q35".
  // The exam's questions, so each card can name its question (hover: the text)
  // and offer the answer key beside the student's own scanned answer.
  const questionRefs = useQuestionRefs(hasCtx && ctxExam ? { grade, subject, exam: ctxExam } : null)
  const ownChapterErrors = ownErrors
    .filter((e) => e.verdict !== 'clean' && e.chapterName && norm(e.chapterName) === norm(ctxChapterName) && ownType(e))
    .sort((a, b) => (Math.max(0, (b.maxMarks ?? 0) - (b.marks ?? 0))) - (Math.max(0, (a.maxMarks ?? 0) - (a.marks ?? 0))))
  const ownTypes = Array.from(new Set(ownChapterErrors.map(ownType).filter(Boolean) as string[]))
    .sort((a, b) => mistakeTypeRank(a) - mistakeTypeRank(b))
  const ownColor = (t: string | null) => mistakeTypeColor(t)
  const tcOwn = studentErrorTypeLabel
  const ownMistakeItems: MistakeItem[] = ownChapterErrors.map((e, i) => ({
    id: `own${i}`,
    color: ownColor(ownType(e)),
    title: e.errorLabel ?? studentErrorTypeTitle(ownType(e) as string),
    description: `${e.whatWentWrong ?? ''} · Q${Math.trunc(e.questionNumber)}`,
    example: e.croppedImageUrl
      ? { student: '', earned: e.marks ?? 0, total: e.maxMarks ?? 0, description: e.whatWentWrong ?? '', image: e.croppedImageUrl, count: 1 }
      : null,
    evidences: e.croppedImageUrl ? [{ imageUrl: e.croppedImageUrl, student: null, marks: e.marks, maxMarks: e.maxMarks }] : [],
    question: questionRefs.get(Math.trunc(e.questionNumber)),
  }))
  const ownLegend = ownTypes.map((t) => ({ label: tcOwn(t), color: ownColor(t), value: ownChapterErrors.filter((e) => ownType(e) === t).length }))

  // Colour and legend by KIND of mistake, resolved by the API through
  // error_taxonomy (null → 'Other'). This replaces a split that alternated
  // rows between two fixed labels — a 50/50 with no relation to the data.
  const sectionMistakes = (rem?.mistakes ?? []).filter((m) => m.chapter && norm(m.chapter) === norm(ctxChapterName))
  const colorForSectionType = mistakeTypeColor
  const mistakeItems: MistakeItem[] = sectionMistakes
    .map((m, i) => ({
      id: `cm${i}`,
      color: colorForSectionType(m.errorTypeName),
      title: m.pattern,
      description: `${m.description}${m.count ? ` · ${m.count} students` : ''}`,
      example: m.evidenceImageUrl
        ? { student: m.evidenceStudent ?? '', earned: m.evidenceMarks ?? 0, total: m.evidenceMaxMarks ?? 0, description: m.description, image: m.evidenceImageUrl, count: m.count }
        : null,
      evidences: (m.evidences ?? []).filter((e) => e.imageUrl),
      question: m.questionNumber != null ? questionRefs.get(Math.trunc(m.questionNumber)) : undefined,
    }))
  const mistakeLegend = mistakeTypeLegend(sectionMistakes, colorForSectionType)

  // Per-student AI Summary for this chapter (student_chapter_summary, self-scoped
  // by admissionNo). examView fills the By Exam tab, conceptView the By Concept
  // tab. undefined = loading; null = the endpoint has no row (keep placeholder).
  const [summary, setSummary] = useState<StudentChapterSummary | null | undefined>(undefined)

  useEffect(() => {
    if (!hasCtx || !student) return
    let ignore = false
    setSummary(undefined)
    ;(async () => {
      // The cohort's exams for the latest academic year (legacy un-yeared exam
      // ids match every year), in real exam-date order where dates exist.
      const combos = await fetchCropFilters()
      const cohortExams = Array.from(new Set(
        combos
          .filter((c) =>
            c.grade === grade && norm(c.subject) === norm(subject) && norm(c.section) === norm(section))
          .map((c) => c.exam),
      ))
      const year = academicYearsOf(cohortExams)[0]
      const yearExams = cohortExams.filter((e) => matchesAcademicYear(e, year))
      const infos = await Promise.all(yearExams.map(async (exam) => ({
        exam,
        date: (await fetchExamInfo({ grade, section, subject, exam }).catch(() => null))?.examDate ?? null,
      })))
      const ordered = [
        ...infos.filter((i) => i.date !== null).sort((a, b) => (a.date as string).localeCompare(b.date as string)),
        ...infos.filter((i) => i.date === null),
      ].map((i) => i.exam)

      const [perExam, perExamConcepts, scopeStats] = await Promise.all([
        // By exam: the student's own chapter % per exam (marked-only — an exam
        // where this chapter wasn't marked contributes no point).
        Promise.all(ordered.map(async (exam) => {
          // Self-scoped (access policy): only the student's own rows.
          const stats = await fetchStudentChapterStats({ grade, section, subject, exams: [exam], admissionNo: student.admissionNo }).catch(() => [])
          const mine = myChapterRows(stats, student, ctxChapterName)
          if (mine.length === 0) return null
          const got = mine.reduce((a, s) => a + s.got, 0)
          const max = mine.reduce((a, s) => a + s.chapterMax, 0)
          return { label: formatExamName(exam), pct: round1((100 * got) / max), got, max }
        })),
        // By concept: join the chapter's question→concept map for each exam
        // with the student's own marked crops for that exam.
        Promise.all(ordered.map(async (exam) => {
          const [paperQs, crops] = await Promise.all([
            // Question->concept map from the PAPER (questions/concepts), not the
            // answers-spine: /api/chapter-details "Questions from this Chapter"
            // is empty for scanned sections, which blanked this chart even
            // though the crops + concept tags both exist (same class as #186).
            fetchPaperQuestions({ grade, section, subject, exam }).catch(() => []),
            fetchAnswerCrops({
              grade, section, subject, exam,
              roll: String(student.rollNumber),
              admissionNo: student.admissionNo,
            }).catch(() => []),
          ])
          const totals = new Map<string, { got: number; max: number }>()
          if (paperQs.length > 0 && crops.length > 0) {
            const byNum = new Map(personalQuestionStats(crops).map((p) => [p.questionNumber, p]))
            // whole-question numbers per concept, deduped so sub-parts (6.1,
            // 6.2) never double count the whole question's marks. The paper
            // spans all chapters, so restrict to this chapter by name.
            const conceptQs = new Map<string, Set<number>>()
            for (const q of paperQs) {
              if (!q.concept || norm(q.chapterName ?? '') !== norm(ctxChapterName)) continue
              const setQ = conceptQs.get(q.concept) ?? new Set<number>()
              setQ.add(Math.trunc(q.questionNumber))
              conceptQs.set(q.concept, setQ)
            }
            for (const [concept, nums] of conceptQs) {
              let got = 0
              let max = 0
              for (const n of nums) {
                const p = byNum.get(n)
                if (!p) continue // marked-only
                got += p.got
                max += p.max
              }
              if (max > 0) totals.set(concept, { got, max })
            }
          }
          return { exam, totals }
        })),
        // Chapter switcher: the student's own chapters in the selected scope
        // (self-scoped by admissionNo, per the access policy).
        fetchStudentChapterStats({
          grade, section, subject,
          exams: ctxExam ? [ctxExam] : yearExams,
          admissionNo: student.admissionNo,
        }).catch(() => []),
      ])
      if (ignore) return

      setExamPoints(perExam.filter((p): p is ExamPoint => p !== null))

      // Series = exams with any concept data; rows = union of concepts.
      const withData = perExamConcepts.filter((e) => e.totals.size > 0)
      const series: GroupedBarSeries[] = withData.map((e, i) => ({
        key: `e${i}`,
        label: formatExamName(e.exam),
        color: EXAM_COLORS[i % EXAM_COLORS.length],
      }))
      const conceptNames: string[] = []
      for (const e of withData) {
        for (const c of e.totals.keys()) if (!conceptNames.includes(c)) conceptNames.push(c)
      }
      setConceptChart({
        series,
        rows: conceptNames.map((concept) => {
          const row: Record<string, string | number> = { label: concept }
          withData.forEach((e, i) => {
            const t = e.totals.get(concept)
            if (!t) {
              // Show a 0 bar (with its own tooltip) when there's no marked
              // answer for this concept in this exam, instead of an empty gap
              // that has nothing to hover.
              row[`e${i}`] = 0
              row[`e${i}Detail`] = `No marked answer for this concept in this exam.`
              return
            }
            row[`e${i}`] = round1((100 * t.got) / t.max)
            row[`e${i}Detail`] = `You scored ${round1(t.got)}/${round1(t.max)} on this concept in this exam.`
          })
          return row
        }),
      })

      const chapterNames: string[] = []
      for (const s of scopeStats) {
        const mine = s.admissionNo
          ? s.admissionNo === student.admissionNo
          : normRoll(s.rollNumber ?? '') === normRoll(String(student.rollNumber))
        if (mine && s.chapterMax > 0 && !chapterNames.includes(s.chapter)) chapterNames.push(s.chapter)
      }
      setMyChapters(chapterNames.sort().map((name) => ({ id: encodeURIComponent(name), name })))

      // The per-student chapter summary is keyed by a single exam. When a single
      // exam was selected on the previous screen, use it; on "All Exams", use the
      // most recent exam that has a marked point for this chapter. Chapter name
      // is sent title-cased to match the stored (init-capped) value.
      const withPoint = ordered.filter((_, i) => perExam[i] !== null)
      const summaryExam = ctxExam ?? withPoint[withPoint.length - 1] ?? null
      if (summaryExam) {
        const s = await fetchStudentChapterSummary({
          grade, section, subject, exam: summaryExam,
          chapter: titleCaseChapterName(ctxChapterName),
          admissionNo: student.admissionNo,
        })
        if (!ignore) setSummary(s)
      } else if (!ignore) {
        setSummary(null)
      }
    })().catch(() => {
      if (!ignore) {
        setExamPoints([])
        setConceptChart({ rows: [], series: [] })
        setSummary(null)
      }
    })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, hasCtx, student, examAll, ctxExam])

  const chapterName = titleCaseChapterName(ctxChapterName)
  const examsLabel = ctxExam ? formatExamName(ctxExam) : 'Across all Exams'
  // Spec: question chips (Q6, Q7 …) only when a single exam was selected on
  // the previous screen — and only real question numbers from that paper.
  const questionTags = ctxExam && detail ? detail.questionTags : []
  const questionData = detail?.questionData ?? {}

  const loading = student === undefined || (student !== null && (examPoints === null || detail === undefined))

  // The Summary panel reads this student's OWN AI copy from student_chapter_summary
  // (examView → By Exam tab, conceptView → By Concept tab), self-scoped by
  // admissionNo. It must NEVER read the teacher `chapter_summary` fields ("Your
  // Section is losing marks because…") — that was the student-view leak (beaver
  // #745), fixed in #154. When no per-student row exists we fall back to the
  // honest "No analysis yet" placeholder.
  const placeholder = (loadingStatus: boolean) => ({
    status: loadingStatus ? 'Loading…' : 'No analysis yet',
    statusDescription: loadingStatus ? '' : 'Analysis for this view appears once generated.',
  })
  const pairStatus = (pair: { title: string | null; subtitle: string | null } | null | undefined) =>
    pair && pair.title
      ? { status: pair.title, statusDescription: pair.subtitle ?? '' }
      : placeholder(summary === undefined)
  const byExamStatus = pairStatus(summary?.examView)
  const byConceptStatus = pairStatus(summary?.conceptView)

  usePageBreadcrumb(
    <BreadcrumbSwitcher
      parentLabel="Chapter"
      parentHref="/chapter"
      activeId={chapterId}
      activeLabel={chapterName}
      sectionLabel="Chapter names"
      items={myChapters.map((ch) => ({ id: ch.id, label: titleCaseChapterName(ch.name) }))}
      drilldownEntity="chapter"
      onSelect={(id) => router.push(`/chapter/${id}?${searchParams.toString()}`)}
    />,
    // searchParams in the deps: the closure navigates with the query string,
    // so a query-only change must re-register it (stale-filter bug otherwise).
    [chapterId, chapterName, myChapters.length, searchParams.toString()]
  )

  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col">
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-6 pb-12 flex justify-center">
          <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-[1280px] flex flex-col gap-4">

            {/* ── Title row ── */}
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 whitespace-nowrap">
                <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.144px] text-black">
                  {chapterName}
                </h1>
                <p className="text-[16px] font-medium leading-6 text-muted-foreground">
                  {examsLabel}
                </p>
              </div>
              <TooltipProvider delayDuration={300}>
                <div className="bg-background flex items-center gap-2 h-12 py-2 min-w-0 max-w-[50%] overflow-x-auto overflow-y-hidden [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.5)_transparent] [&::-webkit-scrollbar]:h-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/50 [&::-webkit-scrollbar-thumb:hover]:bg-slate-400/70">
                  {questionTags.map((q) => (
                    <CellTooltip
                      key={q}
                      content={
                        <span className="flex flex-col gap-1">
                          <span className="font-medium">{q}</span>
                          <LatexPreview text={questionData[q]?.title ?? 'Question text unavailable'} />
                        </span>
                      }
                    >
                      <div className="border border-border rounded-[6px] px-[10px] py-1 flex items-center justify-center shrink-0">
                        <span className="text-[18px] font-normal leading-7 tracking-[-0.108px] text-foreground whitespace-nowrap">
                          {q}
                        </span>
                      </div>
                    </CellTooltip>
                  ))}
                </div>
              </TooltipProvider>
            </div>

            {student === null ? (
              <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
                Your login isn&apos;t linked to a student record yet, so chapter performance can&apos;t be shown.
              </div>
            ) : !hasCtx ? (
              <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
                Open this chapter from your Chapters page so it knows which subject and exams to show.
              </div>
            ) : (
              <StatusChartCard
                statusLabel="Summary"
                status={byExamStatus.status}
                statusDescription={byExamStatus.statusDescription}
                chartTabs={[
                  {
                    key: 'exam',
                    label: 'By Exam',
                    chartTitle: 'Your Performance on this Chapter ',
                    kind: 'line',
                    data: (examPoints ?? []).map((p) => ({
                      label: p.label,
                      value: p.pct,
                      detail: `You scored ${round1(p.got)}/${round1(p.max)} in this chapter.`,
                    })),
                    yTicks: [0, 25, 50, 75, 100],
                    valueSuffix: '%',
                    legendLabel: 'Chapter’s Average',
                    emptyText: loading
                      ? 'Loading your chapter performance…'
                      : 'No marked exams for this chapter yet. Your trend appears once a paper is scanned and marked.',
                    ...byExamStatus,
                  },
                  {
                    key: 'concept',
                    label: 'By Concept',
                    chartTitle: ' Concept Breakdown for this Chapter',
                    kind: 'groupedBar',
                    data: [],
                    groupedData: conceptChart?.rows ?? [],
                    series: conceptChart?.series ?? [],
                    yTicks: [0, 25, 50, 75, 100],
                    valueSuffix: '%',
                    // Shared tooltip → full-column hover + the grey column
                    // highlight (like By Exam). The grouped tooltip still shows
                    // each exam's "You scored X/Y" detail (see GroupedChartTooltip).
                    emptyText: loading
                      ? 'Loading your concept performance…'
                      : 'No concept-level marks for this chapter yet. Concepts appear once questions are tagged and marked.',
                    ...byConceptStatus,
                  },
                ]}
              />
            )}

            {/* Common mistakes for this chapter — gated by
                show_common_mistakes_student_chapter_page; hidden when the
                chapter has no classified mistakes (or under 'All Exams'). */}
            {/* The student's OWN mistakes in this chapter — above the section
                rollup, because on a personal page their own work comes first.
                Absent for a full-marks chapter or an unclassified section. */}
            {student !== null && hasCtx && showCommonMistakes && ownMistakeItems.length > 0 && (
              <CommonMistakesSection
                className="mt-2"
                title="Your mistakes in this chapter"
                variant="question"
                hideAddToPlan
                tabs={[{ key: 'own', label: 'Mistakes', legend: ownLegend, items: ownMistakeItems }]}
              />
            )}

            {student !== null && hasCtx && showCommonMistakes && mistakeItems.length > 0 && (
              <CommonMistakesSection
                className="mt-2"
                title="Common mistakes made in your section"
                variant="question"
                hideAddToPlan
                tabs={[{ key: 'mistakes', label: 'Mistakes', legend: mistakeLegend, items: mistakeItems }]}
              />
            )}

          </div>
        </div>
      </main>
    </div>
  )
}
