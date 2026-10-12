'use client'

import { useSearchParams } from 'next/navigation'
import { PageFilters } from '@/components/page-filters'
import { PerformanceTab } from '@/components/performance-tab'
import { useFeatureFlag } from '@/components/config-provider'
import { useAnalyticsFilters } from '@/app/lib/use-analytics-filters'
import { useLoggedInStudent } from '@/app/lib/student-identity'
import type { CropStudentContext } from '@/app/lib/answer-crops'

export function StudentQuestionPage() {
  // Same panel, same student, same crop data as the one on the exam Analysis
  // tab (components/student-analysis-tab.tsx), so it answers to the same flag.
  // It was ungated here, which meant the flag hid the panel in one place and
  // left it fully visible in the other.
  const showQuestionPerformance = useFeatureFlag('show_question_performance_student_analysis_page')
  const { combos, filters, setFilters } = useAnalyticsFilters()
  const student = useLoggedInStudent()
  // beaver#674 — arriving from the chapter page's question badges: pre-select
  // that question instead of always defaulting to the first one.
  const initialQuestionLabel = useSearchParams().get('question') ?? undefined

  // The logged-in student's own scanned answers for the selected subject/exam.
  const cropContext: CropStudentContext | undefined =
    student && filters
      ? {
          grade: student.grade ?? filters.grade,
          section: student.section ?? filters.section,
          subject: filters.subject,
          exam: filters.exam,
          roll: String(student.rollNumber),
          admissionNo: student.admissionNo,
        }
      : undefined

  return (
    <div className="min-h-full px-sp-5xl py-sp-4xl space-y-sp-4xl bg-stone-50">
      {/* Page header */}
      <div className="flex items-start justify-between gap-sp-4xl">
        <div>
          <h1 className="text-[30px] font-semibold leading-[36px] tracking-[-0.225px] text-foreground">
            Answer Scripts
          </h1>
          <p className="text-[18px] font-medium leading-[28px] tracking-[-0.108px] text-muted-foreground">
            View your actual answer scripts, along with question text and teacher-written answer key
          </p>
        </div>

        {combos && filters && (
          <PageFilters showExam showSection={false} combos={combos} value={filters} onChange={setFilters} />
        )}
      </div>

      {showQuestionPerformance && (
        <PerformanceTab showExamsFilter={false} cropContext={cropContext} className="mt-0" initialQuestionLabel={initialQuestionLabel} />
      )}
    </div>
  )
}
