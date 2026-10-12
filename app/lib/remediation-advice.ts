/**
 * "What to practise" / "What to re-teach" derived from a chapter's dominant
 * error type.
 *
 * The remediation endpoint gives each chapter a `dominantError` — the most
 * frequent `question_errortype_summary.error_type_name` across its questions,
 * which is heron's classification of the answers themselves. These are the
 * eight types the taxonomy actually produces; the advice is per type, so a
 * chapter where students mostly misread the question no longer gets the same
 * sentence as one where the method itself is wrong (both previously read
 * "Re-practise the frequently-missed question types in this chapter.").
 *
 * Unknown or missing type -> null, and the caller shows the same em dash it
 * already shows for an unknown dominant error. Nothing is invented.
 */

type Advice = { practise: string; classPractise: string; reteach: string }

// `practise` is read by the STUDENT, often one who scored 10/80, so it is
// written for them (beaver#921): short everyday words, spoken to the student
// ("you"), no jargon ("execution", "recall", "notation", "earlier-year
// technique"), at most two short sentences, ending in something they can do.
// `classPractise` is the same advice as a teacher reads it about the class
// (the teacher exam page's scoring card and drawer), and `reteach` is the
// teacher's own action; both keep their professional wording.

// Wording is deliberately subject-neutral — the same eight types classify
// every subject's answers, so "sums", "formulas" and "arithmetic" (all
// previously baked into this copy) read as a Maths-specific diagnosis under
// Biology, Accountancy or Social Science. Reworded to the subject-agnostic
// terms already used elsewhere here: "questions", "facts", "working".
const ADVICE: Record<string, Advice> = {
  conceptual: {
    practise: 'Go back to the main idea of this chapter and make sure you understand it before you do more questions.',
    classPractise: 'Revisit the underlying idea before attempting more questions — the method is failing because the concept is.',
    reteach: 'Re-teach this concept from first principles; the errors are in understanding, not execution.',
  },
  'procedural-syllabus': {
    practise: 'Practise the questions of this chapter step by step, and write down every step.',
    classPractise: 'Drill the standard method for this chapter step by step, writing every step out.',
    reteach: 'Re-demonstrate the standard procedure, marking each step separately so lost steps show up.',
  },
  'procedural-background': {
    practise: 'Some of these mistakes come from basics you learnt in earlier classes. Revise those basics first, then practise this chapter.',
    classPractise: 'Shore up the earlier-year technique this chapter depends on before practising the chapter itself.',
    reteach: 'Revise the prerequisite technique first — the gap is below this chapter, not in it.',
  },
  factual: {
    practise: 'Learn the key facts, words and formulas of this chapter until you can remember them correctly.',
    classPractise: 'Rehearse the facts, terms and standard values for this chapter until recall is exact.',
    reteach: 'Drill fact and definition recall; the working is sound once the right fact is used.',
  },
  comprehension: {
    practise: 'Read each question slowly and underline what it asks before you start writing.',
    classPractise: 'Read and underline exactly what each question asks before solving it.',
    reteach: 'Practise interpreting question wording — answers are correct for a different question.',
  },
  representational: {
    practise: 'Practise drawing the diagrams and graphs of this chapter, write symbols clearly, and label everything.',
    classPractise: 'Practise the diagrams, graphs and notation for this chapter, labelling everything.',
    reteach: 'Model correct notation and figures; the reasoning is being lost in how it is written.',
  },
  analytical: {
    practise: 'Explain why each step is true. Do not jump to the answer, and check every possibility, not just the easy one.',
    classPractise: 'Practise working through every case and justifying each conclusion, not just the obvious one.',
    reteach: 'Model complete case analysis and reasoning structure; conclusions are being asserted, not shown.',
  },
  slip: {
    practise: 'Your method is right. Slow down and check your work for small mistakes.',
    classPractise: 'Slow down and re-check the working — the method is right, the execution slips.',
    reteach: 'Build a checking habit into class work; these are careless losses, not gaps.',
  },
}

function lookup(dominantError: string | null | undefined): Advice | null {
  if (!dominantError) return null
  return ADVICE[dominantError.trim().toLowerCase()] ?? null
}

/** Student-facing action for a chapter, spoken to the student. Null when the type is unknown. */
export function practiseFor(dominantError: string | null | undefined): string | null {
  return lookup(dominantError)?.practise ?? null
}

/** What the class should practise, worded for the teacher reading it. */
export function practiseForClass(dominantError: string | null | undefined): string | null {
  return lookup(dominantError)?.classPractise ?? null
}

/** Teacher-facing action for a chapter. Null when the type is unknown. */
export function reteachFor(dominantError: string | null | undefined): string | null {
  return lookup(dominantError)?.reteach ?? null
}

/**
 * The student's practise line once we know which earlier-class skill their
 * mistakes in this chapter come from (beaver#921 item 3): names the skill,
 * the class and the chapter instead of "revise the basics from earlier
 * classes". When the chapter's main problem is something else, the usual
 * advice stays first and the earlier-class skill is added after it.
 */
export function practiseWithPrerequisite(
  dominantError: string | null | undefined,
  pre: { grade: number; chapter: string | null; skill: string } | null | undefined,
): string | null {
  const base = practiseFor(dominantError)
  if (!pre?.skill || !pre.grade) return base
  const where = `Class ${pre.grade}${pre.chapter ? ` (${pre.chapter})` : ''}`
  if ((dominantError ?? '').trim().toLowerCase() === 'procedural-background' || !base) {
    return `Revise ${pre.skill} from ${where} first, then practise this chapter.`
  }
  return `${base} Also revise ${pre.skill} from ${where}.`
}
