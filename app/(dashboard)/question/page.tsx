'use client'

import { useState, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageFilters } from '@/components/page-filters'
import { TableSkeleton } from '@/components/page-skeletons'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { useViewer } from '@/app/lib/viewer'
import { useFeatureFlag } from '@/components/config-provider'
import { StudentQuestionPage } from '@/components/student-question-page'
import LatexPreview from '@/components/latex-preview'
import LatexInline from '@/components/latex-inline'
import { fetchQuestionGroups, type QuestionGroup } from '@/app/lib/questions'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { ApiError } from '@/app/lib/api'
import { formatExamName, matchesAcademicYear, byExamOrder } from '@/app/lib/filters'
import { trackDrilldown } from '@/app/lib/analytics'

// The backend returns the CBSE question type (MCQ/VSA/SA/LA…), not the Bloom
// level the design mocked. Colour by CBSE type with a neutral fallback; Bloom
// tagging is a Phase 3 gap (BACKEND_INTEGRATION_PLAN.md §5 #13).
const TYPE_STYLES: Record<string, string> = {
  MCQ:         'text-orange-600 bg-orange-50 border border-orange-200',
  VSA:         'text-blue-600 bg-blue-50 border border-blue-200',
  SA:          'text-green-600 bg-green-50 border border-green-200',
  LA:          'text-purple-600 bg-purple-50 border border-purple-200',
  CASE_STUDY:  'text-pink-600 bg-pink-50 border border-pink-200',
  // Bloom's taxonomy levels (the Type column shows bloomTaxonomy) — this
  // system only tags 4 levels: Knowledge, Understanding, Application, Skill.
  Knowledge:     'text-orange-600 bg-orange-50 border border-orange-200',
  Understanding: 'text-blue-600 bg-blue-50 border border-blue-200',
  Application:   'text-green-600 bg-green-50 border border-green-200',
  Skill:         'text-purple-600 bg-purple-50 border border-purple-200',
}
const TYPE_FALLBACK = 'text-slate-600 bg-slate-50 border border-slate-200'

export default function QuestionPage() {
  const { activeRole, roleResolved } = useViewer()
  // The same flag that removes Questions from the student sidebar also gates
  // the route. Hiding only the nav item left the page reachable by typed URL,
  // browser history, or a question link from the chapter surfaces — so the flag
  // hid the door and not the room.
  const showQuestionsNavStudent = useFeatureFlag('show_questions_nav_student')
  // activeRole falls back to TEACHER until the stored user is read
  // (viewer.tsx roleResolved), so without this gate the TEACHER body mounts
  // for one frame on a student login and fires its class-level fetches —
  // every one a 403 for a student token (console noise + wasted round trips).
  // Render nothing for that frame instead; the resolved role then mounts once.
  if (!roleResolved) return null
  if (activeRole === 'STUDENT') {
    if (!showQuestionsNavStudent) return <QuestionsNotAvailable />
    return <StudentQuestionPage />
  }
  return <TeacherQuestionPage />
}

/**
 * Shown when a student reaches /question while the Questions surface is turned
 * off for their school. Deliberately a plain message rather than a redirect —
 * a redirect makes a bookmarked link look broken, and a 404 would claim the
 * page does not exist when it does and is simply not enabled here.
 */
function QuestionsNotAvailable() {
  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl bg-stone-50">
      <div className="max-w-md">
        <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
          Questions
        </h1>
        <p className="mt-2 text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
          This section isn&apos;t available for your school yet.
        </p>
      </div>
    </div>
  )
}

