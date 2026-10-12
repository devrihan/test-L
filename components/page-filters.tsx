'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { sendGAEvent } from '@next/third-parties/google'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DEFAULT_FILTERS, type AnalyticsFilters } from '@/app/lib/filters'
import { formatExamName, logicalExamKey, academicYearsOf, matchesAcademicYear, byExamOrder, ALL_YEARS, ALL_EXAMS, ALL_SUBJECTS } from '@/app/lib/filters'
import type { CropFilterCombo } from '@/app/lib/answer-crops'
import { fetchCallerRole, type CallerRole } from '@/app/lib/caller-role'

const triggerClass =
  'h-auto p-2 rounded-md gap-1 text-[18px] leading-[28px] [&_svg:last-child]:size-6 [&_svg:last-child]:opacity-100 bg-white'

// SelectItem defaults to text-sm; every option in every filter reads at 16px.
const itemClass = 'text-base'

interface PageFiltersProps {
  showExam?: boolean
  // Academic Year dropdown (beaver#547) — used on the teacher dashboard, whose
  // graphs aggregate across exams, in place of the misleading Exams dropdown.
  showYear?: boolean
  // Adds an 'All Exams' option to the exam dropdown (beaver#574) for list
  // pages that can aggregate across exams (chapter/student).
  allowAllExams?: boolean
  // Adds an 'All Subjects' option to the subject dropdown, for pages that can
  // show an aggregate-across-subjects view (student dashboard).
  allowAllSubjects?: boolean
  showSection?: boolean
  // Hides the Subject dropdown, for pages that enumerate every subject rather
  // than drill into one (the leadership Subjects directory). `filters.subject`
  // is still kept valid so subject-scoped pages keep working after navigating
  // away — it just isn't offered as a choice here.
  showSubject?: boolean
  // Which exams the Exam dropdown offers. 'cohort' (default) = exams for the
  // selected grade+subject+section, which is what a subject-scoped page wants.
  // 'grade' = every exam in the grade regardless of subject — required by the
  // Subjects directory, where scoping the exam list to one arbitrary subject
  // would hide exams that other subjects on the same page actually have.
  examScope?: 'cohort' | 'grade'
  // Restricts the Grade dropdown to these grades — a coordinator only
  // coordinates some of them. Intersected with the grades that actually have
  // data, so an out-of-date allowlist can't offer an empty grade.
  gradeOptions?: string[]
  // Merges the Grade and Section dropdowns into a single "11-C" style picker
  // instead of two separate selects. Opt-in per page (only the teacher's
  // Chapter page uses this so far) — every other page keeps the two selects.
  combineGradeSection?: boolean
  // When both `value` and `onChange` are supplied the component is controlled
  // and the parent owns the filter state (so it can drive data fetching).
  value?: AnalyticsFilters
  onChange?: (next: AnalyticsFilters) => void
  // When supplied, the dropdowns are driven by real data (all grades incl. 11,
  // real subjects/sections/exam names) and cascade grade→subject→section→exam.
  // In this mode filter values are the raw backend values ('12', 'Mathematics',
  // 'S', 'Preboard 1'). Omit for the original hardcoded (analytics) options.
  combos?: CropFilterCombo[]
}

const uniq = (xs: string[]) => Array.from(new Set(xs)).sort()

// Grades read highest-first everywhere (12, 11, 10, 9) — numeric, so a plain
// string sort can't put 10/11/12 above 8/9.
const byGradeDesc = (a: string, b: string) => Number(b) - Number(a)

// Same grade order for "11-C" pairs, sections left in A-Z order inside a grade.
const byGradeDescThenSection = (a: string, b: string) => {
  const [ga, sa = ''] = a.split('-')
  const [gb, sb = ''] = b.split('-')
  return byGradeDesc(ga, gb) || sa.localeCompare(sb)
}

