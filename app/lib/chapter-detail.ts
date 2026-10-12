// Chapter detail data for the /chapter/[chapterId] page.
//
// Backed by aggregatedData GET /api/chapter-details (analytics — populated for
// evaluated classes; returns real question text via "Questions from this
// Chapter"). Note two JSON keys contain spaces.

import { apiGet, AGGREGATED_API_BASE } from './api'
import { fetchPaperQuestions } from './questions'
import type { AnalysisDetailData } from '@/components/analysis-detail-sheet'

interface ChapterQuestionStat {
  questionId: number | null
  questionNumber: number
  questionText: string
  concept: string | null
  marks: number
  rightCount: number
  partialCount: number
  wrongAndBlankCount: number
}
interface ErrorTypeStat {
  errorType: string
  marksLost: number
  percentage: string
}
interface ChapterDetailsRaw {
  performanceSummary: {
    chapterName: string
    chapterAccuracy: string
    chapterStatus: string
    // AI-authored copy (chapter_summary.status_title/_description) — null
    // until populated; we fall back to the computed status/insight.
    statusTitle?: string | null
    statusDescription?: string | null
    // Per-view AI copy — absent/null until the backend populates it; callers
    // fall back per view. Student Login Metrics 7 spec: status_title_by_exam /
    // status_title_by_concept etc.; the teacher "By Concept" spec maps the
    // same keys onto the class-level columns (class_status_title_by_concept /
    // class_status_description_by_concept).
    statusTitleByExam?: string | null
    statusDescriptionByExam?: string | null
    statusTitleByConcept?: string | null
    statusDescriptionByConcept?: string | null
    totalQuestionsInChapter: number
    commonError?: { type: string; percentage: string }
  }
  chapterInsights: string[]
  errorTypeBreakdown: ErrorTypeStat[]
  'Questions from this Chapter': ChapterQuestionStat[]
}

/** One chapter question's number + concept tag (for concept-level rollups). */
export interface ChapterQuestionRef {
  number: number
  concept: string | null
}

export interface ChapterDetail {
  name: string
  status: string
  statusDescription: string
  // AI per-view status for the By Concept graph (spec: status_title_by_concept;
  // class_status_title_by_concept for the teacher/class view) — null until the
  // backend populates it; callers show an honest fallback (e.g. keep the
  // exam-level chapter summary).
  statusByConcept: { title: string; description: string } | null
  accuracy: string
  questionTags: string[] // ['Q3','Q7',…]
  questionData: Record<string, AnalysisDetailData>
  questions: ChapterQuestionRef[]
}

const ERR_COLORS = ['#ffa940', '#db6861', '#16a34a', '#3b82f6']

function qLabel(n: number): string {
  return `Q${Number.isInteger(n) ? String(Math.trunc(n)) : String(n)}`
}

function toDetailData(
  q: ChapterQuestionStat,
  errors: ErrorTypeStat[],
  insights: string[],
  footerHref?: string,
): AnalysisDetailData {
  const total = q.rightCount + q.partialCount + q.wrongAndBlankCount
  const pct = total > 0 ? Math.round((q.rightCount / total) * 100) : 0
  return {
    title: q.questionText,
    fullText: q.questionText,
    subtitle: `Concept: ${q.concept ?? '—'} · Marks: ${q.marks}`,
    footerLabel: 'View question',
    footerHref,
    accuracy: { description: `${q.rightCount} of ${total} students scored full marks`, pct },
    errorDescription:
      q.wrongAndBlankCount > 0 && total > 0
        ? `${Math.round((q.wrongAndBlankCount / total) * 100)}% of responses were wrong or blank`
        : 'No incorrect responses recorded',
    errorSegments: errors.slice(0, 4).map((e, i) => ({
      color: ERR_COLORS[i % ERR_COLORS.length],
      pct: Number.parseFloat(e.percentage) || 0,
    })),
    errorLegend: errors.slice(0, 4).map((e, i) => ({
      color: ERR_COLORS[i % ERR_COLORS.length],
      label: e.errorType,
    })),
    bullets: insights.slice(0, 3),
  }
}

