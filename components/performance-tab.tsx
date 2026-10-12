"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronRight, ArrowRight, AlertTriangle, CheckCircle, Maximize2, Pencil } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  fetchAnswerCrops,
  fetchAiGrades,
  wholeQuestionMax,
  reviewAiGrade,
  type CropStudentContext,
  type AiGrade,
} from "@/app/lib/answer-crops";
import { fetchPaperQuestions } from "@/app/lib/questions";
import { AnswerKeyDialog } from "@/components/question-ref";
import { fetchStudentAnswerErrors } from "@/app/lib/students";
import { practiseFor } from "@/app/lib/remediation-advice";
import { formatExamName } from "@/app/lib/filters";
import LatexPreview from "@/components/latex-preview";

/**
 * Why these two can be null rather than a string.
 *
 * They used to be the literal '—' for every crop, on every question, for every
 * student — the panels were built from the placeholder design and never wired.
 * A dash reads as "we looked and found nothing", which is a claim about the
 * student's work; the truth is usually that the answer was never classified at
 * all (the run skips MCQs, full marks and answers with no OCR text, and most
 * sections have never had a run).
 *
 * null means "no diagnosis for this answer" and the panel is not rendered.
 * Saying nothing is honest; a dash is not.
 */
interface QuestionListItem {
  id: string;
  label: string;
  exam: string;
  marks: string;
  question: string;
  goingWrong: string | null;
  nextPractise: string | null;
  imageUrl?: string;
  images?: string[];
  chapter?: string;
  marksNum?: number;
  maxNum?: number;
  keyIds?: number[];
  fallbackAnswers?: string[];
  questionType?: string | null;
  aiMarks?: number | null;
  aiMaxMarks?: number | null;
  aiConfidence?: number | null;
  aiReviewFlag?: boolean | null;
  aiFeedback?: string | null;
  aiCriteria?: { text: string; pass: boolean; score: string }[] | null;
  aiReviewStatus?: string | null;
  aiFinalMarks?: number | null;
  aiEvalId?: number | null;
}

// Question text clamped to a few lines with a "…more" toggle. Now that every
// sub-part is shown (not just the first), a long multi-part question would
// push "What went wrong" below the fold of a 380px panel. Clipping is observed,
// not measured once: KaTeX relayouts after mount, so a single read lands on
// the wrong height (same approach as the question detail page). Keyed on the
// question by the caller so the toggle resets when the student moves on.
const QUESTION_CLAMP_PX = 8 * 20; // eight lines of leading-5

function ClampedQuestion({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [text, expanded]);
  // Expanded counts too: nothing is clipped then, so the measure alone would
  // drop "Show less" and strand the reader in the expanded view.
  const showToggle = clipped || expanded;
  return (
    <div className="flex flex-col gap-1">
      <div
        ref={ref}
        className="relative min-w-0 text-[14px] font-normal leading-5 text-foreground overflow-x-auto"
        style={expanded ? undefined : { maxHeight: QUESTION_CLAMP_PX, overflowY: "hidden" }}
      >
        <LatexPreview text={text} />
        {!expanded && clipped && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit text-[14px] font-medium leading-5 tracking-[-0.084px] text-[#008a2e]"
        >
          {expanded ? "Show less" : "…more"}
        </button>
      )}
    </div>
  );
}

