## Problem

On the teacher **Question Detail** page, a question like **Q17** is stored as sub-part rows **17.1–17.7** (an either/or option group sharing an `option_group`). Marks live on the whole-question crop (keyed by `17`); the sub-part crops carry `0`. So the page showed each sub-part as a separate **0%-performance** entry with no summary — when the real whole-Q17 is ~49%.

## Change (all display-side — no backend, no query-param changes)

The page now collapses sub-parts into ONE whole question, reusing the exact convention already in `app/lib/questions.ts` `fetchQuestions()`.

1. **Whole-question resolution** — from the route id's `questionNumber`, `whole = Math.trunc(...)`; `parts` = all paper questions with `Math.trunc(part.questionNumber) === whole`, sorted.
2. **Header/metadata (collapsed)** — title `Q{whole}`; Marks = sum of `parts[].maxMarks`; Chapter / Bloom's / Difficulty / weightage = first part's non-null value (`pick`, mirroring `fetchQuestions`).
3. **Body = full question** — every part's `questionText` rendered in order via `LatexPreview`, inside the existing expand/"…more" collapse (Q17 shows a–d … OR … a–c).
4. **Diagrams** — each part's `diagramCropUrl` that is set, stacked; honest empty state (no broken-image icon). Answer-key crop stays behind the button.
5. **Answer key** — `fetchAnswerKey` called per part; dialog shows a section per part (labelled by sub-part number when >1); button disabled only if NO part has a key.
6. **Stats** — `fetchQuestionStatsSmart(firstPartId, whole, ctx)` so the crop fallback (keyed by whole number) returns the whole-question ~49% distribution/average, not a sub-part 0%. The Marks Distribution X-axis uses the whole-crop attemptable max.
7. **AI summary** — `fetchQuestionSectionSummary` called with `questionNumber = whole` (summaries are stored keyed to the whole number); PR #162 source-order otherwise.
8. **Dropdown** — `siblings` collapsed to DISTINCT whole questions (one entry per `Math.trunc`, id = the whole's first-part id); `activeId` = current whole's first-part id, `activeLabel` = `Q{whole}`. Never shows sub-part `.1/.2` entries.

Layout/styling unchanged (same cards, same "Question Performance" panel, same expand behavior). The non-functional "1/1" pager is left as-is (out of scope).

## Verification

- Chemistry paper (grade 12, section H, exam `12_Chemistry_Unit-Test -1_26_27`): Q17 = rows 17.1–17.7; whole-Q17 crop stats = **49.4%** across 33 students; the section-summary endpoint returns copy for `questionNumber=17`.
- Result: the dropdown shows **whole-only** (Q16, Q17, …) while the body shows **all sub-parts** together, and stats/summary reflect the whole question.
- `npx tsc --noEmit` and `npx next build` both pass.
