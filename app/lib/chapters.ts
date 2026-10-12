// Chapter analytics — data access for the Chapter list/detail pages.
//
// Sources (Teacher Metrics spec):
//   1. Chapter stats from scanned marks (exam-scoped, absolute marks + %).
//   2. The school's blueprint chapter names (no analytics, keeps the page non-blank).
//
// There is deliberately NO fallback to the answers-spine accuracy endpoints
// (v1 /api/chapters or /api/v2/accuracy/chapters). Not because the spine is
// stale — the ops bridge does load current scanned marks into it — but
// because the two paths compute different numbers from different denominators
// for the same scope, and a page that silently switches sources shows
// inconsistent analytics. Verified 23-07-26: every scope where scanned-marks
// stats are empty, v2 accuracy is empty too (same underlying gaps), so the
// fallback never had anything extra to show. Scanned marks or nothing
// (removed 23-07-26, Fahad-direct).

import { apiGet, AGGREGATED_API_BASE } from './api'
import { matchesAcademicYear, type AnalyticsFilters } from './filters'
import { fetchChapterStats, type CropFilterCombo } from './answer-crops'

/**
 * Row shape the Chapter list UI renders.
 */
export interface ChapterRow {
  id: string // URL-safe key derived from the chapter name — the detail page's
  // GET /api/chapter-details still looks chapters up by name, not an id.
  name: string
  classAvg: number | null // % — null = blueprint chapter with no analytics yet
  avgMarks: number | null // absolute class-average marks ('42' in '42/50 (84%)')
  status: string
  mainErrorType: string
  maxMarks: number | null
  date: string | null
  trend: string | null
}

/**
 * The exam scope the metrics spec asks for: the selected exam id, or — under
 * 'All Exams' — every exam of the cohort's selected academic year.
 * Exported for the student dashboard's chapter chart (beaver#694), which needs
 * the same scope for its per-student chapter aggregation.
 */
export function examScope(filters: AnalyticsFilters, combos?: CropFilterCombo[]): string[] {
  if (!filters.examAll) return [filters.exam]
  if (!combos) return []
  return Array.from(
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
  )
}

export async function fetchChapters(
  filters: AnalyticsFilters,
  combos?: CropFilterCombo[],
): Promise<ChapterRow[]> {
  // Primary source (Teacher Metrics spec): class average per chapter from
  // scanned marks — exam-scoped, absolute marks + %, per-exam max (or summed
  // across the year's exams under 'All Exams'). Chapters not tested in the
  // selected exam(s) simply don't come back.
  const exams = examScope(filters, combos)
  const stats = await fetchChapterStats({
    grade: filters.grade,
    section: filters.section,
    subject: filters.subject,
    exams,
  }).catch(() => [])
  if (stats.length > 0) {
    return stats
      .filter((c) => c.avgPct != null)
      .map((c) => ({
        id: encodeURIComponent(c.chapter),
        name: c.chapter,
        classAvg: c.avgPct,
        avgMarks: c.avgMarks,
        status: '',
        mainErrorType: '',
        maxMarks: c.chapterMax,
        date: null,
        trend: null,
      }))
  }

  // No scanned marks for this scope. Fall back to the school's blueprint
  // chapter names so the page isn't blank — no fake analytics.
  const blueprint = await fetchChapterBlueprint(filters.grade, filters.subject)
  return blueprint.map(toBlueprintRow)
}

/** Mirrors the aggregatedData /api/question-paper/chapter-blueprint row. */
interface ChapterBlueprintDTO {
  chapterNumber: number | null
  chapterName: string
  totalMarks: number | null
}

async function fetchChapterBlueprint(grade: string, subject: string): Promise<ChapterBlueprintDTO[]> {
  try {
    return await apiGet<ChapterBlueprintDTO[]>(
      AGGREGATED_API_BASE,
      '/api/question-paper/chapter-blueprint',
      { grade, subject },
    )
  } catch {
    return []
  }
}

function toBlueprintRow(bp: ChapterBlueprintDTO): ChapterRow {
  return {
    id: encodeURIComponent(bp.chapterName),
    name: bp.chapterName,
    classAvg: 0,
    avgMarks: null,
    status: '',
    mainErrorType: '',
    maxMarks: bp.totalMarks,
    date: null,
    trend: null,
  }
}