const questions: QuestionListItem[] = [
  {
    id: "q1a",
    label: "Q 1 (a)",
    exam: "Exam 1",
    marks: "1/4 Marks",
    question:
      "(a). Read the following text carefully and answer the questions that follow: A manufacture has three machine operators A, Band C. The first operator A produces 1% of defective items, whereas the other two operators B and C produces 5% and 7% defective items respectively.",
    goingWrong: "Silly mistakes on easy MCQs that most of the class got right.",
    nextPractise:
      "Solve MCQs in timed sets; recheck every option before moving on.",
  },
  {
    id: "q21b",
    label: "Q 21 (b)",
    exam: "Exam 1",
    marks: "2/4 Marks",
    question:
      "Knows the method, but is not spotting the standard form of the differential equation.",
    goingWrong: "Knows the method, but is not spotting the standard form.",
    nextPractise:
      "Drill variable separable and linear DE sums, NCERT first, then PYQs.",
  },
  {
    id: "q13a",
    label: "Q 13",
    exam: "Exam 1",
    marks: "3/5 Marks",
    question: "Calculation and step slips in attempted integration sums.",
    goingWrong: "Calculation and step slips in attempted sums.",
    nextPractise:
      "Practise substitution and by-parts sums from the exact wrong types.",
  },
  {
    id: "q14a",
    label: "Q 14 (a)",
    exam: "Exam 1",
    marks: "1/4 Marks",
    question: "Setup mistake while forming the area under the curve.",
    goingWrong: "Setup mistake while forming the area under the curve.",
    nextPractise:
      "Redo area-under-curve sums; draw the figure before integrating.",
  },
  {
    id: "q8",
    label: "Q 8",
    exam: "Exam 1",
    marks: "4/5 Marks",
    question: "Step and calculation mistakes in cofactor and properties.",
    goingWrong: "Step and calculation mistakes in cofactor and properties.",
    nextPractise: "Practise cofactor expansion and property-based sums.",
  },
  {
    id: "q9b",
    label: "Q 9 (b)",
    exam: "Exam 1",
    marks: "2/4 Marks",
    question: "Skipping method steps and losing step marks.",
    goingWrong: "Skipping method steps and losing step marks.",
    nextPractise:
      "Solve while writing every step; practise from NCERT before timed sets.",
  },
  {
    id: "q10",
    label: "Q 10",
    exam: "Exam 1",
    marks: "3/4 Marks",
    question: "Silly mistakes on easy MCQs that most of the class got right.",
    goingWrong: "Silly mistakes on easy MCQs that most of the class got right.",
    nextPractise:
      "Solve MCQs in timed sets; recheck every option before moving on.",
  },
  {
    id: "q11",
    label: "Q 11",
    exam: "Exam 1",
    marks: "1/4 Marks",
    question: "Knows the method, but is not spotting the standard form.",
    goingWrong: "Knows the method, but is not spotting the standard form.",
    nextPractise:
      "Drill variable separable and linear DE sums, NCERT first, then PYQs.",
  },
  {
    id: "q12",
    label: "Q 12",
    exam: "Exam 1",
    marks: "4/4 Marks",
    question: "Calculation and step slips in attempted sums.",
    goingWrong: "Calculation and step slips in attempted sums.",
    nextPractise:
      "Practise substitution and by-parts sums from the exact wrong types.",
  },
  {
    id: "q13b",
    label: "Q 13",
    exam: "Exam 1",
    marks: "2/5 Marks",
    question: "Setup mistake while forming the area under the curve.",
    goingWrong: "Setup mistake while forming the area under the curve.",
    nextPractise:
      "Redo area-under-curve sums; draw the figure before integrating.",
  },
  {
    id: "q14b",
    label: "Q 14",
    exam: "Exam 1",
    marks: "3/4 Marks",
    question: "Step and calculation mistakes in cofactor and properties.",
    goingWrong: "Step and calculation mistakes in cofactor and properties.",
    nextPractise: "Practise cofactor expansion and property-based sums.",
  },
  {
    id: "q15",
    label: "Q 15",
    exam: "Exam 1",
    marks: "1/4 Marks",
    question: "Skipping method steps and losing step marks.",
    goingWrong: "Skipping method steps and losing step marks.",
    nextPractise:
      "Solve while writing every step; practise from NCERT before timed sets.",
  },
  {
    id: "q16",
    label: "Q 16",
    exam: "Exam 1",
    marks: "4/4 Marks",
    question: "Silly mistakes on easy MCQs that most of the class got right.",
    goingWrong: "Silly mistakes on easy MCQs that most of the class got right.",
    nextPractise:
      "Solve MCQs in timed sets; recheck every option before moving on.",
  },
];

const filterTriggerClass =
  "h-auto py-2 pl-3 pr-3 rounded-md gap-1 text-[16px] leading-6 border-input [&_svg:last-child]:size-4 [&_svg:last-child]:opacity-100 bg-white";

