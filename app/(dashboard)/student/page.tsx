'use client'

import { useState, useEffect } from 'react'
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
import { ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import { fetchStudents, type StudentRow } from '@/app/lib/students'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { ApiError } from '@/app/lib/api'
import { useFeatureFlag } from '@/components/config-provider'
import { trackDrilldown } from '@/app/lib/analytics'
import { classificationEnabledFor, useClassifiedCohorts } from '@/app/lib/classification-scope'

export default function StudentPage() {
  // beaver#572 (students roster page) — error-classification-derived; hidden until it's trustworthy.
  const showCommonMistakeColumnFlag = useFeatureFlag('show_common_mistake_column_students_page')
  const classifiedCohorts = useClassifiedCohorts()
  const router = useRouter()

  const { combos, filters, setFilters } = useAnalyticsFilters()
  const showCommonMistakeColumn = showCommonMistakeColumnFlag && classificationEnabledFor(classifiedCohorts, filters?.grade, filters?.subject)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!filters) return
    let ignore = false
    setLoading(true)
    setError(null)
    fetchStudents(filters, combos ?? undefined)
      .then((rows) => {
        if (!ignore) setStudents(rows)
      })
      .catch((err: unknown) => {
        if (ignore) return
        setStudents([])
        setError(
          err instanceof ApiError && err.status === 0
            ? 'Could not reach the analytics service. Is aggregatedData running on :8082?'
            : err instanceof Error
              ? err.message
              : 'Failed to load students.',
        )
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [filters, combos])

  // Common-mistake column hidden until the AI field is populated (spec).
  // This is the data half of the gate: error classification lands one section
  // at a time while show_common_mistake_column_students_page is school-wide,
  // so a roster whose section hasn't been classified must not get an empty
  // column just because the flag is on.
  const showMistakes = students.some((s) => s.mistake !== null)

  // Carry the student's real name + the active filter context to the detail
  // page (the route only has the roll), so it shows the right student + crops.
  function goToStudent(s: StudentRow) {
    const p = new URLSearchParams({
      name: s.name,
      admission: s.admission ?? '',
      grade: filters?.grade ?? '',
      section: filters?.section ?? '',
      subject: filters?.subject ?? '',
      exam: filters?.exam ?? '',
    })
    // the detail page's Analysis graphs follow the list's exam scope
    if (filters?.examAll) p.set('examAll', 'true')
    if (filters?.year) p.set('year', filters.year)
    trackDrilldown('student')
    router.push(`/student/${s.roll.toLowerCase()}?${p.toString()}`)
  }

  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div className="min-w-[340px] shrink-0">
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            Students
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            Review chapter performance, weak areas and remediation needs.
          </p>
        </div>
        {combos && filters && (
          <PageFilters showExam allowAllExams combineGradeSection combos={combos} value={filters} onChange={setFilters} />
        )}
      </div>

      {/* Data status */}
      {loading && <TableSkeleton columns={8} />}
      {!loading && error && (
        <div className="border border-destructive/30 rounded-xl bg-destructive/5 px-4 py-6 text-[14px] text-destructive">
          {error}
        </div>
      )}
      {!loading && !error && students.length === 0 && (
        <div className="border border-sidebar-border rounded-xl bg-white px-4 py-6 text-[14px] text-muted-foreground">
          No students found for the selected filters.
        </div>
      )}

      {/* Students table */}
      {!loading && !error && students.length > 0 && (
      <div className="border border-sidebar-border rounded-xl overflow-hidden">
        <TooltipProvider delayDuration={300}>
        <Table>
          <TableHeader>
            <TableRow className="bg-green-50 hover:bg-green-50 border-sidebar-border">
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[100px]">
                Roll no.
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[220px]">
                Student name
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[100px]">
                Score
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[200px]">
                Strongest
              </TableHead>
              <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[200px]">
                Weakest
              </TableHead>
              {showCommonMistakeColumn && showMistakes && (
                <TableHead className="px-4 py-3 text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground h-auto w-[180px]">
                  Common mistake
                </TableHead>
              )}
              <TableHead className="px-4 py-3 h-auto w-[88px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => (
              <TableRow
                key={student.roll}
                className="border-sidebar-border hover:bg-muted/30 cursor-pointer bg-white"
                onClick={() => goToStudent(student)}
              >
                <TableCell className="px-4 py-3 text-[14px] leading-5 text-muted-foreground">
                  <CellTooltip content={student.roll}>{student.roll}</CellTooltip>
                </TableCell>
                <TableCell className="px-4 py-3 max-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block truncate text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground cursor-default">
                        {student.name}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[300px] text-wrap">
                      {student.name}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="px-4 py-3 text-[14px] leading-5 text-foreground">
                  <CellTooltip content={student.marks}>{student.marks}</CellTooltip>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-1 text-[14px] leading-5 text-foreground">
                    <ArrowUp className="size-4 shrink-0 text-emerald-600" />
                    <CellTooltip content={student.strongest} className="truncate max-w-[160px]">
                      {student.strongest}
                    </CellTooltip>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-1 text-[14px] leading-5 text-foreground">
                    <ArrowDown className="size-4 shrink-0 text-orange-500" />
                    <CellTooltip content={student.weakest} className="truncate max-w-[160px]">
                      {student.weakest}
                    </CellTooltip>
                  </div>
                </TableCell>
                {showCommonMistakeColumn && showMistakes && (
                  <TableCell className="px-4 py-3 max-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate text-[14px] leading-5 text-foreground cursor-default">
                            {student.mistake}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[300px] text-wrap">
                          {student.mistake}
                        </TooltipContent>
                      </Tooltip>
                      {student.extra > 0 && (
                        <span className="text-[14px] leading-5 text-blue-600 font-medium shrink-0">
                          +{student.extra}
                        </span>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell className="px-4 py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-[12px] h-8 px-3"
                    onClick={(e) => {
                      e.stopPropagation()
                      goToStudent(student)
                    }}
                  >
                    View
                    <ChevronRight className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TooltipProvider>
      </div>
      )}
    </div>
  )
}
