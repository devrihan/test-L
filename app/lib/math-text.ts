// Classification texts (what_went_wrong, evidence quotes, common-mistake
// patterns/descriptions) are hand-authored in ASCII math — "sqrt3", "x^2",
// "pi/4", "<=" — because the authoring agents write plain text. The dashboard
// renders these strings verbatim, so a student sees "sqrt3" where √3 is meant.
//
// This prettifier converts the ASCII conventions actually used in the corpus
// to their Unicode forms AT DISPLAY TIME. The stored data stays ASCII on
// purpose: it is the hand-authored source of truth, the authoring pipeline
// keeps producing ASCII, and a display transform is reversible where a bulk
// data rewrite is not. Applied in the two fetchers every consumer goes
// through (fetchRemediation, fetchStudentAnswerErrors) rather than per
// component.
//
// Every rule is guarded so prose is never touched: "pi" converts in "4pi/3"
// but not in "pivot" or "spin"; only the exponents that appear in the corpus
// (^2 ^3 ^4 ^-1) are superscripted.

const SUPERSCRIPTS: Record<string, string> = {
  '2': '²',
  '3': '³',
  '4': '⁴',
  '-1': '⁻¹',
}

export function prettifyMath(text: string): string {
  return (
    text
      // sin^-1, A^2, cos^2(theta/2), x^2-3 …
      .replace(/\^(-1|[234])/g, (m, exp: string) => SUPERSCRIPTS[exp] ?? m)
      // sqrt3, sqrt(2), 4sqrt3, sqrt-3 (entrywise root of a negative), sqrt 2
      .replace(/(?<![A-Za-z])sqrt\s?/g, '√')
      // pi in 4pi/3, pi/2 — but never inside a word (pivot, spin)
      .replace(/(?<![A-Za-z])pi(?![A-Za-z])/g, 'π')
      .replace(/(?<![A-Za-z])theta(?![A-Za-z])/g, 'θ')
      .replace(/(?<![A-Za-z])lambda(?![A-Za-z])/g, 'λ')
      .replace(/<=/g, '≤')
      .replace(/>=/g, '≥')
      .replace(/\+\/-|(?<![\w)])\+-(?=[\w√])/g, '±')
  )
}

/** prettifyMath for nullable fields, preserving null/undefined. */
export function prettifyMathOrNull<T extends string | null | undefined>(text: T): T {
  return (text == null ? text : prettifyMath(text)) as T
}
