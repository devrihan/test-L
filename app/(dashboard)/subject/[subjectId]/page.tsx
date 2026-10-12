'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { usePageBreadcrumb } from '@/app/lib/breadcrumb'
import { formatExamName } from '@/app/lib/filters'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { seniorCombos, seniorGrades } from '@/app/lib/senior-scope'
import { useViewer } from '@/app/lib/viewer'
import {
  sectionsForSubject,
  examsForSubject,
  fetchSectionPerformance,
  fetchChapterPerformance,
  fetchExamTrend,
  marksDetail,
  type SectionAverage,
  type ChapterSectionAverages,
  type ExamAverage,
} from '@/app/lib/subject-directory'
import { BandedBarCard, type BandedBarPoint } from '@/components/banded-bar-card'
import { ChartSkeleton } from '@/components/page-skeletons'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// The leadership subject drill-down (Figma 1550-20532): the subject's average
// in each section, then the same breakdown per chapter.

const ALL = '__all__'

// Matches the 40px selects in the frame. Local rather than a change to
// PageFilters — that component is shared by every teacher/student page and
// this header needs a different pair of dropdowns entirely.
const triggerClass =
  'h-10 p-2 rounded-md gap-1 text-[18px] leading-7 [&_svg:last-child]:size-6 [&_svg:last-child]:opacity-100 bg-background'

function FilterSelect({
  label, value, onChange, options, allLabel = 'All', includeAll = true, className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  allLabel?: string
  /** Chapter has no "All" — the chart plots one chapter at a time. */
  includeAll?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`${triggerClass} ${className ?? ''}`}>
        <span className="text-muted-foreground font-normal tracking-[-0.108px] shrink-0">{label}</span>
        <span className="font-medium text-foreground tracking-[-0.108px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {includeAll && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Page chrome: a grey field inset 24px, holding one centred white card.
 *
 * Same shell as the question detail page (app/(dashboard)/question/
 * [questionId]/page.tsx) — the grey is what separates the card from the
 * sidebar and top bar. Matches the Figma frame, which is itself a bordered
 * white card at 1280 wide with 24px padding and 16px gaps.
 *
 * No inner <main>: the dashboard layout already provides the scroll container,
 * and nesting a second one gives the page its own scrollbar.
 */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-[#fafaf9] flex flex-col">
      {/* 24px on every side. The card fills the width rather than being capped
          and centred — at 1280px on a wide screen the leftover grey gutters
          were wider than the padding itself. */}
      <div className="p-6 flex">
        <div className="bg-background border border-border rounded-2xl p-6 w-full flex flex-col gap-4">
          {children}
        </div>
      </div>
    </div>
  )
}

// Single-section series colours, from Figma 1550-20854: the exam trend uses
// --muted-foreground, the chapter bars --inferentics-analytic-brand-primary.
const TREND_COLOR = '#64748b'
const CHAPTER_COLOR = '#075133'
const SUBJECT_COLOR='#001B3D'

/** ExamAverage[] -> chart points, labelled with the friendly exam name. */
function examPoints(rows: ExamAverage[]): BandedBarPoint[] {
  return rows.map((row) => ({
    label: formatExamName(row.exam, { year: false }),
    value: row.average,
    // Papers differ in size across exams, so marksDetail states the marks
    // without a comparison here.
    detail: marksDetail(row, rows, 'average across exams'),
  }))
}

/** Every chapter's average in one section. */
function chapterPoints(rows: ChapterSectionAverages[], section: string): BandedBarPoint[] {
  return rows.map((row) => {
    const point = row.sections.find((s) => s.section === section)
    return {
      label: row.chapter,
      value: point?.average ?? null,
      // Peers here are other CHAPTERS, each out of a different total, so this
      // resolves to the marks alone — comparing them would rank chapters by
      // how many marks they carry rather than how well they were answered.
      detail: point ? marksDetail(point, [point]) : undefined,
    }
  })
}

/**
 * SectionAverage[] -> chart points, each with its comparison sentence.
 *
 * `compareAgainst` defaults to the plotted rows but can be widened: the
 * chapter card may be showing a single section, and "12 points above average"
 * has to mean above ALL sections, not above the one bar on screen.
 */
function toPoints(rows: SectionAverage[], compareAgainst: SectionAverage[] = rows): BandedBarPoint[] {
  return rows.map((row) => ({
    label: row.section,
    value: row.average,
    // Sections sit the same paper, so the marks comparison is sound here.
    detail: marksDetail(row, compareAgainst, 'average across sections'),
  }))
}

