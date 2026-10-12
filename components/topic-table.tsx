'use client'

import { ChevronRight, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import { Skeleton } from '@/components/ui/skeleton'

// Placeholder row count while loading — enough to read as a table without
// implying how many chapters this exam will actually have.
const SKELETON_ROWS = [0, 1, 2, 3]

export interface TopicRow {
  id: number | string
  topic: string
  studentCount: number
  col2Value: string | number
  /**
   * What col2's hover shows, in place of just repeating col2Value. Without
   * it a "7.5" tooltip over a "7.5" cell told the reader nothing they didn't
   * already see — this is for a real explanation of what the number means
   * (e.g. how many students, on what kind of question). Falls back to
   * col2Value when omitted, so existing callers are unaffected.
   */
  col2Tooltip?: string
  whatGoingWrong: string
  whatToPractise: string
}

interface TopicTableProps {
  title: string
  subtitle?: string
  col2Label: string
  col2Width: string
  showDot?: boolean
  rows: TopicRow[]
  className?: string
  /**
   * While the rows are still being fetched: renders placeholder rows at the
   * real row height instead of an empty tbody. Without it "still loading" and
   * "this exam has no remediation data" are the same blank table, and the card
   * jumps in height when the data lands (same reasoning as SectionAverageCard's
   * `loading`, beaver#786).
   */
  loading?: boolean
  /**
   * Shown in place of the rows once loading has finished and there are none.
   * Opt-in: the student pages share this table and keep their existing blank
   * body unless they pass one.
   */
  emptyMessage?: string
  onView?: (row: TopicRow) => void
  /** Rows that actually open something. Without it, every row opens. */
  canOpenRow?: (row: TopicRow) => boolean
  /**
   * What `studentCount` counts. The exam page counts students; the student
   * page counts that one student's questions, where "1 Student" on every row
   * was just wrong.
   *
   * `null` hides the line entirely. The student view uses it: "4 Students"
   * under a chapter is ambiguous there — 4 students losing marks in the
   * chapter, or 4 students making THIS row's dominant error? (Product call,
   * 2026-08-13.) Hiding beats a number with two readings.
   */
  countLabel?: string | null
  /**
   * Hides the "What is going wrong" column. The student exam page's scoring
   * table uses it: with the marks self-scoped (aggregatedData#447), that
   * column still carried the SECTION's dominant error — class-grain text
   * beside personal-grain numbers, on a page that reads as being about the
   * student. There is no per-student source for it yet
   * (question_errortype_summary has no per-student rows), so the column is
   * hidden rather than filled with someone else's diagnosis.
   */
  showGoingWrong?: boolean
}

export function TopicTable({
  title,
  subtitle,
  col2Label,
  col2Width,
  showDot = false,
  rows,
  className,
  loading = false,
  emptyMessage,
  onView,
  canOpenRow,
  countLabel = 'Student',
  showGoingWrong = true,
}: TopicTableProps) {
  return (
    <div
      className={cn(
        'bg-background border border-border rounded-xl overflow-hidden isolate',
        className,
      )}
    >
      <div className="relative z-[1] w-full bg-background border border-border rounded-bl-lg rounded-br-lg shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">

        <div className="px-6 pt-6 pb-3">
          <p className="text-xl font-semibold leading-7 font-['Inter'] text-foreground">
            {title}
          </p>
          {subtitle && (
            <p className="text-lg font-normal leading-7 font-['Inter'] text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="border border-sidebar-border rounded-xl overflow-hidden">
            <TooltipProvider delayDuration={300}>
              <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">

                <thead>
                  <tr className="bg-[#f0fdf4]">
                    <th className="px-4 py-3 text-left text-lg font-medium leading-7 text-foreground border-b border-[#e2e8f0] h-[52px] w-[208px] align-middle">
                      Chapter / Topic
                    </th>
                    <th
                      className={cn(
                        'px-4 py-3 text-left text-lg font-medium leading-7 text-foreground border-b border-[#e2e8f0] h-[52px] align-middle whitespace-nowrap',
                        col2Width,
                      )}
                    >
                      {col2Label}
                    </th>
                    {showGoingWrong && (
                    <th className="px-4 py-3 text-left text-lg font-medium leading-7 text-foreground border-b border-[#e2e8f0] h-[52px] align-middle">
                      <div className="flex items-center gap-2">
                        What is going wrong
                        <ChevronsUpDown className="size-4 shrink-0 opacity-0" />
                      </div>
                    </th>
                    )}
                    <th className="px-4 py-3 text-left text-lg font-medium leading-7 text-foreground border-b border-[#e2e8f0] h-[52px] align-middle">
                      <div className="flex items-center gap-2">
                        What to practise
                        <ChevronsUpDown className="size-4 shrink-0 opacity-0" />
                      </div>
                    </th>
                    <th className="bg-[#f0fdf4] border-b border-[#e2e8f0] h-[52px] w-[101px]" />
                  </tr>
                </thead>

                <tbody>
                  {loading && SKELETON_ROWS.map((i) => (
                    <tr key={`skeleton-${i}`} className="bg-background">
                      <td className="px-4 py-3 border-t border-b border-[#e2e8f0] h-[72px] w-[208px] align-top">
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-[16px] w-[140px]" />
                          <Skeleton className="h-[12px] w-[70px]" />
                        </div>
                      </td>
                      <td className={cn('px-4 py-3 border-t border-b border-[#e2e8f0] h-[72px] align-top', col2Width)}>
                        <Skeleton className="h-[16px] w-[48px]" />
                      </td>
                      {showGoingWrong && (
                      <td className="px-4 py-3 border-t border-b border-[#e2e8f0] align-top">
                        <Skeleton className="h-[16px] w-full max-w-[260px]" />
                      </td>
                      )}
                      <td className="px-4 py-3 border-t border-b border-[#e2e8f0] align-top">
                        <Skeleton className="h-[16px] w-full max-w-[260px]" />
                      </td>
                      <td className="p-4 border-t border-b border-[#e2e8f0] w-[101px] h-[72px]">
                        <div className="flex items-center justify-end h-full">
                          <Skeleton className="h-8 w-[62px]" />
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Loaded, but this exam genuinely has nothing to show. Said
                      plainly, so it can't be mistaken for a stuck load. */}
                  {!loading && rows.length === 0 && emptyMessage && (
                    <tr className="bg-background">
                      <td
                        colSpan={showGoingWrong ? 5 : 4}
                        className="px-4 py-3 border-t border-b border-[#e2e8f0] h-[72px] text-center text-[16px] font-normal leading-[24px] text-muted-foreground"
                      >
                        {emptyMessage}
                      </td>
                    </tr>
                  )}

                  {!loading && rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={onView && (canOpenRow?.(row) ?? true) ? () => onView(row) : undefined}
                      className={`bg-background${
                        onView && (canOpenRow?.(row) ?? true) ? ' cursor-pointer hover:bg-[#fafafa]' : ''
                      }`}
                    >

                      {/* Chapter / Topic */}
                      <td className="px-4 py-3 border-t border-b border-[#e2e8f0] h-[72px] w-[208px] align-top">
                        <div className="flex items-start gap-2">
                          {showDot && (
                            <div className="size-3 rounded-[4px] bg-[#16a34a] shrink-0 mt-[4px]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-[16px] font-medium leading-[24px] text-foreground overflow-hidden text-ellipsis whitespace-nowrap cursor-default">
                                  {row.topic}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[280px] text-wrap">
                                {row.topic}
                              </TooltipContent>
                            </Tooltip>
                            {countLabel != null && (
                              <p className="text-[14px] font-normal leading-[20px] text-muted-foreground">
                                {row.studentCount} {countLabel}{row.studentCount === 1 ? '' : 's'}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Col 2 */}
                      <td
                        className={cn(
                          'px-4 py-3 border-t border-b border-[#e2e8f0] h-[72px] align-top',
                          col2Width,
                        )}
                      >
                        <CellTooltip
                          content={row.col2Tooltip ?? row.col2Value}
                          className="block text-[14px] font-medium leading-[20px] tracking-[-0.084px] text-foreground"
                        >
                          {row.col2Value}
                        </CellTooltip>
                      </td>

                      {/* What is going wrong */}
                      {showGoingWrong && (
                      <td className="px-4 py-3 border-t border-b border-[#e2e8f0] align-top">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-[16px] font-normal leading-[24px] text-foreground cursor-default">
                              {row.whatGoingWrong}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[320px] text-wrap">
                            {row.whatGoingWrong}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      )}

                      {/* What to practise */}
                      <td className="px-4 py-3 border-t border-b border-[#e2e8f0] align-top">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-[16px] font-normal leading-[24px] text-foreground cursor-default">
                              {row.whatToPractise}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[320px] text-wrap">
                            {row.whatToPractise}
                          </TooltipContent>
                        </Tooltip>
                      </td>

                      {/* View button — only when there is something to open */}
                      <td className="p-4 border-t border-b border-[#e2e8f0] w-[101px] h-[72px]">
                        <div className="flex items-center justify-end h-full">
                          {onView && (canOpenRow?.(row) ?? true) && (
                          <button
                            type="button"
                            onClick={() => onView(row)}
                            className="flex items-center gap-2 border border-border rounded-[6px] h-8 px-2 bg-background hover:bg-muted/50 transition-colors"
                          >
                            <span className="text-[12px] font-medium leading-[16px] tracking-[-0.072px] text-foreground">
                              View
                            </span>
                            <ChevronRight className="size-4 text-foreground" />
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  )
}
