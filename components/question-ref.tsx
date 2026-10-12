'use client'

import { useEffect, useRef, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CellTooltip } from '@/components/cell-tooltip'
import LatexPreview from '@/components/latex-preview'
import { fetchAnswerKey, type AnswerKey } from '@/app/lib/questions'
import type { QuestionRef } from '@/app/lib/question-refs'
import { cn } from '@/lib/utils'

/**
 * The question's label as a pill whose hover shows the question text — the
 * same pill and tooltip as the question row at the top of the chapter page.
 */
export function QuestionPill({ question, className }: { question: QuestionRef; className?: string }) {
  return (
    <TooltipProvider delayDuration={300}>
      <CellTooltip
        content={
          <span className="flex flex-col gap-1">
            <span className="font-medium">{question.label}</span>
            <LatexPreview text={question.text ?? 'Question text unavailable'} />
          </span>
        }
      >
        <span
          className={cn(
            'inline-flex items-center border border-border rounded-[6px] px-[10px] py-1 bg-background',
            'text-[14px] font-medium leading-5 text-foreground whitespace-nowrap',
            className,
          )}
        >
          {question.label}
        </span>
      </CellTooltip>
    </TooltipProvider>
  )
}

/**
 * Fetches a whole question's answer key while `active`: every part's reviewed
 * key, filtered to READY when `readyOnly` (students only see keys a person
 * has signed off). Tagged with the request it answers, so reopening on
 * another question reads as loading rather than showing the last one's key.
 */
function useAnswerKeyParts(partIds: number[], readyOnly: boolean, active: boolean): AnswerKey[] | null {
  const requestKey = `${partIds.join(',')}|${readyOnly}`
  const [loaded, setLoaded] = useState<{ key: string; parts: AnswerKey[] } | null>(null)
  const have = loaded?.key === requestKey
  useEffect(() => {
    if (!active || have) return
    let ignore = false
    Promise.all(partIds.map((id) => fetchAnswerKey(id).catch(() => null))).then((keys) => {
      if (ignore) return
      setLoaded({
        key: requestKey,
        parts: keys.filter(
          (k): k is AnswerKey =>
            k !== null &&
            Boolean(k.croppedImageUrl || k.cleanText || k.ocrText || k.mcqChoice) &&
            (!readyOnly || (k.status ?? '').toUpperCase() === 'READY'),
        ),
      })
    })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch per question, not per array identity
  }, [active, requestKey, have])
  return have ? loaded!.parts : null
}

/** The key itself: each part's image / MCQ option / text, else the paper's typed answer. */
function AnswerKeyBody({ parts, fallbackAnswers }: { parts: AnswerKey[] | null; fallbackAnswers: string[] }) {
  if (parts === null) return <p className="text-base text-muted-foreground">Loading answer key…</p>
  if (parts.length > 0) {
    return (
      <>
        {parts.map((k, i) => (
          <div key={i} className="flex flex-col gap-2">
            {parts.length > 1 && <p className="text-sm font-medium text-muted-foreground">Part {i + 1}</p>}
            {k.croppedImageUrl && (
              <div className="bg-[#f4f4f5] border border-border rounded-lg overflow-hidden">
                <img src={k.croppedImageUrl} alt="Answer key" className="w-full object-contain" />
              </div>
            )}
            {k.mcqChoice && (
              <p className="text-base font-medium leading-6 text-foreground">Correct option: {k.mcqChoice}</p>
            )}
            {(k.cleanText || k.ocrText) && (
              <div className="text-base font-normal leading-7 text-foreground">
                <LatexPreview text={k.cleanText ?? k.ocrText ?? undefined} />
              </div>
            )}
          </div>
        ))}
      </>
    )
  }
  if (fallbackAnswers.length > 0) {
    return (
      <>
        {fallbackAnswers.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            {fallbackAnswers.length > 1 && <p className="text-sm font-medium text-muted-foreground">Part {i + 1}</p>}
            <div className="text-base font-normal leading-6 text-foreground [&_ul]:my-0 [&_ol]:my-0 [&_li]:my-0 [&_p]:my-0">
              <LatexPreview text={t.split('\n').map((l) => l.trim()).filter(Boolean).join('\n')} />
            </div>
          </div>
        ))}
      </>
    )
  }
  return <p className="text-base text-muted-foreground">No answer key available for this question.</p>
}

/** The answer key in a dialog — the Answer scripts page's "View answer key". */
export function AnswerKeyDialog({
  open,
  onOpenChange,
  label,
  partIds,
  fallbackAnswers = [],
  readyOnly = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  partIds: number[]
  fallbackAnswers?: string[]
  readyOnly?: boolean
}) {
  const parts = useAnswerKeyParts(partIds, readyOnly, open)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Answer key · {label}</DialogTitle>
        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <AnswerKeyBody parts={parts} fallbackAnswers={fallbackAnswers} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

const HOVER_OPEN_MS = 150
const HOVER_CLOSE_MS = 200

/**
 * "Answer key" on a student's scanned answer, styled like the crop's own
 * "Click to expand". Hovering it previews the key in a card beside the crop
 * (it stays open while the pointer is over it); clicking it, or the card,
 * opens the full key in a dialog, which is the comfortable way to read and
 * scroll a long key, and is what a tap does on a touch screen. The key is
 * fetched the first time either opens.
 */
export function AnswerKeyButton({ question, readyOnly = true, className }: { question: QuestionRef; readyOnly?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const parts = useAnswerKeyParts(question.partIds, readyOnly, open)
  const schedule = (next: boolean, ms: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(next), ms)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const openDialog = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
    setDialogOpen(true)
  }
  const hoverProps = {
    onMouseEnter: () => schedule(true, HOVER_OPEN_MS),
    onMouseLeave: () => schedule(false, HOVER_CLOSE_MS),
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          {...hoverProps}
          onClick={openDialog}
          aria-haspopup="dialog"
          className={cn(
            'flex items-center gap-1.5 bg-[#3f3f46] text-white text-[12px] font-medium leading-4 tracking-[-0.072px] px-2 py-1.5 rounded hover:bg-[#52525b] transition-colors',
            className,
          )}
        >
          <KeyRound className="size-4" />
          Answer key
        </button>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        {...hoverProps}
        onClick={openDialog}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[min(480px,90vw)] max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-3 cursor-pointer"
      >
        <p className="text-sm font-semibold text-foreground">Answer key · {question.label}</p>
        <AnswerKeyBody parts={parts} fallbackAnswers={question.fallbackAnswers} />
        <p className="text-xs text-muted-foreground">Click for the full answer key</p>
      </PopoverContent>
      <AnswerKeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        label={question.label}
        partIds={question.partIds}
        fallbackAnswers={question.fallbackAnswers}
        readyOnly={readyOnly}
      />
    </Popover>
  )
}
