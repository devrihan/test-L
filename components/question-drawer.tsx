'use client'

import { useState } from 'react'
import { X, ChevronRight, PlusCircle, AlertTriangle, CheckCircle, Maximize2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import LatexPreview from '@/components/latex-preview'
import { useShowAddToPlan } from '@/components/config-provider'
import type { QuestionRef } from '@/app/lib/question-refs'
import { AnswerKeyButton } from '@/components/question-ref'

export interface StudentEvidence {
  id: number
  name: string
  initials: string
  questionNumber: string
  questionText?: string
  marksLost: string
  chapter: string
  // null = no diagnosis exists for THIS answer (e.g. it was never classified).
  // The panel is not rendered: a chapter-level headline shown here would read
  // as a claim about this specific answer, which nobody made.
  goingWrong: string | null
  nextPractise: string | null
  /** Real scanned crop (R2). Absent -> an explicit empty state, never a stand-in. */
  imageUrl?: string
  /** Set by the student's own views: adds an "Answer key" action on the crop. */
  question?: QuestionRef
}

interface QuestionDrawerProps {
  open: boolean
  onClose: () => void
  topic: string
  subtitle: string
  students: StudentEvidence[]
}

export function QuestionDrawer({ open, onClose, topic, subtitle, students }: QuestionDrawerProps) {
  // A drawer with no evidence renders undefined-student fields — callers gate
  // their View buttons on evidence, and this backstop keeps a stray open()
  // from painting a broken sheet.

  const [index, setIndex] = useState(0)
  const [imageExpanded, setImageExpanded] = useState(false)
  const showAddToPlan = useShowAddToPlan()

  const student = students[index] ?? students[0]
  if (!student) return null

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[640px] sm:max-w-[640px] p-0 flex flex-col gap-0 overflow-hidden"
      >
        <TooltipProvider delayDuration={300}>
        {/* Header */}
        <div className="border-b border-border px-4 py-4 flex items-start gap-2 shrink-0">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-[18px] font-semibold leading-7 tracking-[-0.108px] text-foreground overflow-hidden text-ellipsis whitespace-nowrap cursor-default">
                  {topic}
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[400px] text-wrap">
                {topic}
              </TooltipContent>
            </Tooltip>
            <p className="text-[14px] font-normal leading-5 text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showAddToPlan && (
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-[14px] font-medium">
                <PlusCircle className="size-4" />
                Add to plan
              </Button>
            )}
            <button
              onClick={onClose}
              className="opacity-70 hover:opacity-100 transition-opacity rounded-md p-0.5"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-4 py-4 flex flex-col gap-3">

            {/* Student navigation */}
            <div className="flex items-center gap-2">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0 text-[14px] font-semibold text-foreground select-none">
                {student.initials}
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <p className="text-[16px] font-semibold leading-6 text-foreground">{student.name}</p>
                <p className="text-[14px] font-normal leading-5 text-muted-foreground">
                  Evidence {index + 1} of {students.length}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIndex(Math.max(0, index - 1))}
                  disabled={index === 0}
                  className="border border-border rounded-md p-2 disabled:opacity-40 hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight className="size-4 rotate-180" />
                </button>
                <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-foreground">
                  {index + 1}/{students.length}
                </span>
                <button
                  onClick={() => setIndex(Math.min(students.length - 1, index + 1))}
                  disabled={index === students.length - 1}
                  className="border border-border rounded-md p-2 disabled:opacity-40 hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            {/* Question meta row */}
            <div className="flex items-start gap-6">
              <div className="flex flex-col gap-1">
                <p className="text-[16px] font-semibold leading-6 text-foreground">Question number</p>
                {student.questionText ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[16px] font-normal leading-6 rounded-md px-2.5 h-8 w-fit cursor-default"
                      >
                        {student.questionNumber}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[360px] text-wrap">
                      <LatexPreview text={student.questionText} />
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[16px] font-normal leading-6 rounded-md px-2.5 h-8 w-fit"
                  >
                    {student.questionNumber}
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[16px] font-semibold leading-6 text-foreground">Marks lost</p>
                <p className="text-[16px] font-normal leading-6 text-foreground">{student.marksLost}</p>
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[16px] font-semibold leading-6 text-foreground">Chapter</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-[16px] font-normal leading-6 text-foreground overflow-hidden text-ellipsis whitespace-nowrap cursor-default">
                      {student.chapter}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[300px] text-wrap">
                    {student.chapter}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* What went wrong card — only when a diagnosis of THIS answer exists */}
            {student.goingWrong && (
            <div className="bg-[#fff0f0] border border-[#ffe0e1] rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <AlertTriangle className="size-4 text-[#e76e4f] shrink-0" />
                <span className="text-[16px] font-medium leading-6 text-[#e76e4f]">What went wrong</span>
              </div>
              <p className="text-[16px] font-medium leading-6 text-foreground">{student.goingWrong}</p>
            </div>
            )}

            {student.nextPractise && (<>{/* Next practise card */}
            <div className="bg-[#ecfdf2] border border-[#d3fde5] rounded-lg p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <CheckCircle className="size-4 text-[#008a2e] shrink-0" />
                <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-[#008a2e]">
                  Next practise
                </span>
              </div>
              <p className="text-[16px] font-medium leading-6 text-foreground">{student.nextPractise}</p>
            </div></>)}
          </div>

          {/* Answer image */}
          <div className="px-4 pb-6 flex-1">
            <div className="relative bg-[#f4f4f5] border border-border rounded-lg overflow-hidden min-h-[280px]">
              {student.imageUrl ? (
                <img
                  src={student.imageUrl}
                  alt="Student answer"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <p className="text-[16px] font-medium leading-6 text-foreground/70">
                    No scanned answer available for this student
                  </p>
                </div>
              )}
              {student.imageUrl && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2">
                  {student.question && <AnswerKeyButton question={student.question} />}
                  <button
                    type="button"
                    onClick={() => setImageExpanded(true)}
                    className="flex items-center gap-1.5 bg-[#3f3f46] text-white text-[12px] font-medium leading-4 tracking-[-0.072px] px-2 py-1.5 rounded hover:bg-[#52525b] transition-colors"
                  >
                    <Maximize2 className="size-4" />
                    Click to expand
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <Dialog open={imageExpanded} onOpenChange={setImageExpanded}>
          <DialogContent className="max-w-[90vw] sm:max-w-[90vw] p-2 bg-[#A9A9A9] border-none">
            <DialogTitle className="sr-only">Student answer</DialogTitle>
            {student.imageUrl && (
              <img src={student.imageUrl} alt="Student answer" className="w-full max-h-[85vh] object-contain" />
            )}
          </DialogContent>
        </Dialog>
        </TooltipProvider>
      </SheetContent>
    </Sheet>
  )
}
