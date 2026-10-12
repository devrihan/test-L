// Student-facing names for the error-taxonomy type buckets.
//
// The DB keeps the taxonomy's own names ("Procedural-Syllabus") — they are
// shared vocabulary with the SMEs and the classification pipeline, and
// teachers see them as-is. But shown raw to a student they read as internal
// jargon (the same class of leak as taxonomy notes in what_went_wrong), so
// student surfaces translate them here. Display-layer only, like
// prettifyMath(): the stored value never changes.
//
// The names say what the type MEANS for the student. "Procedural-Syllabus"
// (right method from this year's syllabus, steps went wrong) reads as
// "Mistake in the steps"; "Procedural-Background" (an earlier-class skill
// gave way) as "Foundational gap".
const STUDENT_ERROR_TYPE_LABELS: Record<string, string> = {
  'Procedural-Syllabus': 'Mistake in the steps',
  'Procedural-Background': 'Foundational gap',
  Slip: 'Small slip',
  Comprehension: 'Misread or incomplete answer',
  Conceptual: 'Concept mix-up',
  // "Formula recall" was written when the taxonomy only covered G12 Maths. It
  // now spans nine subjects, and Factual is overwhelmingly NOT a maths bucket:
  // 2,829 of its 3,288 rows are other subjects — Physics 812, Science 603,
  // Social Science 481, Biology 435, against 459 for Maths and Applied Maths
  // together. A student who put the Congress of Vienna in the wrong year was
  // being told they had a formula-recall problem.
  Factual: 'Fact or formula recall',
  Analytical: 'Incomplete reasoning',
  Representational: 'Notation & presentation',
}

// Where the label stands alone as a title or subtitle, two buckets carry a
// clarifying parenthetical. In a distribution/legend row — or anywhere
// space-tight — the short form is used instead.
const STUDENT_ERROR_TYPE_TITLES: Record<string, string> = {
  ...STUDENT_ERROR_TYPE_LABELS,
  'Procedural-Background': 'Foundational gap (earlier-class skill)',
  Slip: 'Small slip (copying/sign/arithmetic)',
}

/** Short student-facing label — legends, distributions, space-tight spots.
 * Unknown names pass through title-cased so a future bucket degrades
 * readably, never as jargon with internal punctuation. */
export function studentErrorTypeLabel(typeName: string): string {
  const hit = STUDENT_ERROR_TYPE_LABELS[typeName]
  if (hit) return hit
  return typeName.charAt(0).toUpperCase() + typeName.slice(1).toLowerCase().replace(/-/g, ' ')
}

/** Full form for when the label stands alone as a title or subtitle — the
 * short label plus the clarifying parenthetical where one exists. */
export function studentErrorTypeTitle(typeName: string): string {
  return STUDENT_ERROR_TYPE_TITLES[typeName] ?? studentErrorTypeLabel(typeName)
}

// Some answers were classified against a code the author invented for that
// question rather than one from error_taxonomy — 2,137 rows across 169 codes,
// none of which resolve, so they arrive with errorTypeName AND errorLabel both
// empty. The student's own mistakes list then bucketed them as 'Other' and
// titled the card 'Q4', while the section's Common Mistakes list showed the
// very same error humanised ('Personalities roles mismatched'). One mistake,
// two names, and the student-facing one pretending it is uncategorised.
//
// A code's leading segment IS its taxonomy bucket. Checked against every row
// that stores both a code and a type: A->Analytical (2,440 rows),
// C->Conceptual (7,389), F->Factual (3,272), I->Comprehension (3,750),
// P->Procedural-Syllabus (8,244), PB->Procedural-Background (1,187),
// R->Representational (1,788), S->Slip (2,129) — deterministic but for 9 rows
// of the 8,253 under P. That recovers a real bucket for 73 of the 169 codes;
// the rest lead with a topic ('PROOF-', 'CONGRUENCE-') and keep no bucket,
// but can still be named instead of shown as a bare question number.
const CODE_PREFIX_TO_TYPE: Record<string, string> = {
  A: 'Analytical',
  C: 'Conceptual',
  F: 'Factual',
  I: 'Comprehension',
  P: 'Procedural-Syllabus',
  PB: 'Procedural-Background',
  R: 'Representational',
  S: 'Slip',
}

/** The taxonomy bucket a raw code belongs to, or null when its leading segment
 * names a topic rather than a category. Display-layer only — like
 * studentErrorTypeLabel(), the stored value never changes. */
export function errorTypeFromCode(code: string | null | undefined): string | null {
  if (!code) return null
  return CODE_PREFIX_TO_TYPE[code.split('-')[0]] ?? null
}

// A full SME code is SUBJECT-GRADE-CHAPTER-CATEGORY-DESCRIPTOR, e.g.
// SOCSCI-10-GEORESOURCES-R-MAP-SOIL-REGIONS-WRONG. Only the descriptor is
// meant for a reader; spelling out "Socsci 10 georesources r ..." is worse
// than the raw code. The taxonomy's own error_label is the right answer where
// a row exists, but the orphaned codes have no row, so strip the four
// bookkeeping segments and keep the descriptor.
const SME_CODE = /^[A-Z]+-\d+-[A-Z0-9]+-(?:PB|[ACFIPRS])-(?=[A-Z0-9])/

/** A readable name for a raw code, for the codes that have no bucket. Drops
 * the leading bookkeeping segments, hyphens to spaces, sentence-case — the
 * same degradation the Common Mistakes list applies, so both surfaces agree. */
export function humanizeErrorCode(code: string): string {
  const sme = code.replace(SME_CODE, '')
  const parts = sme.split('-')
  const rest = CODE_PREFIX_TO_TYPE[parts[0]] ? parts.slice(1) : parts
  const words = rest.join(' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