export default function SubjectDetailPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params)
  const subject = decodeURIComponent(subjectId)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { viewer, roleResolved } = useViewer()
  const { combos } = useAnalyticsFilters()

  // The directory links here with the grade it was showing; without it there
  // is no cohort to chart.
  const grade = searchParams.get('grade') ?? ''

  const [exam, setExam] = useState(ALL)
  const [section, setSection] = useState(ALL)
  // null = "whichever chapter comes first". Resolved against the loaded list
  // below rather than in an effect, so a chapter that disappears when the
  // filters change falls back instead of leaving an empty card.
  const [chapter, setChapter] = useState<string | null>(null)
  // The chapter card's own section scope, independent of the page-level one
  // so a chapter can be inspected section by section without narrowing the
  // Section performance overview above it.
  const [chapterSection, setChapterSection] = useState(ALL)

  // Parent + leaf, not just the leaf: usePageBreadcrumb REPLACES the whole
  // crumb, so registering the bare subject name dropped "Subjects" and left
  // the top bar reading only "Accountancy". Same shape as the exam detail
  // page's crumb.
  usePageBreadcrumb(
    <div className="flex items-center gap-1.5">
      <Link href="/subject" className="text-muted-foreground hover:text-foreground transition-colors">
        Subjects
      </Link>
      <ChevronRight className="size-4 text-muted-foreground" />
      <span className="text-foreground">{subject}</span>
    </div>,
    [subject],
  )

  // Same guard as the directory — a stale bookmark shouldn't render a
  // leadership screen for a teacher. Not a security boundary; the API is.
  const redirecting = roleResolved && !!viewer && !viewer.capabilities.view_subject_directory
  useEffect(() => {
    if (redirecting) router.replace('/dashboard')
  }, [redirecting, router])

  // A grade the viewer only teaches in has no leadership page; back to the
  // directory, which lands on a grade they lead.
  const ledCombos = combos ? seniorCombos(combos) : null
  const offLedGrade = !!ledCombos && !seniorGrades(ledCombos).includes(grade)
  useEffect(() => {
    if (offLedGrade) router.replace('/subject')
  }, [offLedGrade, router])

  const allSections = ledCombos ? sectionsForSubject(ledCombos, grade, subject) : []
  const allExams = ledCombos ? examsForSubject(ledCombos, grade, subject) : []
  const sections = section === ALL ? allSections : [section]
  const exams = exam === ALL ? allExams : [exam]

  // Stamped results again (see the directory): a role or filter change must
  // invalidate immediately rather than leaving the previous selection's bars
  // on screen until the new ones land.
  const requestKey =
    ledCombos && !offLedGrade && grade && sections.length && exams.length
      ? `${grade}|${subject}|${sections.join(',')}|${exams.join(',')}`
      : null
  // One section chosen: the page re-frames around it — the overview plots that
  // section across exams instead of across sections, and the chapter card
  // plots every chapter instead of one chapter across sections
  // (Figma 1550-20854).
  const singleSection = section !== ALL

  const [result, setResult] = useState<{
    key: string
    sectionRows: SectionAverage[] | null
    chapters: ChapterSectionAverages[] | null
    examRows: ExamAverage[] | null
  } | null>(null)

  useEffect(() => {
    if (!requestKey) return
    let ignore = false
    Promise.all([
      fetchSectionPerformance({ grade, subject, sections, exams }),
      // Always every section, not just the page-filtered one: the chapter
      // card's Section filter is independent, so it must be able to switch to
      // a section the page isn't showing without triggering a refetch.
      fetchChapterPerformance({ grade, subject, sections: allSections, exams }),
      // Only the single-section view plots a trend across exams, and the
      // Exam filter doesn't constrain it — picking one exam would collapse the
      // line to a single point, so it always spans the subject's exams.
      singleSection && exam === ALL
        ? fetchExamTrend({ grade, subject, section, exams: allExams })
        : Promise.resolve(null),
    ])
      .then(([sectionRows, chapters, examRows]) => {
        if (!ignore) setResult({ key: requestKey, sectionRows, chapters, examRows })
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, sectionRows: null, chapters: null, examRows: null })
      })
    return () => { ignore = true }
    // `sections`/`exams` are rebuilt each render; requestKey is their identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, grade, subject])

  const current = result && result.key === requestKey ? result : null
  const loading = current === null
  const failed = current?.sectionRows === null

  const chapters = current?.chapters ?? []
  // Derived, not stored: the selected chapter only holds while it's still in
  // the list for the current filters.
  const activeChapter = chapters.find((c) => c.chapter === chapter) ?? chapters[0] ?? null

  // The chapter card's section is its own, so you can hold the overview on one
  // section and read another section's chapters beside it. Until the card's
  // dropdown is touched it follows the page: the page-level section in
  // single-section mode, All otherwise.
  const activeChapterSection = allSections.includes(chapterSection)
    ? chapterSection
    : singleSection
      ? section
      : ALL
  const chapterRows =
    activeChapter === null
      ? []
      : activeChapterSection === ALL
        ? activeChapter.sections
        : activeChapter.sections.filter((s) => s.section === activeChapterSection)
  const chapterScopeText =
    activeChapterSection === ALL ? 'across each section' : `across section ${activeChapterSection}`

  // Whether the chart spans every section or just the chosen one — the
  // subtitle has to say which, or "Average score across each section" is a lie
  // as soon as the Section filter is narrowed.
  const scopeText = section === ALL ? 'across each section' : `across section ${section}`

  if (redirecting) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-[200px]" />
        <ChartSkeleton height={222} />
      </PageShell>
    )
  }

  if (!grade) {
    return (
      <PageShell>
        <p className="text-[14px] text-muted-foreground">
          No grade in the link, so there&apos;s no cohort to show. Open this subject from the Subjects page.
        </p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {/* Page header */}
      {/* Figma 1550:20533 — items-center, 8px gap; the selects sit centred
          against the two-line title block, not aligned to its first line. */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.144px] text-foreground">
            {subject}
          </h1>
          {/* The frame reads "Savannah Ng · Grade 8". There is no teacher
              endpoint (the API exposes students and rosters only), so the name
              is omitted rather than invented — see the note in the PR. */}
          <p className="text-[18px] font-medium leading-7 tracking-[-0.108px] text-muted-foreground">
            Grade {grade}
          </p>
        </div>
      </div>

      {failed && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          Couldn&apos;t load performance for this subject. Check your connection and try again.
        </div>
      )}

      {!failed && loading && (
        <div className="flex flex-col gap-4">
          <div className="border border-border rounded-xl bg-background p-6 space-y-4">
            <Skeleton className="h-7 w-[220px]" />
            <ChartSkeleton height={222} />
          </div>
          <div className="border border-border rounded-xl bg-background p-6 space-y-4">
            <Skeleton className="h-7 w-[260px]" />
            <ChartSkeleton height={222} />
          </div>
        </div>
      )}

      {!failed && !loading && current.sectionRows && (
        <div className="flex flex-col gap-4">
          {singleSection ? (
            /* One section: its average across exams. Bar for a single exam,
               line once there are two or more — a one-point line reads as a
               dot floating in space. */
            <BandedBarCard
              title="Section performance"
              subtitle={`Average score of ${section} on ${
      exam === ALL ? 'all exams' : formatExamName(exam)
    }`}
              kind={exam === ALL && (current.examRows ?? []).length > 1 ? 'line' : 'bar'}
              series={{ color: SUBJECT_COLOR, label: `${grade}-${section} average score` }}
              data={exam === ALL
    ? examPoints(current.examRows ?? [])
    : toPoints(current.sectionRows ?? [])}
              emptyText="No marked papers for this section yet."
              action={
      <div className="flex items-center gap-2">
        <FilterSelect
          label="Exam:"
          value={exam}
          onChange={setExam}
          options={allExams.map((e) => ({
            value: e,
            label: formatExamName(e),
          }))}
        />
        <FilterSelect
          label="Section:"
          value={section}
          onChange={setSection}
          options={allSections.map((s) => ({
            value: s,
            label: s,
          }))}
        />
      </div>
    }
            />
          ) : (
            <BandedBarCard
              title="Section performance"
              subtitle={`Average score of ${
    section === ALL ? 'all sections' : section
  } on ${
    exam === ALL ? 'all exams' : formatExamName(exam)
  }`}
  action={
    <div className="flex items-center gap-2">
      <FilterSelect
        label="Exam:"
        value={exam}
        onChange={setExam}
        options={allExams.map((e) => ({
          value: e,
          label: formatExamName(e),
        }))}
      />
      <FilterSelect
        label="Section:"
        value={section}
        onChange={setSection}
        options={allSections.map((s) => ({
          value: s,
          label: s,
        }))}
      />
    </div>
  }
              data={toPoints(current.sectionRows)}
            />
          )}

          {/* One chapter at a time, switched from the card's own header —
              a subject can carry a dozen chapters, and stacking a chart for
              each buries the section overview above them. */}
          {singleSection ? (
            <BandedBarCard
              title="Chapter performance"
              subtitle={`Average score across section ${activeChapterSection}`}
              kind="bar"
              series={{ color: CHAPTER_COLOR, label: 'Chapter average' }}
              valueLabel={`${activeChapterSection} section avg`}
              data={chapterPoints(chapters, activeChapterSection)}
              emptyText="No chapter-level analysis for this section yet."
              action={
                // setChapterSection, not setSection — this dropdown moves only
                // this card, leaving the exam trend above on its own section.
                // No "All": every chapter is already on the axis, so an
                // all-sections view would need grouped bars, not this chart.
                <FilterSelect
                  label="Section:"
                  value={activeChapterSection}
                  onChange={setChapterSection}
                  includeAll={false}
                  options={allSections.map((s) => ({ value: s, label: s }))}
                />
              }
            />
          ) : activeChapter ? (
            <BandedBarCard
              title={`${activeChapter.chapter} performance`}
              subtitle={`Average score ${chapterScopeText}`}
              // Plot the chosen section, but compare against every section —
              // otherwise a single-section view says "level with the average",
              // comparing the bar with itself.
              data={toPoints(chapterRows, activeChapter.sections)}
              action={
                <div className="flex items-center gap-2">
                  <FilterSelect
                    label="Chapter:"
                    value={activeChapter.chapter}
                    onChange={setChapter}
                    includeAll={false}
                    className="max-w-[280px]"
                    options={chapters.map((c) => ({ value: c.chapter, label: c.chapter }))}
                  />
                  <FilterSelect
                    label="Section:"
                    value={activeChapterSection}
                    onChange={setChapterSection}
                    options={allSections.map((s) => ({ value: s, label: s }))}
                  />
                </div>
              }
            />
          ) : (
            <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
              No chapter-level analysis for this subject yet.
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
