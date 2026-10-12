import { studentErrorTypeLabel } from '@/app/lib/error-type-labels'

// One FIXED colour per kind of mistake, shared by every student-facing bar
// (Home, the chapter page's section card and its own-mistakes block). It used
// to be a palette indexed by order of first appearance in each list, so
// "Mistake in the steps" was green where it happened to come first and purple
// where it came fourth — the same type in three colours on one page. The
// mapping is by taxonomy name; a type not listed (a future bucket) falls back
// to the palette by stable hash of its name, never to a per-list index.
export const MISTAKE_TYPE_COLOR_BY_NAME: Record<string, string> = {
  Conceptual: '#f59e0b',              // Concept mix-up
  'Procedural-Syllabus': '#3b82f6',   // Mistake in the steps
  'Procedural-Background': '#a855f7', // Foundational gap
  Slip: '#14b8a6',                    // Small slip
  Comprehension: '#16a34a',           // Misread or incomplete answer
  Factual: '#ef4444',                 // Fact or formula recall
  Analytical: '#ec4899',              // Incomplete reasoning
  Representational: '#64748b',        // Notation & presentation
}
export const MISTAKE_TYPE_COLORS = ['#16a34a', '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#64748b', '#ec4899']
export const OTHER_TYPE_COLOR = '#94a3b8'

// Every bar and legend lists the kinds in ONE fixed order, most serious
// first: the deepest fix (an earlier-class skill) down to the cheapest (a
// slip). Bars used to follow order of first appearance, so the same page
// showed the kinds shuffled differently on each card. 'Other' always last.
export const MISTAKE_TYPE_SEVERITY: string[] = [
  'Procedural-Background', // Foundational gap
  'Conceptual',            // Concept mix-up
  'Factual',               // Fact or formula recall
  'Analytical',            // Incomplete reasoning
  'Procedural-Syllabus',   // Mistake in the steps
  'Comprehension',         // Misread or incomplete answer
  'Representational',      // Notation & presentation
  'Slip',                  // Small slip
]

/** Sort key: position in MISTAKE_TYPE_SEVERITY; unknown kinds after the
 * known ones, null ('Other') last. */
export function mistakeTypeRank(type: string | null | undefined): number {
  if (!type) return MISTAKE_TYPE_SEVERITY.length + 1
  const i = MISTAKE_TYPE_SEVERITY.indexOf(type)
  return i < 0 ? MISTAKE_TYPE_SEVERITY.length : i
}

/** The colour for a kind of mistake — the same everywhere it is drawn. Null /
 * unknown-and-empty → the 'Other' grey. */
export function mistakeTypeColor(type: string | null | undefined): string {
  if (!type) return OTHER_TYPE_COLOR
  const hit = MISTAKE_TYPE_COLOR_BY_NAME[type]
  if (hit) return hit
  let h = 0
  for (const c of type) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return MISTAKE_TYPE_COLORS[h % MISTAKE_TYPE_COLORS.length]
}

/** Legend rows for a list of section mistakes: one per error type present, in
 * severity order (MISTAKE_TYPE_SEVERITY), plus 'Other' last for the rows
 * whose pattern resolved to no taxonomy type. `value` drives the bar's
 * segment width. */
export function mistakeTypeLegend(
  mistakes: { errorTypeName?: string | null }[],
  colorFor: (type: string | null | undefined) => string = mistakeTypeColor,
): { label: string; color: string; value: number }[] {
  const types = Array.from(new Set(mistakes.map((m) => m.errorTypeName).filter((t): t is string => !!t)))
    .sort((a, b) => mistakeTypeRank(a) - mistakeTypeRank(b))
  const rows = types.map((t) => ({
    label: studentErrorTypeLabel(t),
    color: colorFor(t),
    value: mistakes.filter((m) => m.errorTypeName === t).length,
  }))
  const other = mistakes.filter((m) => !m.errorTypeName).length
  return other ? rows.concat([{ label: 'Other', color: OTHER_TYPE_COLOR, value: other }]) : rows
}