// Teacher question list — wired to aggregatedData's GET /api/questions
// (see app/lib/questions.ts). Shows one group: the exam picked in the filters.
function TeacherQuestionPage() {
  const router = useRouter()
  // per-exam expand state; every group starts expanded
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { combos, filters, setFilters } = useAnalyticsFilters()
  const [groups, setGroups] = useState<QuestionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!filters || !combos) return
    let ignore = false
    setLoading(true)
    setError(null)
    // Spec: one expandable group per exam of the selected academic year.
    const yearExams = Array.from(
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
    ).sort(byExamOrder)
    setCollapsed(yearExams.length === 1 ? new Set() : new Set(yearExams))
    fetchQuestionGroups(filters, yearExams.length ? yearExams : [filters.exam])
      .then((gs) => {
        if (!ignore) setGroups(gs)
      })
      .catch((err: unknown) => {
        if (ignore) return
        setGroups([])
        setError(
          err instanceof ApiError && err.status === 0
            ? 'Could not reach the analytics service. Is aggregatedData running on :8082?'
            : err instanceof Error
              ? err.message
              : 'Failed to load questions.',
        )
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [filters, combos])

  // Carry the filter context so the detail page can fetch this question by id
  // and overlay analytics for the right section.
  function goToQuestion(qid: number, exam: string) {
    const p = new URLSearchParams({
      grade: filters?.grade ?? '',
      section: filters?.section ?? '',
      subject: filters?.subject ?? '',
      exam,
    })
    trackDrilldown('question')
    router.push(`/question/${qid}?${p.toString()}`)
  }

  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div className="min-w-[340px] shrink-0">
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            Pick a Question
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            Review each question’s performance 
          </p>
        </div>
        {combos && filters && (
          <PageFilters combineGradeSection combos={combos} value={filters} onChange={setFilters} />
        )}
      </div>

      {/* Data status */}
      {loading && <TableSkeleton columns={10} />}
      {!loading && error && (
        <div className="border border-destructive/30 rounded-xl bg-destructive/5 px-4 py-6 text-[14px] text-destructive">
          {error}
        </div>
      )}
      {!loading && !error && groups.length === 0 && (
        <div className="border border-sidebar-border rounded-xl bg-white px-4 py-6 text-[14px] text-muted-foreground">
          No questions found for the selected filters.
        </div>
      )}

      {/* Questions table */}
      {!loading && !error && groups.length > 0 && (
      <div className="border border-sidebar-border rounded-xl overflow-hidden">
        <TooltipProvider delayDuration={300}>
        {/* table-fixed: auto layout sizes columns from the body, so collapsing
            a group would drop its rows and visibly shift the header. */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-green-50 hover:bg-green-50 border-sidebar-border">
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[60px]">
                Q#
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[240px]">
                Questions
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[140px]">
                Chapter
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[110px]">
                Concept
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[130px]">
                Type
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[100px]">
                Difficulty
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[90px]">
                Class avg
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[70px]">
                Marks
              </TableHead>
              <TableHead className="px-4 py-3 h-auto w-[88px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
            <Fragment key={group.exam}>
              {/* Group header row — one per exam of the year */}
              <TableRow
                className="border-sidebar-border hover:bg-muted/30 cursor-pointer bg-white"
                onClick={() => setCollapsed((prev) => {
                  const next = new Set(prev)
                  if (next.has(group.exam)) next.delete(group.exam); else next.add(group.exam)
                  return next
                })}
              >
                <TableCell colSpan={9} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {!collapsed.has(group.exam)
                      ? <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    }
                    <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground">
                      {formatExamName(group.exam)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>

              {/* Question rows (only when expanded) */}
              {!collapsed.has(group.exam) && group.questions.map((q) => (
                <TableRow
                  key={q.id}
                  className="border-sidebar-border hover:bg-muted/30 cursor-pointer bg-white"
                  onClick={() => goToQuestion(q.id, group.exam)}
                >
                  <TableCell className="px-4 py-3 text-[14px] leading-5 text-muted-foreground">
                    <CellTooltip content={q.q}>{q.q}</CellTooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 max-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="truncate text-[14px] leading-5 text-foreground cursor-default">
                          <LatexInline text={q.title} />
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[400px] text-wrap">
                        {q.title.split('\n').map((line, i) => (
                          <LatexPreview key={i} text={line} />
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 max-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="truncate text-[14px] leading-5 text-foreground cursor-default">
                          {q.chapter}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[300px] text-wrap">
                        {q.chapter}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[14px] leading-5 text-foreground truncate max-w-[130px]">
                    <CellTooltip content={q.concept}>{q.concept}</CellTooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <CellTooltip content={q.bloomTaxonomy}>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-medium leading-4 ${TYPE_STYLES[q.bloomTaxonomy] ?? TYPE_FALLBACK}`}>
                        {q.bloomTaxonomy}
                      </span>
                    </CellTooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[14px] leading-5 text-foreground truncate max-w-[100px]">
                    <CellTooltip content={q.difficulty}>{q.difficulty}</CellTooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[14px] font-medium leading-5 text-foreground">
                    <CellTooltip content={`${q.avg}%`}>{q.avg}%</CellTooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[14px] leading-5 text-foreground">
                    <CellTooltip content={q.marks}>{q.marks}</CellTooltip>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-[12px] h-8 px-3"
                      onClick={(e) => {
                        e.stopPropagation()
                        goToQuestion(q.id, group.exam)
                      }}
                    >
                      View
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
            ))}
          </TableBody>
        </Table>
        </TooltipProvider>
      </div>
      )}
    </div>
  )
}
