// Which (grade, subject) cohorts have error classification turned on.
//
// The per-surface show_common_mistakes_* / show_remediation_* flags say which
// SURFACES a school shows; `classified_cohorts` says which COHORTS have
// classification worth showing at all. Config-manager resolves school-scope
// only, so the cohort list rides inside the feature_flags document as a
// string[] of "<grade>|<subject>" entries (e.g. "12|Mathematics") and every
// classification surface ANDs its own flag with this check.
//
// Matching is whitespace- and case-insensitive on both sides — the prod
// subjects table carries 'Applied  Mathematics' with a double space, and that
// class of drift must never silently disable a cohort.
'use client'

import { useFeatureFlag } from '@/components/config-provider'

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** True when (grade, subject) is one of the enabled cohorts. Unknown context
 * (either part missing, e.g. filters not loaded yet) is never enabled. */
export function classificationEnabledFor(
  cohorts: string[],
  grade?: string | null,
  subject?: string | null,
): boolean {
  if (!grade || !subject) return false
  const key = `${norm(grade)}|${norm(subject)}`
  return cohorts.some((c) => {
    const cut = c.indexOf('|')
    if (cut < 0) return false
    return `${norm(c.slice(0, cut))}|${norm(c.slice(cut + 1))}` === key
  })
}

/** The school's enabled cohorts, from config-manager. */
export function useClassifiedCohorts(): string[] {
  return useFeatureFlag<string[]>('classified_cohorts')
}