export function PageFilters({ showExam = false, showYear = false, allowAllExams = false, allowAllSubjects = false, showSection = true, showSubject = true, examScope = 'cohort', gradeOptions, combineGradeSection = false, value, onChange, combos }: PageFiltersProps) {
  const [internal, setInternal] = useState<AnalyticsFilters>(DEFAULT_FILTERS)
  const controlled = value !== undefined && onChange !== undefined
  const filters = controlled ? value! : internal
  const pathname = usePathname()
  const [callerRole, setCallerRole] = useState<CallerRole | null>(null)

  useEffect(() => {
    fetchCallerRole()
      .then(setCallerRole)
      .catch(() => setCallerRole('unknown'))
  }, [])

  // Is one subject really in effect for a given filters snapshot? Without a
  // Subject picker `filters.subject` is an invisible leftover, and scoping
  // class lists by it hides other classes. Takes the snapshot as an argument
  // (rather than closing over `filters`) so `reconcile()` can evaluate it
  // against the patch being applied instead of the pre-patch render state —
  // using the outer `filters` there raced a subject pick that also flips
  // `subjectAll` in the same update, and the stale `subjectScoped` overrode
  // the user's new subject right back to the old one.
  function subjectScopedFor(f: AnalyticsFilters): boolean {
    return showSubject && !(allowAllSubjects && f.subjectAll)
  }
  const subjectScoped = subjectScopedFor(filters)

  // The exams on offer for a cohort — grade-wide or grade+subject+section,
  // per `examScope`. Used by both `reconcile` and the dropdown below, so the
  // validated value and the visible options can't disagree.
  function examPoolFor(grade: string, subject: string, section: string): string[] {
    if (!combos) return []
    return uniq(
      combos
        .filter((c) =>
          examScope === 'grade'
            ? c.grade === grade
            : c.grade === grade && c.subject === subject && c.section === section,
        )
        .map((c) => c.exam),
    ).sort(byExamOrder)
  }

  // Keep downstream selections valid for the chosen grade/subject/section.
  function reconcile(f: AnalyticsFilters): AnalyticsFilters {
    if (!combos) return f
    const subjects = uniq(combos.filter((c) => c.grade === f.grade).map((c) => c.subject))
    let subject = subjects.includes(f.subject) ? f.subject : subjects[0] ?? f.subject
    // Subject-scoped: subject leads, section fits it. Subject-agnostic: the
    // class leads and the hidden subject follows, or 12-H snaps back to 12-C.
    const sections = uniq(
      combos
        .filter((c) => c.grade === f.grade && (!subjectScopedFor(f) || c.subject === subject))
        .map((c) => c.section),
    )
    const section = sections.includes(f.section) ? f.section : sections[0] ?? f.section
    if (!subjectScopedFor(f)) {
      const taughtHere = uniq(
        combos.filter((c) => c.grade === f.grade && c.section === section).map((c) => c.subject),
      )
      if (!taughtHere.includes(subject)) subject = taughtHere[0] ?? subject
    }
    const exams = examPoolFor(f.grade, subject, section)
    const years = academicYearsOf(exams)
    const year = f.year && years.includes(f.year) ? f.year : years[0] ?? ALL_YEARS
    // With a year dropdown the exam must belong to the selected year; without
    // one the user can't change the year, so don't constrain by it.
    const pool = showYear ? exams.filter((e) => matchesAcademicYear(e, year)) : exams
    const exam = pool.includes(f.exam) ? f.exam : pool[0] ?? exams[0] ?? f.exam
    return {
      ...f,
      subject,
      section,
      exam,
      year,
      subjectAll: allowAllSubjects ? f.subjectAll : undefined,
      // 'All Exams' only makes sense while a single subject is selected
      // (beaver#694) — switching to 'All Subjects' (or a page that doesn't
      // allow it) drops back to the real `exam`, which is always kept valid.
      examAll: allowAllExams && !f.subjectAll ? f.examAll : undefined,
    }
  }

  function update(patch: Partial<AnalyticsFilters>) {
    let merged = { ...filters, ...patch }
    // The subject list spans every grade in scope (#265), so a chosen subject
    // may not exist under the current grade. Follow it to a grade that carries
    // it; reconcile() then fixes section/exam for the new pair. Only on a
    // subject change — a grade change keeps the old behaviour, where the
    // subject is coerced to the new grade's list.
    if (
      combos &&
      patch.subject !== undefined &&
      !combos.some((c) => c.grade === merged.grade && c.subject === merged.subject)
    ) {
      const gradeWithSubject = uniq(
        combos.filter((c) => c.subject === merged.subject).map((c) => c.grade),
      )[0]
      if (gradeWithSubject) merged = { ...merged, grade: gradeWithSubject }
    }
    const next = reconcile(merged)
    // Which dropdown moved, and where from. page_view can't see this: filters
    // live in state, so the path never changes when one is used.
    // 'All Subjects'/'All Exams' arrive as { subjectAll: true } / { examAll: true },
    // and picking a real one sends the flag as false alongside it. Report the
    // dropdown and one readable value, never the internal flag.
    const entries = Object.entries(patch).filter(([k]) => k !== 'subjectAll' && k !== 'examAll')
    const pickedAll = patch.subjectAll === true ? 'subject' : patch.examAll === true ? 'exam' : null
    sendGAEvent('event', 'filter_change', {
      filter: pickedAll ?? entries.map(([k]) => k).join(','),
      value: pickedAll ? 'all' : entries.map(([, v]) => String(v)).join(','),
      surface: pathname,
    })
    if (controlled) onChange!(next)
    else setInternal(next)
  }

  // Option lists — dynamic (cascading) when combos are provided.
  const allGrades = combos ? Array.from(new Set(combos.map((c) => c.grade))).sort(byGradeDesc) : null
  const grades = allGrades && gradeOptions ? allGrades.filter((g) => gradeOptions.includes(g)) : allGrades
  // Every subject in scope, NOT just the current grade's. Scoping this list by
  // grade deadlocked the cascade: a teacher with 12-Mathematics and
  // 11-AppliedMaths could never reach grade 11, because Applied Mathematics
  // was hidden while grade 12 was selected and 11-C/E were hidden while
  // Mathematics was selected (#265). Picking a subject the current grade
  // doesn't carry jumps the grade instead — see update().
  const subjects = combos ? uniq(combos.map((c) => c.subject)) : null
  const sections = combos
    ? uniq(
        combos
          .filter((c) => c.grade === filters.grade && (!subjectScoped || c.subject === filters.subject))
          .map((c) => c.section),
      )
    : null
  const exams = combos ? examPoolFor(filters.grade, filters.subject, filters.section) : null
  const years = exams ? academicYearsOf(exams) : null
  const yearScopedExams = exams && showYear ? exams.filter((e) => matchesAcademicYear(e, filters.year)) : exams

  // In 'grade' scope the same sitting appears once per subject, because exam
  // ids embed the subject. Collapse them so the dropdown offers "Unit Test 1
  // 2025-26" once instead of once per subject. The value kept is one
  // representative id — still a real id, so navigating to a subject-scoped
  // page afterwards works unchanged.
  const examOptions =
    yearScopedExams && examScope === 'grade'
      ? Array.from(new Map(yearScopedExams.map((e) => [logicalExamKey(e), e])).values())
      : yearScopedExams

  // `filters.exam` may be a different subject's copy of the selected sitting
  // than the representative in the list above. Match on the logical key so the
  // trigger shows the exam name instead of rendering blank.
  const selectedExam =
    examOptions?.find((e) => logicalExamKey(e) === logicalExamKey(filters.exam)) ?? filters.exam

  // Combined "11-C" style pairs, scoped to the current subject only when one is
  // in effect — a subject-agnostic page offers every class that has data.
  const gradeSectionPairs = combos
    ? Array.from(new Set(
        combos
          .filter((c) => !subjectScoped || c.subject === filters.subject)
          .map((c) => `${c.grade}-${c.section}`),
      )).sort(byGradeDescThenSection)
    : null

  return (
    <div className="flex flex-wrap items-center justify-end gap-sp-lg gap-y-2 max-w-full min-w-0">
      {showSubject && <Select
        value={allowAllSubjects && filters.subjectAll ? ALL_SUBJECTS : filters.subject}
        onValueChange={(v) => (v === ALL_SUBJECTS ? update({ subjectAll: true }) : update({ subject: v, subjectAll: false }))}
      >
        <SelectTrigger className={triggerClass}>
          <span className="text-muted-foreground font-normal tracking-[-0.108px]">Subject:</span>
          <span className="font-medium text-foreground tracking-[-0.108px]">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {allowAllSubjects && <SelectItem value={ALL_SUBJECTS} className={itemClass}>All Subjects</SelectItem>}
          {subjects
            ? subjects.map((s) => <SelectItem key={s} value={s} className={itemClass}>{s}</SelectItem>)
            : (<>
                <SelectItem value="mathematics" className={itemClass}>Mathematics</SelectItem>
                <SelectItem value="science" className={itemClass}>Science</SelectItem>
                <SelectItem value="english" className={itemClass}>English</SelectItem>
              </>)}
        </SelectContent>
      </Select>}

      {showYear && <Select
        value={filters.year ?? years?.[0] ?? ALL_YEARS}
        onValueChange={(v) => update({ year: v })}
      >
        <SelectTrigger className={triggerClass}>
          <span className="text-muted-foreground font-normal tracking-[-0.108px] shrink-0">Year:</span>
          <span className="font-medium text-foreground tracking-[-0.108px]">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {years && years.length > 0
            ? years.map((y) => <SelectItem key={y} value={y} className={itemClass}>{y}</SelectItem>)
            : <SelectItem value={ALL_YEARS} className={itemClass}>All</SelectItem>}
        </SelectContent>
      </Select>}

      {showExam && <Select
        value={allowAllExams && filters.examAll ? ALL_EXAMS : selectedExam}
        onValueChange={(v) => (v === ALL_EXAMS ? update({ examAll: true }) : update({ exam: v, examAll: false }))}
      >
        <SelectTrigger className={`${triggerClass} w-[215px]`}>
          <span className="text-muted-foreground font-medium tracking-[-0.108px] shrink-0">Exams:</span>
          <span className="font-medium text-foreground tracking-[-0.108px] flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          {allowAllExams && <SelectItem value={ALL_EXAMS} className={itemClass}>All Exams</SelectItem>}
          {examOptions
            ? examOptions.map((e) => <SelectItem key={e} value={e} className={itemClass}>{formatExamName(e)}</SelectItem>)
            : (<>
                <SelectItem value="Midterm" className={itemClass}>Midterm</SelectItem>
                <SelectItem value="Preboard 1" className={itemClass}>Preboard 1</SelectItem>
                <SelectItem value="Annual Examination" className={itemClass}>Annual Examination</SelectItem>
                <SelectItem value="PB1" className={itemClass}>PB1</SelectItem>
                <SelectItem value="Midterm1" className={itemClass}>Midterm1</SelectItem>
              </>)}
        </SelectContent>
      </Select>}

      {combineGradeSection ? (
        <Select
          value={`${filters.grade}-${filters.section}`}
          onValueChange={(v) => {
            const [grade, section] = v.split('-')
            update({ grade, section })
          }}
        >
          <SelectTrigger className={triggerClass}>
            <span className="text-muted-foreground font-normal tracking-[-0.108px]">Grade-Sec:</span>
            <span className="font-medium text-foreground tracking-[-0.108px]">
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {gradeSectionPairs
              ? gradeSectionPairs.map((p) => <SelectItem key={p} value={p} className={itemClass}>{p}</SelectItem>)
              : (<>
                  <SelectItem value="grade8-a" className={itemClass}>8-A</SelectItem>
                  <SelectItem value="grade9-a" className={itemClass}>9-A</SelectItem>
                  <SelectItem value="grade10-a" className={itemClass}>10-A</SelectItem>
                  <SelectItem value="grade11-a" className={itemClass}>11-A</SelectItem>
                  <SelectItem value="grade12-a" className={itemClass}>12-A</SelectItem>
                </>)}
          </SelectContent>
        </Select>
      ) : (
        <>
            {callerRole !== 'student' && (
              <Select value={filters.grade} onValueChange={(v) => update({ grade: v })}>
                <SelectTrigger className={triggerClass}>
                  <span className="text-muted-foreground font-normal tracking-[-0.108px]">
                    Grade:
                  </span>
                  <span className="font-medium text-foreground tracking-[-0.108px]">
                    <SelectValue />
                  </span>
                </SelectTrigger>

                <SelectContent position="popper" align="end">
                  {grades
                    ? grades.map((g) => (
                      <SelectItem key={g} value={g} className={itemClass}>
                        {g}
                      </SelectItem>
                    ))
                    : (
                      <>
                        <SelectItem value="grade8" className={itemClass}>8</SelectItem>
                        <SelectItem value="grade9" className={itemClass}>9</SelectItem>
                        <SelectItem value="grade10" className={itemClass}>10</SelectItem>
                        <SelectItem value="grade11" className={itemClass}>11</SelectItem>
                        <SelectItem value="grade12" className={itemClass}>12</SelectItem>
                      </>
                    )}
                </SelectContent>
              </Select>
            )}

          {showSection && <Select value={filters.section} onValueChange={(v) => update({ section: v })}>
            <SelectTrigger className={triggerClass}>
              <span className="text-muted-foreground font-normal tracking-[-0.108px]">Sec:</span>
              <span className="font-medium text-foreground tracking-[-0.108px]">
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {sections
                ? sections.map((s) => <SelectItem key={s} value={s} className={itemClass}>{s}</SelectItem>)
                : (<>
                    <SelectItem value="a" className={itemClass}>A</SelectItem>
                    <SelectItem value="b" className={itemClass}>B</SelectItem>
                    <SelectItem value="c" className={itemClass}>C</SelectItem>
                  </>)}
            </SelectContent>
          </Select>}
        </>
      )}
    </div>
  )
}
