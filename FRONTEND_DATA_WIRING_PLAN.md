# Frontend Data Wiring Plan — replace hardcoded content with real loam_db data

> **HARD RULE: never modify the UI design.** Only swap data sources. Layout, styling, spacing, components, copy structure stay pixel-identical to the Figma design. Transient loading/empty/error states are the only additions allowed.

## Context

The LOAM frontend (`repo/loam`) shipped as a Figma design implementation with ~20 pages/components rendering **hardcoded** domain data. Already wired this session (to a locally-run `aggregatedData` on `:8082` reading a synced local `loam_db`): chapter list, student roster, question list, teacher dashboard, and the "Response sheet" answer-crop panels. Goal now: **remove the remaining hardcoded content, one surface at a time, starting with real question text** ("use the question papers to display the actual questions — that's already in loam_db").

**Decisive constraint** (verified read-only):
- Real **question text lives in `loam_db.questions`** for every exam (e.g. `11_CHEMISTRY_ANNUALEXAMINATION_25-26` = 138 questions, `Preboard 1` = 55, `Annual Examination` = 89) — LaTeX-laden MCQ/VSA/SA text.
- The existing **`GET /api/questions` is analytics-gated** (INNER-joins `students → student_transitions → student_exams → answer_papers → answers`): 44 rows for the analytics slice (grade 12 **section C**), **0 rows for the scanned sections (S) and all of grade 11** — exactly where the real students/crops are.
- So **question text/marks must come from a paper-based source** (`question_papers → questions → concepts → chapters`), decoupled from student-answer joins. Per-question/per-student **analytics** (accuracy %, error breakdown, mistakes, cohorts) stays analytics-gated → **show where available, `—` otherwise** (same honest pattern the roster uses).

## Guiding rules
- **Never change the UI design** (see top). Data-source swaps only.
- **Additive backend only.** Do NOT modify endpoints beaver/classLens consume (esp. `/api/questions`). Add new endpoints.
- **Everything stays local; nothing pushed.** Backend runs locally against the synced `loam_db`; dev-only shims remain.
- **Reuse over rebuild.** Pages 3–6 (exam/chapter/student detail + analysis tables) reuse the SAME mock objects — a shared fetch layer keyed by exam/chapter/student/question replaces them together.

---

## Phase 0 — Backend: a paper-based question source (small, additive)

Analytics-decoupled endpoints reading `questions ⋈ question_papers ⋈ concepts ⋈ chapters` (no student/answer joins) — real question text for ANY class incl. grade 11 / section S.

- **`GET /api/question-paper/questions?grade&subject&exam`** → `List<PaperQuestionDTO>`.
- **`GET /api/question-paper/questions/{id}`** → `PaperQuestionDTO` (by `questions.id`; for the detail page which only has the id in its route).
- `PaperQuestionDTO`: `id, questionNumber, questionText, questionType, maxMarks, chapterName, chapterNumber, concept, weightageTag, bloomTaxonomy, difficultyLevel, questionLabel, exam, subject, grade, answerKey, aiAnswer, hasDiagram, diagramCropUrl`. (All exist on `questions`; note `bloom_taxonomy` and `difficulty_level` ARE in loam_db — Bloom is not a gap.)

New `controller/QuestionPaperController.java` (JdbcTemplate pattern like `AnswerCropsController`), `dto/PaperQuestionDTO.java`. Compile + restart the local backend. `/api/questions`, `/api/questions/{id}/stats`, `/api/chapter-details`, `/api/students`, `/api/student-comparison/*`, `/api/exam-overview/overview` stay unchanged for analytics overlay.

## Phase 0b — Frontend foundation
- `app/lib/questions.ts`: add `fetchPaperQuestions(filters)` + `fetchQuestionById(id)`; keep analytics `fetchQuestions` for accuracy overlay.
- **Context in nav links.** Extend the query-param pattern already used for `/student/[id]` to question list → `/question/[id]?grade&section&subject&exam`, chapter list → `/chapter/[id]?…`, exam links → `/exam/[id]?…`. Detail pages read via `useSearchParams`.
- **Shared fetch hooks** keyed by exam/chapter/student/question, replacing the duplicated mock objects across teacher + student-role detail pages from one place.

