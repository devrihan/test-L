'use client'

import { useState } from 'react'
import { AnalysisChart } from './analysis-chart'
import { PerformanceTab } from './performance-tab'
import { AnalysisChapterTable } from './analysis-chapter-table'
import { useLoggedInStudent } from '@/app/lib/student-identity'
import type { AnalyticsFilters } from '@/app/lib/filters'
import type { CropStudentContext } from '@/app/lib/answer-crops'
import { useFeatureFlag } from '@/components/config-provider'

type PersonalChartTab = 'question' | 'chapter'

export function StudentAnalysisTab({ examCtx }: { examCtx?: AnalyticsFilters }) {
  // beaver#644 — student-role own analysis tab; hide the Question/PerformanceTab panel.
  const showQuestionPerformance = useFeatureFlag('show_question_performance_student_analysis_page')
  const [tab, setTab] = useState<PersonalChartTab>('question')
  const student = useLoggedInStudent()

  // The logged-in student's own scanned answers for this exam: who (grade/
  // section/roll) from the resolved identity, which exam (subject/exam) from
  // the exam context. Undefined until both resolve → PerformanceTab placeholder.
  const cropContext: CropStudentContext | undefined =
    student && examCtx
      ? {
          grade: student.grade ?? examCtx.grade,
          section: student.section ?? examCtx.section,
          subject: examCtx.subject,
          exam: examCtx.exam,
          roll: String(student.rollNumber),
          admissionNo: student.admissionNo,
        }
      : undefined

  return (
    <div className="mt-6 flex flex-col gap-6">
      <AnalysisChart
        tab={tab}
        onTabChange={(t) => setTab(t as PersonalChartTab)}
        variant="personal"
        personalContext={cropContext}
      />

      {tab === 'question' ? (
        showQuestionPerformance && (
          <PerformanceTab showExamsFilter={false} cropContext={cropContext} />
        )
      ) : (
        <AnalysisChapterTable
          context={examCtx}
          disableQuestionLinks
          variant="student"
          studentContext={cropContext}
        />
      )}
    </div>
  )
}
