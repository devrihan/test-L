'use client'

import { useState } from 'react'
import { AnalysisChart, type ChartTab } from './analysis-chart'
import { AnalysisQuestionTable }        from './analysis-question-table'
import { AnalysisChapterTable }         from './analysis-chapter-table'
import { AnalysisStudentTable }         from './analysis-student-table'
import type { AnalyticsFilters } from '@/app/lib/filters'

export function AnalysisTab({ context }: { context?: AnalyticsFilters }) {
  const [tab, setTab] = useState<ChartTab>('question')

  return (
    <div className="mt-6 flex flex-col gap-6">
      <AnalysisChart tab={tab} onTabChange={setTab} context={context} />

      {tab === 'question' && <AnalysisQuestionTable context={context} />}
      {tab === 'chapter'  && <AnalysisChapterTable context={context} />}
      {tab === 'student'  && <AnalysisStudentTable context={context} />}
    </div>
  )
}
