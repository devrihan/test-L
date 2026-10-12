'use client'

import { useEffect, useState } from 'react'
import { fetchPaperQuestions, type PaperQuestion } from '@/app/lib/questions'

/**
 * What a student view needs to name a whole question beside one of their
 * scanned answers: the label ("Q37"), the question's text for the hover, the
 * questions.id of every part (each part has its own answer key), and the
 * paper's typed answer text as a fallback when no reviewed key exists.
 */
export interface QuestionRef {
  label: string
  text: string | null
  partIds: number[]
  fallbackAnswers: string[]
}

/**
 * One ref per WHOLE question number. A scanned answer crop is cut per whole
 * question (17, not 17.1 / 17.2), so the label, the text and the answer key
 * all cover every part of it, in paper order.
 */
export function buildQuestionRefs(paper: PaperQuestion[]): Map<number, QuestionRef> {
  const byWhole = new Map<number, PaperQuestion[]>()
  for (const q of paper) {
    const n = Math.trunc(q.questionNumber)
    byWhole.set(n, [...(byWhole.get(n) ?? []), q])
  }
  const refs = new Map<number, QuestionRef>()
  for (const [n, parts] of byWhole) {
    const sorted = [...parts].sort((a, b) => a.questionNumber - b.questionNumber)
    const text = sorted.map((p) => p.questionText?.trim()).filter(Boolean).join('\n\n') || null
    refs.set(n, {
      label: `Q${n}`,
      text,
      partIds: sorted.map((p) => p.id),
      // The school's own answer text only. ai_answer is the model's draft and
      // is not shown to students.
      fallbackAnswers: sorted.map((p) => p.answerKey?.trim()).filter((t): t is string => Boolean(t)),
    })
  }
  return refs
}

/** The exam's question refs, fetched once per paper; empty until loaded or on failure. */
export function useQuestionRefs(paper: { grade: string; subject: string; exam: string } | null): Map<number, QuestionRef> {
  // Tagged with the paper it was fetched for, so a paper switch shows no refs
  // (rather than the previous paper's) until its own arrive.
  const [loaded, setLoaded] = useState<{ key: string; refs: Map<number, QuestionRef> } | null>(null)
  const key = paper ? [paper.grade, paper.subject, paper.exam].join('|') : null
  useEffect(() => {
    if (!paper || !key) return
    let ignore = false
    fetchPaperQuestions({ grade: paper.grade, subject: paper.subject, exam: paper.exam, section: '' })
      .then((qs) => { if (!ignore) setLoaded({ key, refs: buildQuestionRefs(qs) }) })
      .catch(() => { if (!ignore) setLoaded({ key, refs: new Map() }) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the paper, not the object identity
  }, [key])
  return loaded && loaded.key === key ? loaded.refs : EMPTY
}

const EMPTY: Map<number, QuestionRef> = new Map()
