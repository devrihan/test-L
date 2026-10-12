'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { StatCard } from '@/components/stat-card'
import { StatCardGridSkeleton } from '@/components/page-skeletons'
import { PageFilters } from '@/components/page-filters'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { useViewer } from '@/app/lib/viewer'
import { formatExamDate } from '@/app/lib/questions'
import { abbreviateExamName } from '@/app/lib/filters'
import { fetchAnswerScriptSummaries, type ExamScriptSummary } from '@/app/lib/answer-scripts'

// Leadership Answer scripts: one card per exam sitting for the selected class.
// The Grade-Sec picker is what makes "Class average" mean anything.


export default function AnswerScriptsPage() {
  const { combos, filters, setFilters, error, retry } = useAnalyticsFilters()



  // Results stamped with the request they answer, so a filter change can't
  // leave the previous class's cards on screen.
  const [result, setResult] = useState<{ key: string; rows: ExamScriptSummary[] | null } | null>(null)
  const [reload, setReload] = useState(0)

  // 'All Exams' selected means every sitting; otherwise just the chosen one.
  const examScope = filters?.examAll ? undefined : filters ? [filters.exam] : undefined
  const requestKey =
    combos && filters
      ? `${filters.grade}|${filters.section}|${examScope?.join(',') ?? 'all'}|${reload}`
      : null

  useEffect(() => {
    if (!requestKey || !combos || !filters) return
    let ignore = false
    fetchAnswerScriptSummaries({ combos, grade: filters.grade, section: filters.section, exams: examScope })
      .then((rows) => { if (!ignore) setResult({ key: requestKey, rows }) })
      .catch(() => { if (!ignore) setResult({ key: requestKey, rows: null }) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, combos])

  const current = result && result.key === requestKey ? result : null
  const loading = !error && current === null
  const failed = error || current?.rows === null
  const rows = current?.rows ?? []


  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      <div className="flex items-start justify-between gap-sp-4xl">
        <div className="min-w-[340px] shrink-0">
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            Answer scripts
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            Browse and analyse exams
          </p>
        </div>
        {combos && filters && (
          <PageFilters
            showExam
            allowAllExams
            showSubject={false}
            combineGradeSection
            combos={combos}
            value={filters}
            onChange={setFilters}
          />
        )}
      </div>

      {failed && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 flex items-center justify-between gap-4">
          <span className="text-[14px] text-muted-foreground">Couldn&apos;t load answer scripts. Check your connection and try again.</span>
          <button
            type="button"
            onClick={() => { retry(); setReload((n) => n + 1) }}
            className="shrink-0 h-8 px-3 rounded-md border border-border text-[12px] font-medium hover:bg-muted/50 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {!failed && loading && <StatCardGridSkeleton />}

      {!failed && !loading && rows.length === 0 && (
        <div className="border border-border rounded-lg bg-white px-4 py-6 text-[14px] text-muted-foreground">
          No exams found for this class.
        </div>
      )}

      {!failed && !loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-6">
          {rows.map((row) => (
            <StatCard
              key={row.examId}
              name={row.subject}
              subtitle={[
                abbreviateExamName(row.examId),
                formatExamDate(row.date)?.replace(',', ''),
                row.maxMarks != null ? `${row.maxMarks} marks` : null,
              ].filter(Boolean).join(' · ')}
              label="Class average"
              avg={row.average}
              trend={row.trend == null || row.trend === 0 ? null : `${Math.abs(row.trend)} from previous exam`}
              trendDown={(row.trend ?? 0) < 0}
              // The card's own subject, not the filter's — each card is one
              // paper now, and the filter row has no Subject picker.
              drilldownEntity="answer_script"
              href={`/answer-scripts/${encodeURIComponent(row.examId)}?${new URLSearchParams({
                grade: filters?.grade ?? '',
                section: filters?.section ?? '',
                subject: row.subject,
                exam: row.examId,
              }).toString()}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
