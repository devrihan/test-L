'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Maximize2, PlusCircle } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { MistakeCard } from '@/components/mistake-card'
import { cn } from '@/lib/utils'
import { useShowAddToPlan } from '@/components/config-provider'
import { trackTabView } from '@/app/lib/analytics'
import type { QuestionRef } from '@/app/lib/question-refs'
import { AnswerKeyButton, QuestionPill } from '@/components/question-ref'

export interface MistakeLegendItem {
  label: string
  color: string
  /** relative bar-segment weight; segments split evenly when omitted */
  value?: number
}

export interface MistakeExample {
  student: string
  earned: number
  total: number
  description: string
  image: string
  count: number
}

export interface MistakeItem {
  id: string
  color: string
  title: string
  description: string
  /** chapter variant: question tags shown as "Seen in: Q1 Q5 …" */
  questions?: string[]
  /** question variant: expandable student evidence */
  example?: MistakeExample | null
  /** Real per-student evidence, so a caller can scope the drawer to one student. */
  evidences?: { imageUrl: string; student: string | null; marks: number | null; maxMarks: number | null }[]
  /** The chapter this mistake belongs to — only read when the caller passes
   * `groupByChapter`, to fold several patterns from the same chapter under
   * one accordion instead of repeating the chapter's name as several rows. */
  chapter?: string
  /** The whole question the evidence crops answer. When set, the evidence
   * panel shows its label as a pill (hover: the question text) in place of
   * the description's '· Q17' tail, and an "Answer key" action on the crop. */
  question?: QuestionRef
}

export interface CommonMistakesTab {
  key: string
  label: string
  /** Shown, but not selectable — e.g. a comparison with only one exam so far. */
  disabled?: boolean
  legend: MistakeLegendItem[]
  items: MistakeItem[]
}

interface CommonMistakesSectionProps {
  title?: string
  subtitle?: string
  tabs: CommonMistakesTab[]
  /** 'chapter' renders flat MistakeCard rows; 'question' renders an expandable accordion with student evidence */
  variant?: 'chapter' | 'question'
  /** chapter variant only: makes each row clickable, e.g. to open a details sheet */
  onRowClick?: (item: MistakeItem) => void
  /** Suppress the Add-to-plan action even where the school flag is on — for
   * viewers (students) who have no planning surface, regardless of school. */
  hideAddToPlan?: boolean
  /** Rows this caller can actually open. Without it every row is clickable. */
  canOpenRow?: (item: MistakeItem) => boolean
  /** 'question' variant only: fold items sharing an `item.chapter` under one
   * accordion (with a pattern pager) instead of one row per item — a chapter
   * with several mistakes otherwise prints its own name as the title on
   * every one of them. Off by default so existing flat-list callers are
   * unaffected. */
  groupByChapter?: boolean
  className?: string
}