function FilterSelect({
  label,
  defaultValue,
  options,
  value,
  onChange,
}: {
  label: string;
  defaultValue: string;
  options: string[];
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <Select defaultValue={defaultValue} value={value} onValueChange={onChange}>
      <SelectTrigger className={filterTriggerClass}>
        <span className="text-foreground font-normal">{label}:</span>
        <span className="font-medium text-foreground">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PerformanceTab({
  showExamsFilter = true,
  className,
  cropContext,
  // beaver#577 (teacher-role only — caller-controlled, not a hook here, since
  // this component is also used by student self-view pages that must be
  // unaffected): hide "What went wrong"/"Next practise" until error classification
  // is trustworthy.
  showAnswerScriptFeedback = true,
  // beaver#674 — pre-select a question (e.g. arriving from the chapter page's
  // question badges) instead of always defaulting to the first item. Matched
  // against each item's label, ignoring whitespace ("Q20" ~ "Q 20").
  initialQuestionLabel,
}: {
  showExamsFilter?: boolean;
  className?: string;
  // When provided, the panel shows this student's real scanned-answer crops
  // (from /api/answer-crops) instead of the placeholder design.
  cropContext?: CropStudentContext;
  showAnswerScriptFeedback?: boolean;
  initialQuestionLabel?: string;
}) {
  const [cropItems, setCropItems] = useState<QuestionListItem[] | null>(null);

  useEffect(() => {
    if (!cropContext) {
      setCropItems(null);
      return;
    }
    let ignore = false;
    // Crops (image + marks) + the real question text from the paper + this
    // student's own error classification, all joined by question number.
    Promise.all([
      fetchAnswerCrops(cropContext),
      fetchPaperQuestions({
        grade: cropContext.grade,
        section: cropContext.section,
        subject: cropContext.subject,
        exam: cropContext.exam,
      }).catch(() => []),
      // The per-answer diagnosis behind "What went wrong". Returns [] for a
      // student whose section has never been through a classification run,
      // which is the normal state for most sections — the panels then simply
      // do not render.
      fetchStudentAnswerErrors(
        {
          grade: cropContext.grade,
          section: cropContext.section,
          subject: cropContext.subject,
          exam: cropContext.exam,
        },
        { roll: cropContext.roll, admissionNo: cropContext.admissionNo },
      ).catch(() => []),
      fetchAiGrades(cropContext).catch(() => [] as AiGrade[]),
    ])
      .then(([crops, paper, errors, aiGrades]) => {
        if (ignore) return;
        // Diagnosis by WHOLE question number. `clean` is dropped — it means the
        // run looked and found nothing wrong, so there is nothing to say.
        // `uncoded_error` is kept: no code fitted, but whatWentWrong is real.
        //
        // Classifications are per SUB-PART (18.1, 18.2) while the list has one
        // item per whole question, so a question can have several. They are all
        // kept and joined: showing only the first would silently drop half of
        // what a student got wrong on a 5-mark question.
        const errsByNum = new Map<number, typeof errors>();
        for (const e of errors) {
          if (e.verdict === "clean") continue;
          const n = Math.trunc(e.questionNumber);
          errsByNum.set(n, [...(errsByNum.get(n) ?? []), e]);
        }
        for (const list of errsByNum.values())
          list.sort((a, b) => a.questionNumber - b.questionNumber);
        const diagnosisFor = (n: number | null | undefined): string | null => {
          if (n == null) return null;
          const list = errsByNum.get(n);
          if (!list?.length) return null;
          const seen = new Set<string>();
          const parts: string[] = [];
          for (const e of list) {
            const t = e.whatWentWrong?.trim();
            if (!t || seen.has(t)) continue;
            seen.add(t);
            parts.push(/[.!?]$/.test(t) ? t : `${t}.`);
          }
          return parts.length ? parts.join(" ") : null;
        };
        // Advice comes from the error TYPE, so an answer faulted without a code
        // (uncoded_error) gets a diagnosis but no advice — the honest split.
        const practiseForNum = (
          n: number | null | undefined,
        ): string | null => {
          if (n == null) return null;
          for (const e of errsByNum.get(n) ?? []) {
            const p = practiseFor(e.errorTypeName);
            if (p) return p;
          }
          return null;
        };
        const textByNum = new Map<number, string>();
        const chapterByNum = new Map<number, string>();
        const idsByNum = new Map<number, number[]>();
        const keyTextByNum = new Map<number, string[]>();
        // A question with an internal choice prints two ALTERNATIVES that share
        // a whole-question number and an optionGroup — "7 a" OR "7 b", five
        // marks each, answer either. Truncating to the whole number and keeping
        // the first entry showed every student alternative (a)'s text and
        // answer key, including the ones who answered (b): their own working
        // and diagnosis sat beside a question they never attempted.
        //
        // Prefer the alternative the student actually attempted — their
        // classification rows carry the exact sub-part number — and when
        // nothing identifies which they chose, show both the way the paper
        // prints them. Genuine sub-parts (18.1, 18.2) carry no optionGroup and
        // keep the original first-wins behaviour.
        const partsByNum = new Map<number, typeof paper>();
        for (const p of paper) {
          const key = Math.trunc(p.questionNumber);
          partsByNum.set(key, [...(partsByNum.get(key) ?? []), p]);
        }
        for (const [key, parts] of partsByNum) {
          const alternatives = parts.filter((p) => p.optionGroup);
          // An optionGroup marks the choice CONSTRUCT, not one full
          // alternative per member: several papers flatten both alternatives'
          // sub-parts into a single group. Paper 80's 17_opt is 17.1-17.4
          // (1+1+1+2) for the first option and 17.5-17.7 (1+3+1) for the
          // second, with the labels restarting at "17 a". Collapsing to the
          // one sub-part a student was faulted on would drop the rest of their
          // answer's question text.
          //
          // A group of exactly two equal-mark entries is the only shape where
          // each member is reliably a whole alternative — each then carries the
          // whole question's marks. That is 108 of the 159 groups, and every
          // larger group fails the test, so they keep the old behaviour.
          const isChoice =
            alternatives.length === 2 &&
            new Set(alternatives.map((p) => p.optionGroup)).size === 1 &&
            alternatives[0].maxMarks != null &&
            alternatives[0].maxMarks === alternatives[1].maxMarks;
          const compulsory = parts.filter((p) => !p.optionGroup);
          let use = parts;
          let choiceParts: typeof parts = [];
          if (isChoice) {
            const attempted = new Set(
              (errsByNum.get(key) ?? []).map((e) => e.questionNumber),
            );
            const picked = alternatives.filter((p) =>
              attempted.has(p.questionNumber),
            );
            choiceParts = picked.length ? picked : alternatives;
            use = [...compulsory, ...choiceParts];
          }
          let text: string;
          if (isChoice) {
            const compText = compulsory
              .map((p) => p.questionText?.trim())
              .filter((t): t is string => !!t)
              .join("\n\n");
            const orText = choiceParts
              .map((p) => p.questionText?.trim())
              .filter((t): t is string => !!t)
              .join("\n\nOR\n\n");
            text = [compText, orText].filter(Boolean).join("\n\n");
          } else {
            const seenLabels = new Set<string>();
            const chunks: string[] = [];
            for (const p of use) {
              const t = p.questionText?.trim();
              if (!t) continue;
              const label = p.questionLabel?.trim().toLowerCase();
              if (label && p.optionGroup && seenLabels.has(label)) chunks.push("OR");
              if (label) seenLabels.add(label);
              chunks.push(t);
            }
            text = chunks.join("\n\n");
          }
          if (text) textByNum.set(key, text);
          const chapter = use.find((p) => p.chapterName)?.chapterName;
          if (chapter) chapterByNum.set(key, chapter);
          idsByNum.set(
            key,
            use.map((p) => p.id),
          );
          const keyTexts = use
            .map((p) => p.answerKey?.trim() || p.aiAnswer?.trim() || null)
            .filter((t): t is string => !!t);
          if (keyTexts.length) keyTextByNum.set(key, keyTexts);
        }
        const aiByKey = new Map<string, AiGrade>();
        for (const ag of aiGrades) {
          aiByKey.set(ag.questionKey ?? String(ag.questionNumber), ag);
        }
        // One list item per QUESTION: an answer often spans several crop
        // regions (multiple bbox rows) — the "Student answer" pager cycles
        // through them instead of repeating the question in the list.
        const byQuestion = new Map<string, typeof crops>();
        for (const c of crops) {
          const key = String(c.questionNumber ?? c.questionKey);
          const bucket = byQuestion.get(key) ?? [];
          bucket.push(c);
          byQuestion.set(key, bucket);
        }
        const items: QuestionListItem[] = Array.from(byQuestion.entries()).map(
          ([q, group]) => {
            const best = group.reduce(
              (a, b) => ((b.marks ?? -1) > (a.marks ?? -1) ? b : a),
              group[0],
            );
            const m = best.marks ?? 0;
            // whole-question attemptable max (handles the per-sub-part bbox
            // convention — a single row's max can be one part's max only)
            const mm = wholeQuestionMax(group) ?? best.maxMarks ?? 0;
            const num = best.questionNumber;
            const realText = num != null ? textByNum.get(num) : undefined;
            const images = Array.from(
              new Set(
                group.map((c) => c.croppedImageUrl).filter(Boolean) as string[],
              ),
            );
            return {
              id: `crop-${q}`,
              label: `Q ${q}`,
              exam: formatExamName(cropContext.exam),
              marks: `${m}/${mm} Marks`,
              question: realText ?? `Scanned answer for question ${q}.`,
              goingWrong: diagnosisFor(num),
              nextPractise: practiseForNum(num),
              imageUrl: images[0],
              images,
              chapter: num != null ? chapterByNum.get(num) : undefined,
              marksNum: best.marks ?? undefined,
              maxNum: mm > 0 ? mm : undefined,
              keyIds: num != null ? idsByNum.get(num) : undefined,
              fallbackAnswers:
                num != null ? (keyTextByNum.get(num) ?? undefined) : undefined,
              questionType: best.questionType,
              ...((() => {
                const ag = aiByKey.get(best.questionKey ?? String(best.questionNumber));
                if (!ag) return {};
                return {
                  aiMarks: ag.marksObtained,
                  aiMaxMarks: ag.maxMarks,
                  aiConfidence: ag.confidenceScore,
                  aiReviewFlag: ag.manualReviewFlag,
                  aiFeedback: ag.feedback,
                  aiCriteria: (() => { try { return ag.criteria ? JSON.parse(ag.criteria) : null; } catch { return null; } })(),
                  aiReviewStatus: ag.reviewStatus,
                  aiFinalMarks: ag.finalMarks,
                  aiEvalId: ag.id,
                };
              })()),
            };
          },
        );
        setCropItems(items);
      })
      .catch(() => {
        if (!ignore) setCropItems([]); // failed/none → fall back to placeholder
      });
    return () => {
      ignore = true;
    };
  }, [cropContext]);

  // 'View answer key' dialog: the question's answer key (all sub-parts) fetched on
  // demand — image/MCQ/clean text per part, with the paper's answer_key /
  // ai_answer text as fallback.
  const [answerOpen, setAnswerOpen] = useState(false);
  function openAnswer() {
    setAnswerOpen(true);
  }

  // Use real crops when we have them; otherwise the original placeholder design.
  const real = cropItems != null && cropItems.length > 0;
  const baseItems = real ? cropItems : questions;

  // Filters: real, functional options when showing real crops; the design's
  // static options only in placeholder mode.
  const [chapterFilter, setChapterFilter] = useState("All");
  const [scoredFilter, setScoredFilter] = useState("Select");
  const [sortOrder, setSortOrder] = useState("Select");
  const chapterOptions = real
    ? [
        "All",
        ...Array.from(
          new Set(baseItems.map((i) => i.chapter).filter(Boolean) as string[]),
        ).sort(),
      ]
    : ["All", "Probability", "Integration"];
  let items = baseItems;
  if (real) {
    if (chapterFilter !== "All")
      items = items.filter((i) => i.chapter === chapterFilter);
    if (scoredFilter === "Full marks")
      items = items.filter(
        (i) => i.marksNum != null && i.maxNum != null && i.marksNum >= i.maxNum,
      );
    if (scoredFilter === "Zero marks")
      items = items.filter((i) => (i.marksNum ?? 0) === 0);
    if (scoredFilter === "Partial marks")
      items = items.filter(
        (i) =>
          i.marksNum != null &&
          i.maxNum != null &&
          i.marksNum > 0 &&
          i.marksNum < i.maxNum,
      );
    items = [...items].sort((a, b) => {
      if (sortOrder === "Marks: high-low")
        return (b.marksNum ?? 0) - (a.marksNum ?? 0);
      if (sortOrder === "Marks: low-high")
        return (a.marksNum ?? 0) - (b.marksNum ?? 0);
      // 'Select' (default): question-paper order, parsed from the label ("Q 9" -> 9).
      const numOf = (i: QuestionListItem) =>
        parseFloat(i.label.replace(/^Q\s*/, "")) || 0;
      return numOf(a) - numOf(b);
    });
    if (items.length === 0) items = baseItems;
  }

  const [activeId, setActiveId] = useState(items[0].id);
  const [sheetIndex, setSheetIndex] = useState(1);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [changeMark, setChangeMark] = useState("");
  const [aiReviewing, setAiReviewing] = useState(false);


  const updateCropItem = (evalId: number, patch: Partial<QuestionListItem>) => {
    setCropItems((prev) =>
      prev?.map((c) => (c.aiEvalId === evalId ? { ...c, ...patch } : c)) ?? prev,
    );
  };

  // Keep the selection valid when the item list swaps (mock <-> real crops).
  useEffect(() => {
    if (!items.some((q) => q.id === activeId)) {
      setActiveId(items[0].id);
      setSheetIndex(1);
    }
  }, [items, activeId]);

  // Apply the caller-requested initial question once the real item list has
  // settled (crops loaded, or there's no cropContext so it never will be).
  const itemsSettled = !cropContext || cropItems !== null;
  const [appliedInitial, setAppliedInitial] = useState(false);
  useEffect(() => {
    if (
      appliedInitial ||
      !initialQuestionLabel ||
      !itemsSettled ||
      items.length === 0
    )
      return;
    const norm = (s: string) => s.replace(/\s+/g, "").toUpperCase();
    const match = items.find(
      (q) => norm(q.label) === norm(initialQuestionLabel),
    );
    if (match) {
      setActiveId(match.id);
      setSheetIndex(1);
    }
    setAppliedInitial(true);
  }, [itemsSettled, items, initialQuestionLabel, appliedInitial]);

  const active = items.find((q) => q.id === activeId) ?? items[0];
  const activeIndex = items.findIndex((q) => q.id === activeId);
  // Real mode with a crop that has no scan image: show an honest empty panel
  // (the Figma stand-in would read as a fake answer sheet). Placeholder image
  // only in design-preview mode.
  const sheetCount = real ? Math.max(1, active.images?.length ?? 0) : 0;
  // No Figma stand-in: an answer sheet the student never wrote reads as real.
  const activeImage = real
    ? active.images?.[Math.min(sheetIndex, sheetCount) - 1]
    : undefined;
  // Which src has finished loading. Derived rather than reset in an effect, so
  // changing question shows the loader on the very same render.
  const [loadedImage, setLoadedImage] = useState<string | undefined>(undefined);
  const imageLoading = !!activeImage && loadedImage !== activeImage;

  function goToNext() {
    const next = items[(activeIndex + 1) % items.length];
    setActiveId(next.id);
    setSheetIndex(1);
  }

  // `cropItems` is null both before the fetch resolves and when there is no
  // crop context at all, and `real` false falls back to the DESIGN PLACEHOLDER
  // question list. With a context that means a student watches a list of
  // invented questions and marks until their own crops land — worse than an
  // empty panel, because it looks like real work of theirs (beaver#786). The
  // placeholder stays for context-less design preview, which is what it's for.
  // Placed after every hook so the hook order never changes between renders.
  const cropsLoading = Boolean(cropContext) && cropItems === null;
  if (cropsLoading) {
    return (
      <div
        className={cn(
          "mt-4 border border-border rounded-2xl bg-background flex flex-col h-[640px] overflow-hidden",
          className,
        )}
      >
        <div className="h-16 px-4 flex items-center border-b border-border shrink-0">
          <p className="text-[20px] font-semibold leading-7 tracking-[-0.12px] text-foreground">
            Questions
          </p>
        </div>
        <div
          role="status"
          className="flex-1 flex items-center justify-center text-[14px] text-muted-foreground"
        >
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-4 border border-border rounded-2xl bg-background flex flex-col h-[640px] overflow-hidden",
        className,
      )}
    >
      {/* Header: title + filters */}
      <div className="h-16 px-4 flex items-center gap-3 border-b border-border shrink-0">
        <p className="flex-1 min-w-0 text-[20px] font-semibold leading-7 tracking-[-0.12px] text-foreground">
          Questions
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {showExamsFilter && (
            <FilterSelect
              label="Exams"
              defaultValue={formatExamName(cropContext?.exam)}
              options={[formatExamName(cropContext?.exam)]}
              value={formatExamName(cropContext?.exam)}
            />
          )}
          <FilterSelect
            label="Chapters"
            defaultValue="All"
            options={chapterOptions}
            value={real ? chapterFilter : undefined}
            onChange={real ? setChapterFilter : undefined}
          />
          {/* Mistake filter needs per-student error analytics (heron student-level) — hidden until that exists. */}
          {!real && (
            <FilterSelect
              label="Mistake"
              defaultValue="All"
              options={["All", "Foundational gaps", "Mistakes in steps"]}
            />
          )}
          <FilterSelect
            label="Scored"
            defaultValue="Select"
            options={["Select", "Full marks", "Partial marks", "Zero marks"]}
            value={real ? scoredFilter : undefined}
            onChange={real ? setScoredFilter : undefined}
          />
          <FilterSelect
            label="Sort"
            defaultValue="Select"
            options={["Select", "Marks: low-high", "Marks: high-low"]}
            value={real ? sortOrder : undefined}
            onChange={real ? setSortOrder : undefined}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 w-full">
        {/* Left: question list */}
        <div className="w-[120px] shrink-0 border-r border-border h-full overflow-y-auto">
          {items.map((q) => {
            const isActive = q.id === activeId;

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setActiveId(q.id);
                  setSheetIndex(1);
                }}
                className={`flex flex-col w-full px-4 py-4 border-b border-border text-left ${
                  isActive
                    ? "bg-[#f4f4f5] border-l-4 border-l-popover-foreground"
                    : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-[16px] font-medium leading-6 text-foreground whitespace-nowrap flex items-center gap-1">
                    {q.label}
                  </span>

                  {real && q.maxNum != null && q.marksNum != null && (
                    <span
                      className={cn(
                        "text-[10.5px] font-medium leading-4 px-1.5 py-0.5 rounded-md whitespace-nowrap",
                        q.marksNum === q.maxNum
                          ? "bg-[#ecfdf2] text-[#008a2e]"
                          : q.marksNum === 0
                            ? "bg-[#fff0f0] text-[#e60000]"
                            : "bg-[#fff7ed] text-[#c2410c]",
                      )}
                    >
                      {q.marksNum}/{q.maxNum}
                    </span>
                  )}
                </div>
                {real && q.questionType && q.maxNum != null && (
                  <span className="text-[11px] leading-4 text-muted-foreground mt-0.5">
                    {q.questionType === "MCQ" ? "MCQ" : q.questionType === "Short Answer" ? "SA" : q.questionType === "Long Answer" ? "LA" : q.questionType} · {q.maxNum}m
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Middle: response sheet image */}
        <div className="flex-1 min-w-0 p-4 flex flex-col gap-[10px]">
          <div className="flex items-center gap-[10px] w-full">
            <p className="flex-1 min-w-0 text-[18px] font-medium leading-7 tracking-[-0.108px] text-foreground">
              Student answer
            </p>
      
            
          </div>
          <div
            className={cn(
              "relative flex-1 min-h-0 rounded-lg overflow-hidden border border-border",
              activeImage ? "bg-[#A9A9A9]" : "bg-white",
            )}
          >
            {activeImage ? (
              <>
                <img
                  src={activeImage}
                  alt="Student answer"
                  // Hidden until THIS src has loaded. Without it the browser
                  // keeps painting the previous answer while the next one
                  // downloads, so switching question looks like nothing changed.
                  onLoad={() => setLoadedImage(activeImage)}
                  // Settle on error too, or a broken crop spins forever.
                  onError={() => setLoadedImage(activeImage)}
                  className={cn(
                    "w-full h-full object-contain transition-opacity duration-150",
                    imageLoading && "opacity-0",
                  )}
                />
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background">
                    <Spinner className="size-6 text-muted-foreground" />
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-6">
                <img
                  src="/illustrations/no-answer-found.svg"
                  alt=""
                  className="w-[226px] h-auto"
                />
                <div className="flex flex-col items-center gap-1 text-center text-foreground/70">
                  <p className="text-[18px] font-semibold leading-7 tracking-[-0.108px]">
                    No answer found
                  </p>
                  <p className="text-[16px] font-medium leading-6">
                    This happens when the student did not attempt the question
                    or the response could not be retrieved.
                  </p>
                </div>
              </div>
            )}
            {activeImage && (
              <button
                type="button"
                onClick={() => setImageExpanded(true)}
                className="absolute bottom-4 right-3.5 flex items-center gap-2 bg-[#3f3f46] text-white text-[12px] font-medium leading-4 tracking-[-0.072px] px-1.5 py-1.5 rounded hover:bg-[#52525b] transition-colors"
              >
                <Maximize2 className="size-4" />
                Click to expand
              </button>
            )}
          </div>
        </div>

        <AnswerKeyDialog
          open={answerOpen}
          onOpenChange={setAnswerOpen}
          label={active.label}
          partIds={active.keyIds ?? []}
          fallbackAnswers={active.fallbackAnswers ?? []}
        />

        <Dialog open={imageExpanded} onOpenChange={setImageExpanded}>
          <DialogContent className="max-w-[90vw] sm:max-w-[90vw] p-2 bg-[#A9A9A9] border-none">
            <DialogTitle className="sr-only">Student answer</DialogTitle>
            {activeImage && (
              <img
                src={activeImage}
                alt="Student answer"
                className="w-full max-h-[85vh] object-contain"
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Change AI mark modal */}
        <Dialog open={changeModalOpen} onOpenChange={setChangeModalOpen}>
          <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
            {/* Title + confidence badge */}
            <div className="px-5 pt-4 pb-2 pr-10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-[16px] font-semibold leading-6 text-foreground">
                  Edit marks · {active.label}
                </DialogTitle>
                <p className="text-[12px] text-muted-foreground mt-0.5 leading-4">
                  {active.chapter ? `${active.chapter} · ` : ""}{active.aiMaxMarks ?? active.maxNum} marks{active.questionType ? ` · ${active.questionType}` : ""}
                </p>
              </div>
              {active.aiConfidence != null && (
                <span className={cn(
                  "text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap",
                  active.aiConfidence >= 0.9
                    ? "border-[#008a2e]/30 text-[#008a2e] bg-[#ecfdf2]"
                    : active.aiConfidence >= 0.7
                      ? "border-[#c2410c]/30 text-[#c2410c] bg-[#fff7ed]"
                      : "border-[#e60000]/30 text-[#e60000] bg-[#fff0f0]",
                )}>
                  Grading confidence score {Math.round(active.aiConfidence * 100)}%
                </span>
              )}
            </div>

            {/* AI PROPOSED / FINAL MARK */}
            <div className="px-5 py-3 flex items-end gap-8 border-t border-border">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Graded Marks</p>
                <p className="text-[22px] font-semibold leading-7 text-foreground tabular-nums">
                  {active.aiMarks}/{active.aiMaxMarks ?? active.maxNum}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Final mark</p>
                <p className="text-[22px] font-semibold leading-7 text-[#008a2e] tabular-nums">
                  {changeMark}/{active.aiMaxMarks ?? active.maxNum}
                </p>
              </div>
            </div>

            {/* HOW THE AI GRADED THIS */}
            {active.aiFeedback && (
              <div className="px-5 py-3 border-t border-border">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Grading Reason</p>
                <p className="text-[13px] leading-5 text-foreground max-h-[120px] overflow-y-auto">{active.aiFeedback}</p>
              </div>
            )}

            {/* SET THE MARK */}
            <div className="px-5 py-3 border-t border-border">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Set the mark</p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={active.aiMaxMarks ?? active.maxNum ?? 0}
                  step={0.5}
                  value={changeMark}
                  onChange={(e) => setChangeMark(e.target.value)}
                  className="w-16 h-9 text-center text-[14px] font-medium border border-border rounded-md outline-none focus:ring-2 focus:ring-ring/40"
                />
                <span className="text-[13px] text-muted-foreground">out of {active.aiMaxMarks ?? active.maxNum}</span>
                {[0, (active.aiMaxMarks ?? active.maxNum ?? 0) / 2, active.aiMaxMarks ?? active.maxNum ?? 0]
                  .filter((v): v is number => v != null)
                  .map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setChangeMark(String(v))}
                    className={cn(
                      "h-8 w-8 rounded border text-[12px] font-medium transition-colors",
                      String(v) === changeMark
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Type any value up to {active.aiMaxMarks ?? active.maxNum}. Half marks allowed.
              </p>
            </div>

            {/* Cancel / Confirm */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <Button variant="outline" size="sm" className="h-9 text-[13px] px-4" onClick={() => setChangeModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 text-[13px] px-4 bg-[#008a2e] hover:bg-[#006b24] text-white"
                disabled={aiReviewing || !changeMark}
                onClick={async () => {
                  if (!active.aiEvalId) return;
                  const mark = parseFloat(changeMark);
                  if (isNaN(mark)) return;
                  setAiReviewing(true);
                  try {
                    await reviewAiGrade(active.aiEvalId, "change", mark);
                    updateCropItem(active.aiEvalId, {
                      aiReviewStatus: "changed",
                      aiFinalMarks: mark,
                    });
                    setChangeModalOpen(false);
                  } finally { setAiReviewing(false); }
                }}
              >
                Confirm marks
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Right: question detail card */}
        <div className="w-[380px] shrink-0 border-l border-border shadow-sm flex flex-col h-full">
          <div className="flex-1 min-h-0 overflow-y-auto px-4">
            <div className="flex flex-col gap-3 pb-6">
              <div className="pt-4 flex flex-col gap-2">
                <div className="flex items-center gap-px w-full">
                  <p className="flex-1 min-w-0 text-[16px] font-medium leading-6 text-foreground">
                    Question
                  </p>
                </div>
                <ClampedQuestion key={active.id} text={active.question} />
                {active.keyIds?.length || active.fallbackAnswers?.length ? (
                  <button
                    type="button"
                    onClick={openAnswer}
                    className="flex items-center gap-1 w-fit"
                  >
                    <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-[#008a2e]">
                      View answer key
                    </span>
                    <ArrowRight className="size-4 text-[#008a2e]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 w-fit opacity-50 cursor-default"
                  >
                    <span className="text-[14px] font-medium leading-5 tracking-[-0.084px] text-muted-foreground">
                      No answer key yet
                    </span>
                  </button>
                )}
              </div>
              {/* Each panel stands on its own: an answer can carry a diagnosis
                  with no practice advice (uncoded_error), and a panel with
                  nothing in it is worse than no panel. */}
              {showAnswerScriptFeedback && active.goingWrong && (
                <div className="bg-[#fff0f0] border border-[#ffe0e1] rounded-lg p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="size-4 text-[#e76e4f] shrink-0" />
                    <span className="text-[16px] font-medium leading-6 text-[#e76e4f]">
                      What went wrong
                    </span>
                  </div>
                  <p className="text-[16px] font-medium leading-6 text-foreground">
                    {active.goingWrong}
                  </p>
                </div>
              )}
              {showAnswerScriptFeedback && active.nextPractise && (
                <div className="bg-[#ecfdf2] border border-[#d3fde5] rounded-lg p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="size-4 text-[#008a2e] shrink-0" />
                    <span className="text-[16px] font-medium leading-6 text-[#008a2e]">
                      Next practise
                    </span>
                  </div>
                  <p className="text-[16px] font-medium leading-6 text-foreground">
                    {active.nextPractise}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* AI grading section — only when AI data exists */}
          {active.aiMarks != null && (
            <div className="border-t border-border px-4 py-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Graded Marks</p>
                    <p className="text-[20px] font-semibold leading-7 text-foreground tabular-nums">
                      {active.aiMarks}/{active.aiMaxMarks ?? active.maxNum}
                    </p>
                  </div>
                  {active.aiConfidence != null && (
                    <span className={cn(
                      "text-[12px] font-medium leading-4 px-2 py-1 rounded-md",
                      active.aiConfidence >= 0.9
                        ? "bg-[#ecfdf2] text-[#008a2e]"
                        : active.aiConfidence >= 0.7
                          ? "bg-[#fff7ed] text-[#c2410c]"
                          : "bg-[#fff0f0] text-[#e60000]",
                    )}>
                      {Math.round(active.aiConfidence * 100)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {active.aiReviewStatus === "accepted" || active.aiReviewStatus === "changed" ? (
                    <button
                      className="text-[12px] font-medium text-[#008a2e] bg-[#ecfdf2] px-2 py-1 rounded-md hover:bg-[#d4f5e0] transition-colors cursor-pointer"
                      title="Click to change mark"
                      onClick={() => {
                        setChangeMark(String(active.aiFinalMarks ?? active.aiMarks ?? 0));
                        setChangeModalOpen(true);
                      }}
                    >
                      <Pencil className="size-3 inline mr-1" />
                      {active.aiReviewStatus === "accepted" ? "Accepted" : "Changed to"} {active.aiFinalMarks}/{active.aiMaxMarks ?? active.maxNum}
                    </button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[13px] font-medium gap-1"
                        onClick={() => {
                          setChangeMark(String(active.aiMarks ?? 0));
                          setChangeModalOpen(true);
                        }}
                      >
                        <Pencil className="size-3" />
                        Change
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[13px] font-medium gap-1 border-[#008a2e] text-[#008a2e] hover:bg-[#ecfdf2]"
                        disabled={aiReviewing}
                        onClick={async () => {
                          if (!active.aiEvalId) return;
                          setAiReviewing(true);
                          try {
                            await reviewAiGrade(active.aiEvalId, "accept");
                            updateCropItem(active.aiEvalId, {
                              aiReviewStatus: "accepted",
                              aiFinalMarks: active.aiMarks,
                            });
                          } finally { setAiReviewing(false); }
                        }}
                      >
                        <CheckCircle className="size-3.5" />
                        Accept {active.aiMarks}/{active.aiMaxMarks ?? active.maxNum}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-border p-4 flex items-center justify-end shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-9 text-[14px] font-medium"
              onClick={goToNext}
            >
              Next question
              <ChevronRight className="size-4" />
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