export async function fetchChapterDetail(params: {
  grade: string
  chapterName: string
  section: string
  subject: string
  exam?: string
}): Promise<ChapterDetail | null> {
  try {
    const [raw, paperQuestions] = await Promise.all([
      apiGet<ChapterDetailsRaw>(AGGREGATED_API_BASE, '/api/chapter-details', {
        grade: params.grade,
        chapterName: params.chapterName,
        section: params.section,
        subject: params.subject,
        exam: params.exam,
      }),
      params.exam
        ? fetchPaperQuestions({ grade: params.grade, section: params.section, subject: params.subject, exam: params.exam }).catch(() => [])
        : Promise.resolve([]),
    ])
    const ctxQs = new URLSearchParams({
      grade: params.grade,
      section: params.section,
      subject: params.subject,
      ...(params.exam ? { exam: params.exam } : {}),
    }).toString()

    const ps = raw.performanceSummary
    const questions = raw['Questions from this Chapter'] ?? []
    // The endpoint answers from the answers-spine tables, which cover a
    // different (smaller) set of exams than the scanned-marks tables the rest
    // of the page reads. For a scope it has no rows for, it still returns 200
    // with a zeroed summary — whose 0% accuracy maps to the "RETEACH NOW"
    // status. Treat "knows no questions" as "has no analytics": returning
    // null here lets the page show its honest "No analytics yet" state
    // instead of a false red verdict beside a real trend chart (beaver#612).
    // Exception: if a real pre-computed AI summary is present, keep it — the
    // spine being empty must not hide By-Exam/By-Concept copy that exists.
    // `status` still prefers statusTitle over the computed chapterStatus, so no
    // false "RETEACH NOW" leaks through.
    const hasAiSummary = !!(ps.statusTitleByExam ?? ps.statusTitle ?? ps.statusTitleByConcept)
    if (ps.totalQuestionsInChapter === 0 && questions.length === 0 && !hasAiSummary) return null
    const questionData: Record<string, AnalysisDetailData> = {}
    const subParts = new Map<string, ChapterQuestionStat[]>()
    for (const q of questions) {
      const footerHref = q.questionId != null ? `/question/${q.questionId}?${ctxQs}` : undefined
      questionData[qLabel(q.questionNumber)] = toDetailData(q, raw.errorTypeBreakdown ?? [], raw.chapterInsights ?? [], footerHref)
      const baseKey = `Q${Math.trunc(q.questionNumber)}`
      const parts = subParts.get(baseKey) ?? []
      parts.push(q)
      subParts.set(baseKey, parts)
    }
    const paperByBase = new Map<number, { texts: string[]; id: number | null }>()
    for (const pq of paperQuestions) {
      const base = Math.trunc(pq.questionNumber)
      const entry = paperByBase.get(base) ?? { texts: [], id: null }
      entry.texts.push(pq.questionText)
      if (entry.id == null && pq.id != null) entry.id = pq.id
      paperByBase.set(base, entry)
    }
    for (const [baseKey, parts] of subParts) {
      if (questionData[baseKey]) continue
      const baseNum = Math.trunc(parts[0].questionNumber)
      const paper = paperByBase.get(baseNum)
      const combinedText = paper && paper.texts.length > 1
        ? paper.texts.join('\n')
        : parts.map((p) => p.questionText).join('\n')
      const firstHref = parts[0].questionId != null ? `/question/${parts[0].questionId}?${ctxQs}` : undefined
      questionData[baseKey] = {
        title: combinedText,
        fullText: combinedText,
        subtitle: `Marks: ${parts.reduce((s, p) => s + p.marks, 0)}`,
        footerLabel: 'View question',
        footerHref: firstHref,
        accuracy: questionData[qLabel(parts[0].questionNumber)]?.accuracy ?? { description: '', pct: 0 },
        errorDescription: '',
        errorSegments: [],
        errorLegend: [],
        bullets: [],
      }
    }
    return {
      name: ps.chapterName,
      // By-exam view prefers the per-view AI field, then the chapter AI field,
      // then the computed status — never invented copy.
      status: ps.statusTitleByExam ?? ps.statusTitle ?? ps.chapterStatus,
      statusDescription:
        ps.statusDescriptionByExam ?? ps.statusDescription ?? (raw.chapterInsights ?? [])[0] ?? '',
      statusByConcept: ps.statusTitleByConcept
        ? { title: ps.statusTitleByConcept, description: ps.statusDescriptionByConcept ?? '' }
        : null,
      accuracy: ps.chapterAccuracy,
      questionTags: Array.from(new Set(questions.map((q) => `Q${Math.trunc(q.questionNumber)}`))),
      questionData,
      questions: questions.map((q) => ({ number: q.questionNumber, concept: q.concept })),
    }
  } catch {
    return null
  }
}