## Phase 1 — Question text (priority)
1. `app/question/[questionId]/page.tsx` (ignores its route id today) → `fetchQuestionById(id)` for real text/marks/type/chapter/weightage; `/api/questions/{id}/stats?section=` for score-distribution + section avg where available; mistakes ← `stats.commonMistakes/keyInsights`; "View answer" ← `answerKey/aiAnswer` or `/api/answer-key/*`.
2. `app/(dashboard)/question/page.tsx` → source from `fetchPaperQuestions` so the list shows text for ALL classes; overlay accuracy from analytics `/api/questions` where present.
3. `components/performance-tab.tsx` → join each crop's `questionNumber` → paper `questionText`; replace hardcoded fallback `questions` array + placeholder going-wrong/next-practise.
4. `components/analysis-question-table.tsx` (+ `analysis-detail-sheet.tsx`) → rows from paper questions; sheet accuracy/errors from `/api/questions/{id}/stats` where available.

## Phase 2 — Detail pages (shared fetch layer)
5. `app/exam/[examId]/page.tsx` (+ `components/student-exam-detail.tsx`) → `/api/exam-overview/overview` + per-question `stats`.
6. `app/chapter/[chapterId]/page.tsx` (+ `components/student-chapter-detail.tsx`) → `/api/chapter-details` (already returns `questionsFromThisChapter[].questionText`, `conceptsInThisChapter`, `errorTypeBreakdown`, `performanceSummary`); cohorts ← `/api/section-insights` or exam-overview buckets; chart ← `/api/chapter-comparison`.
7. `app/student/[studentId]/page.tsx` (Analysis tab) → `/api/students` + `/api/student-comparison/individual-detail`.

## Phase 3 — Analysis components, student-role views, lists, evidence images
- `components/analysis-chart.tsx`, `analysis-chapter-table.tsx`, `analysis-student-table.tsx` ← exam context.
- Student-role duplicates reuse shared hooks: `student-chapter-page.tsx`, `student-dashboard.tsx`, `student-exam-detail.tsx`, `student-chapter-detail.tsx`, `student-analysis-tab.tsx`.
- `app/(dashboard)/exams/page.tsx` ← `/api/filters/grades` + per-exam class averages.
- Evidence images: `question-drawer.tsx` `ANSWER_IMAGES` + page `ANSWER_IMAGE` → real R2 crops from `/api/answer-crops`.

## Phase 4 — Cleanup (confirm before deleting)
- `components/analysis-question-dialog.tsx` (dead), `app/(dashboard)/dashboard/assessment/[examId]/page.tsx` (orphan), shadowed placeholder consts + tooltip strings in `dashboard/page.tsx`.

## Known gaps / decisions
- Question text + marks = paper-based (all classes). Accuracy/error/mistakes/cohorts = analytics-gated → real for section-C-style classes, `—` elsewhere (approved).
- `bloom_taxonomy` + `difficulty_level` ARE in loam_db (`questions`) — expose them (Bloom no longer a gap).
- Two summary-table spellings exist (`question_errortype_summary` vs `questions_errortype_summary`) — use the analytics-path spelling.
- `ChapterDetailsDTO` has JSON keys with spaces (`"Concepts in this Chapter"`, `"Questions from this Chapter"`) — handle in TS types.

## Verification (end-to-end, local)
1. Backend: add endpoint, `mvn compile`, restart local `aggregatedData`, `curl /api/question-paper/questions?grade=11&subject=Chemistry&exam=11_CHEMISTRY_ANNUALEXAMINATION_25-26` → real text.
2. Frontend: `npx tsc --noEmit`; load each wired page; confirm real question text renders for a scanned class (grade 11 Chemistry, grade 12 section S) and analytics fills where available (section C), `—` otherwise. **UI must look identical to before.**
3. Per surface, verify via the dev-login browser chain that the exact query returns real rows and the page compiles (HTTP 200).
4. One surface at a time (Phase 1 → 4); typecheck + spot-check each before moving on.