// Exported so the exam pages, which build their own accordion rather than
// using this section, draw the same legend and bar as Home and Chapter.
export function MistakeTypeLegendBar({ legend }: { legend: MistakeLegendItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {legend.map((item) => (
          <div key={item.label} className="flex items-center gap-[6px]">
            <div className="size-3 rounded-[4px] shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-[14px] font-medium leading-[20px] tracking-[-0.084px] text-muted-foreground whitespace-nowrap">
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-4">
        {legend.map((item, i) => (
          <div
            key={item.label}
            className={`${
              i === 0
                ? 'rounded-l-lg'
                : i === legend.length - 1
                ? 'rounded-r-lg'
                : ''
            }`}
            style={{ backgroundColor: item.color, flex: item.value ?? 1 }}
          />
        ))}
      </div>
    </div>
  )
}

// The evidence pager beside a mistake's diagnosis — split out of
// QuestionMistakeCard so ChapterMistakeGroup can reuse it for whichever
// pattern its own pattern-pager currently has selected, without dragging in
// QuestionMistakeCard's own title row and open/close chevron (the chapter
// group already provides both, one level up).
function MistakeEvidencePanel({ item }: { item: MistakeItem }) {
  const [evidenceIndex, setEvidenceIndex] = useState(1)
  const [imageExpanded, setImageExpanded] = useState(false)

  // The pager walks the REAL evidence list — previously it counted to
  // example.count (the class-wide occurrence count) while always showing the
  // same first image, so "2/11" changed nothing on screen. Falls back to the
  // single flat example for callers that don't pass `evidences`; renders
  // nothing when there is no evidence at all (a student token only receives
  // their own answers as evidence).
  const evs = item.evidences?.length
    ? item.evidences
    : item.example
      ? [{ imageUrl: item.example.image, student: item.example.student, marks: item.example.earned, maxMarks: item.example.total }]
      : []
  if (evs.length === 0) {
    return (
      <>
        <div className="h-px bg-border" />
        <p className="text-[16px] font-normal leading-6 text-muted-foreground bg-[#fafafa] p-4">
          {item.description}
        </p>
      </>
    )
  }
  const ev = evs[Math.min(evidenceIndex, Math.max(1, evs.length)) - 1]
  // The diagnosis renders HERE, beside the scanned answer — the header
  // holds only the title. Prefer item.description when the example text
  // is the same content: it carries the '· Q17' / '· N students' tail.
  const norm = (t: string) => t.replace(/\s*·\s*(Q\d+|\d+ students?)\s*$/, '').trim()
  const exDesc = item.example?.description
  const fullCaption = exDesc && norm(exDesc) !== norm(item.description) ? exDesc : item.description
  // With a question ref the pill names the question, so the '· Q17' tail goes.
  const caption = item.question ? fullCaption.replace(/\s*·\s*Q\d+\s*$/, '') : fullCaption
  return (
    <>
      <div className="h-px bg-border" />
      <div className="bg-[#fafafa] flex gap-4 items-start">
        <div className="flex-1 min-w-0 flex flex-col gap-1 p-4">
          <div className="flex items-center gap-2 w-full">
            {item.question && <QuestionPill question={item.question} />}
            <p className="flex-1 text-[16px] font-semibold leading-6 text-foreground">{ev.student ?? ''}</p>
            <p className="text-[14px] font-normal leading-5 text-destructive shrink-0">
              {ev.marks ?? 0}/{ev.maxMarks ?? 0} marks
            </p>
          </div>
          <p className="text-[16px] font-normal leading-6 text-muted-foreground">{caption}</p>
        </div>
        <div className="flex-1 self-stretch min-h-[240px] p-4">
          <div className="relative h-full bg-[#f4f4f5] border border-border rounded-lg overflow-hidden">
            <img src={ev.imageUrl} alt="Student answer" className="w-full h-full object-contain" />
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              {item.question && <AnswerKeyButton question={item.question} />}
              <button
                type="button"
                onClick={() => setImageExpanded(true)}
                className="flex items-center gap-1.5 bg-[#3f3f46] text-white text-[12px] font-medium leading-4 tracking-[-0.072px] px-2 py-1.5 rounded hover:bg-[#52525b] transition-colors"
              >
                <Maximize2 className="size-4" />
                Click to expand
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="h-px bg-border" />
      <div className="flex items-center justify-end gap-2 p-4">
        <button
          type="button"
          onClick={() => setEvidenceIndex((i) => Math.max(1, i - 1))}
          className="border border-border rounded-md p-2 hover:bg-muted/50 transition-colors"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground">
          {Math.min(evidenceIndex, evs.length)}/{evs.length}
        </span>
        <button
          type="button"
          onClick={() => setEvidenceIndex((i) => Math.min(evs.length, i + 1))}
          className="border border-border rounded-md p-2 hover:bg-muted/50 transition-colors"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <Dialog open={imageExpanded} onOpenChange={setImageExpanded}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] p-2 bg-[#A9A9A9] border-none">
          <DialogTitle className="sr-only">Student answer</DialogTitle>
          <img src={ev.imageUrl} alt="Student answer" className="w-full max-h-[85vh] object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}

function QuestionMistakeCard({ item, defaultOpen = false, hideAddToPlan = false }: { item: MistakeItem; defaultOpen?: boolean; hideAddToPlan?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const showAddToPlan = useShowAddToPlan() && !hideAddToPlan
  const canExpand = true
  const cardRef = useRef<HTMLDivElement>(null)
  const handleToggle = () => {
    const willOpen = !isOpen

    setIsOpen(willOpen)

    if (!willOpen) return

    setTimeout(() => {
      const element = cardRef.current
      const scroller = element?.closest('main')

      if (!element || !scroller) return

      const top =
        element.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop -
        24

      scroller.scrollTo({
        top,
        behavior: 'smooth',
      })
    }, 50)
  }

  return (
    <div
      ref={cardRef}
      className="border border-border rounded-lg bg-background overflow-hidden shadow-sm"
    >
      <div
        onClick={handleToggle}
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/40"
      >
        <div className="flex flex-1 gap-[6px] items-start min-w-0">
          <div className="flex items-center pt-[8px] shrink-0">
            <div className="size-3 rounded-[4px] shrink-0" style={{ backgroundColor: item.color }} />
          </div>
          <div className="min-w-0">
            {/* Title only — the diagnosis renders once, in the panel beside
                the scanned answer, never under the title as well. */}
            <p className="text-[18px] font-semibold leading-7 tracking-[-0.108px] text-foreground">
              {item.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {showAddToPlan && (
          <button type="button" className="bg-background border border-border flex gap-2 h-9 items-center justify-center px-2 rounded-md">
            <PlusCircle className="size-4 shrink-0" />
            <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground whitespace-nowrap">
              Add to plan
            </span>
          </button>
          )}
          {canExpand && (
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={isOpen ? 'Show less' : 'Show full diagnosis'}
              onClick={(e) => {
                e.stopPropagation()
                handleToggle()
              }}
              className="p-1 rounded-md text-muted-foreground hover:bg-accent transition-colors"
            >
              <ChevronDown className={`size-6 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {isOpen && <MistakeEvidencePanel item={item} />}
    </div>
  )
}

// One accordion per CHAPTER instead of per mistake pattern — several
// patterns from the same chapter used to each print the chapter's name as
// their own title, so a chapter with three mistakes showed its name three
// times in a row (reads as broken/duplicated, not as three real findings).
// Opening the chapter reveals a pattern pager (like the evidence pager one
// level down) so the chapter name appears exactly once.
function ChapterMistakeGroup({ chapter, items, defaultOpen = false, hideAddToPlan = false }: { chapter: string; items: MistakeItem[]; defaultOpen?: boolean; hideAddToPlan?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [patternIndex, setPatternIndex] = useState(1)
  const groupRef = useRef<HTMLDivElement>(null)
  const handleToggle = () => {
  const willOpen = !isOpen

  setIsOpen(willOpen)
  setPatternIndex(1)

  if (!willOpen) return

  setTimeout(() => {
    const element = groupRef.current
    const scroller = element?.closest('main')

    if (!element || !scroller) return

    const top =
      element.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      24

    scroller.scrollTo({
      top,
      behavior: 'smooth',
    })
  }, 50)
}
 
  const item = items[Math.min(patternIndex, items.length) - 1]
  const showAddToPlan = useShowAddToPlan() && !hideAddToPlan

  return (
    <div
  ref={groupRef}
  className="border border-border rounded-lg bg-background overflow-hidden shadow-sm"
>
      <div
        onClick={handleToggle}
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/40"
      >
        <div className="flex flex-1 gap-[6px] items-start min-w-0">
          {/* The dots are the legend colours: a group folds by chapter while
              the legend is by kind of mistake, so a group shows one dot per
              kind present, in the order they occur. It used to show a dot only
              when every pattern shared one colour, which left most groups
              unmarked under a four-colour bar. The pattern pager below still
              shows each pattern's own dot. */}
          {items.length > 0 && (
            <div className="flex items-center gap-[3px] pt-[8px] shrink-0">
              {Array.from(new Set(items.map((it) => it.color))).map((c) => (
                <div key={c} className="size-3 rounded-[4px] shrink-0" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[18px] font-semibold leading-7 tracking-[-0.108px] text-foreground">
              {chapter}
              {items.length > 1 && <span className="ml-1.5 text-muted-foreground font-normal">({items.length})</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {showAddToPlan && (
          <button type="button" className="bg-background border border-border flex gap-2 h-9 items-center justify-center px-2 rounded-md">
            <PlusCircle className="size-4 shrink-0" />
            <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground whitespace-nowrap">
              Add to plan
            </span>
          </button>
          )}
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Show less' : 'Show mistakes'}
            onClick={(e) => {
              e.stopPropagation()
              handleToggle()
            }}
            className="p-1 rounded-md text-muted-foreground hover:bg-accent transition-colors"
          >
            <ChevronDown className={`size-6 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {isOpen && items.length > 1 && (
        <>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-[#fafafa]">
            {/* The pattern's own kind-of-mistake colour, so a group with several
                kinds still says which one THIS pattern is. */}
            <div className="flex items-center gap-[6px] min-w-0">
              <div className="size-3 rounded-[4px] shrink-0" style={{ backgroundColor: item.color }} />
              <p className="text-[16px] font-semibold leading-6 text-foreground min-w-0 truncate">{item.title}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPatternIndex((i) => Math.max(1, i - 1))}
                className="border border-border rounded-md p-2 hover:bg-muted/50 transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground">
                {patternIndex}/{items.length}
              </span>
              <button
                type="button"
                onClick={() => setPatternIndex((i) => Math.min(items.length, i + 1))}
                className="border border-border rounded-md p-2 hover:bg-muted/50 transition-colors"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </>
      )}
      {isOpen && items.length === 1 && (
        <>
          <div className="h-px bg-border" />
          <p className="px-4 py-3 bg-[#fafafa] text-[16px] font-semibold leading-6 text-foreground">{item.title}</p>
        </>
      )}

      {/* Keyed on the pattern so the evidence pager resets to its first image
          when the pattern pager above switches which mistake is shown. */}
      {isOpen && <MistakeEvidencePanel key={item.id} item={item} />}
    </div>
  )
}

export function CommonMistakesSection({
  title = 'Common mistakes',
  subtitle,
  tabs,
  variant = 'chapter',
  onRowClick,
  canOpenRow,
  hideAddToPlan,
  groupByChapter,
  className,
}: CommonMistakesSectionProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.key)
  const current = tabs.find((t) => t.key === activeTab) ?? tabs[0]

  // Grouped by first-seen chapter order, preserving the caller's item order
  // within each group (both already sorted by whatever the caller intends —
  // grouping must not reshuffle that, only fold same-chapter rows together).
  const chapterGroups = groupByChapter && variant === 'question'
    ? (() => {
        const order: string[] = []
        const byChapter = new Map<string, MistakeItem[]>()
        for (const item of current.items) {
          const chapter = item.chapter ?? '—'
          if (!byChapter.has(chapter)) { byChapter.set(chapter, []); order.push(chapter) }
          byChapter.get(chapter)!.push(item)
        }
        return order.map((chapter) => ({ chapter, items: byChapter.get(chapter)! }))
      })()
    : null

  return (
    <div className={cn('flex flex-col gap-6', className)}>

      {/* Header row: title + tabs (only shown when there's more than one) */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-[2px]">
          <h2 className="text-[20px] font-medium leading-[28px] tracking-[-0.12px] text-foreground whitespace-nowrap">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[14px] font-normal leading-[20px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {/* Label, not the state key — tabs are supplied by the caller. */}
        {tabs.length > 1 && (
          <Tabs value={activeTab} onValueChange={(t) => { trackTabView(tabs.find((x) => x.key === t)?.label ?? t); setActiveTab(t) }}>
            <TabsList className="h-auto group-data-[orientation=horizontal]/tabs:h-auto bg-secondary p-[4px] rounded-[6px] gap-0">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  disabled={tab.disabled}
                  title={tab.disabled ? 'Available once there is more than one exam to compare' : undefined}
                  className="h-auto text-[16px] leading-[24px] font-medium px-[12px] py-[8px] rounded-[4px] data-[state=active]:bg-background data-[state=active]:shadow-[0px_1px_1px_rgba(0,0,0,0.05)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      <MistakeTypeLegendBar legend={current.legend} />

      {/* Mistake items — switches per tab */}
      <div className="flex flex-col gap-4">
        {chapterGroups ? (
          chapterGroups.map((group, i) => (
            <ChapterMistakeGroup key={group.chapter} chapter={group.chapter} items={group.items} defaultOpen={i === 0} hideAddToPlan={hideAddToPlan} />
          ))
        ) : current.items.map((item, i) =>
          variant === 'question' ? (
            <QuestionMistakeCard key={item.id} item={item} defaultOpen={i === 0} hideAddToPlan={hideAddToPlan} />
          ) : onRowClick && (canOpenRow?.(item) ?? true) ? (
            <div
              key={item.id}
              onClick={() => onRowClick(item)}
              className="group cursor-pointer"
            >
              <MistakeCard
                color={item.color}
                title={item.title}
                description={item.description}
                questions={item.questions ?? []}
                hideAddToPlan={hideAddToPlan}
                onView={() => onRowClick(item)}
              />
            </div>
          ) : (
            <MistakeCard
              key={item.id}
              color={item.color}
              title={item.title}
              description={item.description}
              questions={item.questions ?? []}
              hideAddToPlan={hideAddToPlan}
            />
          )
        )}
      </div>

    </div>
  )
}
