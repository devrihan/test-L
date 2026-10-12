// The four performance bands every score histogram buckets into. One source
// for the labels and thresholds: the dashboard's By-Student chart, the exam
// Analysis "By student" tab, and their legends/colour lookups all match bars
// to bands by EXACT label string, so a second hand-written copy of these
// labels is a silent all-red chart waiting to happen (the two copies had
// already drifted: hyphen '40-60%' vs en-dash '40–60%').
//
// Colours stay at the call sites — the two surfaces use their own palettes.

export interface PerformanceBand {
  label: string
  /** Inclusive lower bound (%). */
  lo: number
  /** Exclusive upper bound (%); 101 so a perfect 100 lands in the top band. */
  hi: number
  /** How a sentence says it: "N students <phrase>". */
  phrase: string
}

export const PERFORMANCE_BANDS: PerformanceBand[] = [
  { label: 'Below 40%', lo: 0,  hi: 40,  phrase: 'scored below 40%' },
  { label: '40–60%',    lo: 40, hi: 60,  phrase: 'scored between 40% and 60%' },
  { label: '60–80%',    lo: 60, hi: 80,  phrase: 'scored between 60% and 80%' },
  { label: '80%+',      lo: 80, hi: 101, phrase: 'scored 80% or above' },
]

/** Index of the band a percentage falls in (clamped into range). */
export function bandIndex(pct: number): number {
  const p = Math.max(0, pct)
  return p < 40 ? 0 : p < 60 ? 1 : p < 80 ? 2 : 3
}

/** The band with this exact label, if any. */
export function bandByLabel(label: string): PerformanceBand | undefined {
  return PERFORMANCE_BANDS.find((b) => b.label === label)
}
