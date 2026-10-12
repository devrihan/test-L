'use client'

// Shared analytics-filter state for every page that has the grade/subject/
// section/exam dropdowns. Loads the real (data-driven) options, defaults to
// grade 12, and PERSISTS the selection in sessionStorage so it survives
// navigating between pages.
//
// The state lives in a PROVIDER mounted once in the dashboard layout, not in
// each caller. It used to be a plain hook: every consumer held its own copy and
// they only agreed because each one re-read sessionStorage on mount. That broke
// once the sidebar started rendering the exam list alongside a page — changing
// a dropdown updated the page's copy but left the sidebar's stale until reload,
// since sessionStorage fires no event in the tab that wrote it.

import { createContext, createElement, useContext, useState, useEffect, type ReactNode } from 'react'
import { topRoleCombos } from './senior-scope'
import { fetchCropFilters, type CropFilterCombo } from './answer-crops'
import { academicYearsOf, ALL_YEARS, type AnalyticsFilters } from './filters'
import { ConfigError } from './config-shared'

const KEY = 'analytics_filters'
const DEFAULT_GRADE = '12'
const MAX_SILENT_RETRIES = 10
const SILENT_RETRY_DELAY_MS = 1000

function load(): AnalyticsFilters | null {
  try {
    const s = sessionStorage.getItem(KEY)
    return s ? (JSON.parse(s) as AnalyticsFilters) : null
  } catch {
    return null
  }
}
function save(f: AnalyticsFilters) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    /* ignore */
  }
}

// Ensure `year` is one of the cohort's real academic years (beaver#547) —
// covers saved states from before the field existed and cohort switches.
function withValidYear(f: AnalyticsFilters, combos: CropFilterCombo[]): AnalyticsFilters {
  const years = academicYearsOf(
    combos
      .filter((c) => c.grade === f.grade && c.subject === f.subject && c.section === f.section)
      .map((c) => c.exam),
  )
  const year = f.year && years.includes(f.year) ? f.year : years[0] ?? ALL_YEARS
  return { ...f, year }
}

function isValid(f: AnalyticsFilters | null, combos: CropFilterCombo[]): f is AnalyticsFilters {
  return (
    !!f &&
    combos.some(
      (c) => c.grade === f.grade && c.subject === f.subject && c.section === f.section && c.exam === f.exam,
    )
  )
}

export interface AnalyticsFiltersState {
  combos: CropFilterCombo[] | null
  filters: AnalyticsFilters | null
  setFilters: (f: AnalyticsFilters) => void
  error: boolean
  retry: () => void
}

const AnalyticsFiltersContext = createContext<AnalyticsFiltersState | null>(null)

function useAnalyticsFiltersState(): AnalyticsFiltersState {
  const [combos, setCombos] = useState<CropFilterCombo[] | null>(null)
  const [filters, setFiltersState] = useState<AnalyticsFilters | null>(null)
  // Surfaces a failed fetch instead of leaving `filters` stuck at null forever
  // with no indication anything went wrong (see beaver "Exams -> By Chapter"
  // drawer investigation) — callers can show a retry prompt.
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [configFault, setConfigFault] = useState<ConfigError | null>(null)

  // Rethrow during render: config is broken, and every consumer of this hook
  // would otherwise render against filters that were never resolved.
  if (configFault) throw configFault

  useEffect(() => {
    let ignore = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    setError(false)

    function attemptFetch() {
      fetchCropFilters()
        .then((cs) => {
          if (ignore) return
          setCombos(cs)
          const saved = load()
          if (isValid(saved, cs)) {
            setFiltersState(withValidYear(saved, cs))
            return
          }
          // Land where the viewer is most senior: a Grade 10 coordinator who
          // also teaches a Grade 12 class opens on Grade 10, a principal still
          // opens on the default grade. The default grade breaks ties within
          // the most senior rows; rows without a role keep today's rule.
          const lead = topRoleCombos(cs)
          const pool = lead.length ? lead : cs
          const pick = pool.find((c) => c.grade === DEFAULT_GRADE) ?? pool[0]
          if (pick) {
            const f = withValidYear(
              { grade: pick.grade, subject: pick.subject, section: pick.section, exam: pick.exam },
              cs,
            )
            setFiltersState(f)
            save(f)
          }
        })
        .catch((err: unknown) => {
          if (ignore) return
          // A config fault is not a network blip. It will fail identically on
          // every retry, and "check your connection" points the reader at the
          // wrong thing entirely — so surface it instead of retrying it. Stored
          // in state and rethrown during render, which is what lets an error
          // boundary catch it; a throw inside this callback would just become
          // an unhandled rejection.
          if (err instanceof ConfigError) {
            setConfigFault(err)
            return
          }
          attempt += 1
          // Transient network/server hiccups resolve themselves most of the
          // time — retry silently first, only bothering the user with a
          // "try again" prompt once retries are exhausted.
          if (attempt < MAX_SILENT_RETRIES) {
            timer = setTimeout(attemptFetch, SILENT_RETRY_DELAY_MS)
          } else {
            setError(true)
          }
        })
    }
    attemptFetch()

    return () => {
      ignore = true
      if (timer) clearTimeout(timer)
    }
  }, [retryCount])

  const setFilters = (f: AnalyticsFilters) => {
    save(f)
    setFiltersState(f)
  }

  const retry = () => setRetryCount((n) => n + 1)

  return { combos, filters, setFilters, error, retry }
}

export function AnalyticsFiltersProvider({ children }: { children: ReactNode }) {
  const value = useAnalyticsFiltersState()
  return createElement(AnalyticsFiltersContext.Provider, { value }, children)
}

export function useAnalyticsFilters(): AnalyticsFiltersState {
  const ctx = useContext(AnalyticsFiltersContext)
  if (!ctx) {
    throw new Error('useAnalyticsFilters must be used inside <AnalyticsFiltersProvider> (mounted in the dashboard layout)')
  }
  return ctx
}
