// Data for the leadership Answer scripts page (/answer-scripts).
//
// One card per PAPER — a (exam, subject) pair — for a single class. Not per
// sitting: a sitting spans subjects, so its marks and average would be three
// papers mashed together, and the detail page needs one subject to fetch by.

import { fetchCropRoster, type CropFilterCombo } from './answer-crops'
import { fetchExamInfo } from './questions'
import { logicalExamKey, formatExamName } from './filters'
import { sortExamsChronologically } from './subject-directory'

export interface ExamScriptSummary {
  /** raw exam id — embeds grade and subject, so it identifies the paper */
  examId: string
  /** friendly exam name, the card title */
  label: string
  subject: string
  /** paper date, ISO */
  date: string | null
  /** what the paper was out of */
  maxMarks: number | null
  /** class average as a percentage */
  average: number | null
  /** change in points from this SUBJECT's previous exam */
  trend: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

export async function fetchAnswerScriptSummaries(params: {
  combos: CropFilterCombo[]
  grade: string
  section: string
  /** limit to these sittings (by raw exam id); omit for all */
  exams?: string[]
}): Promise<ExamScriptSummary[]> {
  const { combos, grade, section, exams } = params
  const wanted = exams ? new Set(exams.map(logicalExamKey)) : null

  const papers = combos.filter(
    (c) => c.grade === grade && c.section === section && (!wanted || wanted.has(logicalExamKey(c.exam))),
  )
  // Chronological rank first, then the raw id — which starts grade_SUBJECT, so
  // one sitting's papers cluster together in subject order.
  const order = sortExamsChronologically([...new Set(papers.map((p) => p.exam))])
  const byExam = new Map(papers.map((p) => [p.exam, p]))

  const rows = await Promise.all(
    order.map(async (examId) => {
      const paper = byExam.get(examId) as CropFilterCombo
      const [roster, info] = await Promise.all([
        fetchCropRoster({ grade, section, subject: paper.subject, exam: examId }).catch(() => []),
        fetchExamInfo({ grade, section, subject: paper.subject, exam: examId }).catch(() => null),
      ])

      let marks = 0
      let max = 0
      for (const r of roster) {
        if (r.totalMarks == null || !r.totalMaxMarks) continue
        marks += r.totalMarks
        max += r.totalMaxMarks
      }
      const scanned = roster.map((r) => r.totalMaxMarks).filter((m): m is number => m != null && m > 0)

      return {
        examId,
        label: formatExamName(examId),
        subject: paper.subject,
        date: info?.examDate ?? null,
        maxMarks: info?.maxMarks ?? (scanned.length ? Math.round(Math.max(...scanned)) : null),
        average: max > 0 ? Math.round((marks / max) * 100) : null,
        trend: null as number | null,
      }
    }),
  )

  // Compare each paper with the same SUBJECT's previous exam — comparing
  // Maths against Science would be meaningless.
  const previousBySubject = new Map<string, number>()
  for (const row of rows) {
    const prev = previousBySubject.get(row.subject)
    if (row.average !== null && prev !== undefined) row.trend = round1(row.average - prev)
    if (row.average !== null) previousBySubject.set(row.subject, row.average)
  }

  return rows
}
