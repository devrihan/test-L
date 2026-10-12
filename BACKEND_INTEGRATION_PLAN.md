# LOAM Frontend → `loam_db` Backend Integration — Plan & Findings

**Date:** 2026-07-12
**Author:** analysis pass over `loam` (frontend), `loam-jpa-common` + `loamDBMigrations` (schema), `aggregatedData` + `beaver-api` (services)
**Goal:** wire the LOAM analytics frontend (currently 100% mock data) to the real `loam_db` data, cataloguing what already exists vs. what must be built.

---

## 1. Executive summary

**Headline: most of what the frontend needs already exists as purpose-built analytics endpoints.** The `aggregatedData` service (Spring Boot, `:8082`) already computes and serves the learning-analytics DTOs the UI wants — chapter accuracy, question analytics, per-student performance, error-type breakdowns, common mistakes, cross-exam comparisons, section insights. The `loam_db` schema is rich and the analytics rollups are pre-aggregated into summary tables.

Rough split of the 15 distinct frontend entities:

| Bucket | Share | Meaning |
|---|---|---|
| ✅ **Ready** — endpoint + DTO exist, only field/shape adaptation in the frontend | ~55% | chapter list/detail, question list/stats, student roster/performance, error-type breakdowns, per-question common mistakes, cross-exam comparisons, section insights, grade/exam filters |
| 🟡 **Adapt + light backend work** — data exists but needs a new/thin endpoint or composition | ~30% | dashboard exam-list with trend, remediation topic framing, score-distribution histograms, subject/section filters, viewer capabilities+scope resolver, roster strongest/weakest |
| 🔴 **Build** — logic or data not present today | ~15% | named behavioural "smart cohorts", class-11-vs-12 mistake lineage, Bloom's-taxonomy question tagging, scanned answer-image evidence (cross-service to beaver-api) |

**The single largest piece of net-new work is not backend — it's the frontend data-access layer.** Today every page uses hardcoded arrays; there is no API client, no fetch hooks, and the mock field shapes differ from the DTOs (percentages as `'37%'` strings, scores as `'50/80'`, inconsistent id types). That adapter/plumbing layer is the bulk of the effort.

---

## 2. Architecture map

```
 ┌────────────────────┐     NEXT_PUBLIC_API_URL (8082)           ┌──────────────────────┐
 │  loam (Next.js)    │───▶ NEXT_PUBLIC_AGGREGATED_DATA_API_URL ─▶│ aggregatedData :8082 │──▶ loam_db (analytics warehouse)
 │  THIS REPO         │     (both point at aggregatedData)        │ Spring Boot / JPA    │
 │  — mock data today │                                           └──────────────────────┘
 │                    │     NEXT_PUBLIC_BEAVER_API_URL (4000)     ┌──────────────────────┐
 │                    │───▶ ─────────────────────────────────────▶│ beaver-api :4000     │──▶ loam_ops (scans, bboxes, crops)
 └────────────────────┘                                           │ Express / raw SQL    │
                                                                  └──────────────────────┘
```

- **`aggregatedData` (:8082)** — reads `loam_db`. This is the analytics brain and serves ~30 read endpoints returning finished analytics DTOs. **This is where ~90% of frontend data comes from.**
- **`beaver-api` (:4000)** — reads `loam_ops` (the ops/scanning DB). Owns raw scanned pages, bounding boxes, and **cropped answer images**. The frontend only needs it for **student-work evidence images**. Its other surfaces are pipeline/review ops, not learning analytics.
- The frontend's two API-URL env vars `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_AGGREGATED_DATA_API_URL` both default to `:8082` (same service) — they are currently **unused in code**.

**Data spine in `loam_db`:** `School → Section (→ Grade)`; `Student` placement via `student_transitions`; curriculum `Grade+Subject → Unit → Chapter → Concept`; exams `QuestionPaper → Question → Concept`; grading `Student × QuestionPaper = StudentExam → AnswerPaper → EvaluationResult (per question)`. Analytics summary tables key off `student_id` / `question_paper_id` / `concept_id|chapter_id|question_id`.

---

## 3. The mapping — every frontend entity → data source → status

Legend: ✅ ready · 🟡 adapt/light-build · 🔴 build

| # | Frontend entity (from mock contract) | Existing endpoint (aggregatedData unless noted) | Backing `loam_db` tables | Status | Notes / gap |
|---|---|---|---|---|---|
| 1 | **Viewer / User** (userId, displayName, org, roleLabel, capabilities, questionsView, scope) | Auth already real (Keycloak JWT via `app/lib/auth.ts`); `beaver-api /api/registry/me` | `teachers`, `teacher_allocated_sections`, `sections`, `students`, `student_transitions` | 🟡 | Identity/roles ready from JWT. **`capabilities`** are role-derived (compute client-side). **`scope`**: teacher→allocated sections needs a **new endpoint** (repo method `TeacherAllocatedSectionRepository.findByTeacherId` exists, no REST). Recommend a thin `GET /api/viewer` resolver. |
| 2 | **Subject / Grade / Section / Exam filters** | `GET /api/filters/grades`, `GET /api/filters/exams` | `grades`, `exam_types`, `question_papers`, `subjects`, `sections` | 🟡 | Grades + exams ✅. **No `/subjects` or `/sections` filter endpoint** — add two thin ones (or derive sections from viewer scope). |
| 3 | **Exam / Assessment** (dashboard table: name, date, maxMarks, classAvg, trend, marksSlipped) | `GET /api/exam-overview/overview` (class avg, movers — but needs examA+examB), `GET /api/filters/exams` | `question_papers`, `student_exams`, `ai_evaluation_results` | 🟡 | Exam list ✅; per-exam **class-average + trend + marksSlipped as a single-exam list** has no endpoint. Add a lightweight `GET /api/exams/summary?grade&section&subject` returning the dashboard row shape. Trend = delta vs prior exam. |
| 4 | **Chapter** (list + detail: sectionAvg, classAvg, status, statusDescription, avgAcrossExams, relatedExams/questions) | `GET /api/chapters` (`ChapterAccuracyDTO`), `GET /api/chapter-details` (`ChapterDetailsDTO`), `GET /api/chapter-comparison/*` | `chapters`, `concepts`, `questions`, `ai_evaluation_results`, `student_chapter_accuracy`, `chapter_summary` | ✅ | Extremely well covered. `avgAcrossExams` = `chapter_summary.exam_accuracy` or `/chapter-comparison`. `status/statusDescription` = `ChapterAccuracyDTO.status` + chapter insights. Field-name adaptation only. |
| 5 | **Question** (list + detail: label, chapter, concept, bloomType, classAvg, marks, text, weightage, page, scoreDistribution) | `GET /api/questions` (`QuestionDTO`), `GET /api/questions/{id}/stats` (`QuestionStatsDTO`) | `questions`, `ai_evaluation_results`, `question_errortype_summary`, `question_common_mistakes` | 🟡 | Analytics ✅. **Gaps:** (a) `bloomType` (Remember/Understand/Apply/Analyse) is **not in DB** — `questions.question_type` is CBSE format (MCQ/VSA/SA…), a different axis → needs classification or a new column; (b) full **marks histogram** (0→4 counts) — `QuestionStatsDTO` has 4 KPI buckets, not a per-mark distribution → compute. |
| 6 | **Student** (roster + profile: strongest/weakest chapter, commonMistake, score, status, by-exam/chapter/question averages) | `GET /api/students` (`StudentAccuracyDTO`), `GET /api/student-comparison/individual-detail` (strongest/weakest), `GET /api/exams/{id}/students` | `students`, `student_chapter_accuracy`, `student_concept_accuracy`, `ai_evaluation_results`, `student_exam_comparison_summary` | ✅/🟡 | Performance/error profile ✅. `strongest/weakestChapters` present in comparison-detail; **roster-level** strongest/weakest may need adding to `StudentAccuracyDTO`. by-exam/chapter/question trend series composable from accuracy tables. |
| 7 | **Performance datapoint / trend** (generic {label,value}) | composed from `/api/chapters`, `/api/students`, `/api/exam-overview` | (as above) | ✅ | Pure frontend adaptation; pick the series from the relevant call. |
| 8 | **Score-distribution bucket** (histogram, e.g. 57–64 → 10 students) | — none — | `ai_evaluation_results` / `answers` (marks), `student_exam_marks` | 🔴→🟡 | No histogram endpoint. Add `GET /api/exams/{id}/score-distribution` (and per-question variant). Straightforward aggregation over marks. |
| 9 | **Remediation topic** (TopicRow: topic, studentCount, marksValue, whatGoingWrong, whatToPractise, scoring vs distribution) | `ExamComparisonDTO.recommendedFocusAreas`, `StudentAccuracyDTO.recommendedFocusAreas`, `ChapterDetailsDTO` (weakConcepts, recommendation, potentialGain) | `chapter_summary`, `student_chapter_accuracy`, `question_errortype_summary` | 🟡 | Recommendation data exists. The exact two-bucket framing ("easy marks left on the table" vs "marks lost / distribution") plus per-topic `whatGoingWrong`/`whatToPractise` prose needs **composition** (and possibly LLM-generated practise text). Partly present as `recommendation`/`potentialGain`. |
| 10 | **Common mistake** (type foundational/steps/calculation/reads, title, marksLost, studentCount, seenIn[]) | `QuestionStatsDTO.commonMistakes`, `QuestionStatsDTO.errorTypeBreakdown` | `question_common_mistakes`, `question_errortype_summary`, `ai_evaluation_results` | ✅/🟡 | Per-question ✅. **Gaps:** (a) map DB `error_type` strings → the frontend's 4-category taxonomy; (b) **chapter-level** mistake aggregation (frontend shows mistakes per chapter) is per-question today → aggregate. |
| 11 | **Mistake evidence — student work** (studentName, Q#, marks, goingWrong, nextPractise, **answerImageUrl**) | `GET /api/exams/{id}/students` (marks + AI feedback + extractedText); **beaver-api** for the crop image | `ai_evaluation_results`, `answer_papers.diagram_crop_url` (loam_db) + **loam_ops** `answer_bboxes` / cropped-image-url (beaver-api) | 🔴 | Marks/feedback ✅. The **scanned answer-crop image** lives in `loam_ops` (beaver-api) — requires **cross-service composition**. `goingWrong`/`nextPractise` map from `ai_evaluation_feedback`. |
| 12 | **Error-type breakdown** (AnalysisDetailData: accuracy, segments, legend Conceptual/Calculation/Skipped, bullets) | nested in `ChapterDetailsDTO`, `QuestionStatsDTO`, `StudentAccuracyDTO`; `QuestionStatsDTO.keyInsights` | `question_errortype_summary`, `ai_evaluation_results.error_type/subtype` | ✅/🟡 | Data ✅. Need to map DB error types → the fixed 3-segment legend (Conceptual/Calculation/Skipped). Insight bullets = `keyInsights`/`diagnosis`. |
| 13 | **Smart cohort** (named: Foundational Gap / Inconsistent Performers / Careless Execution / Avoiders) | closest: `exam-overview` student buckets, `student-comparison/summary` (topImprovers/needsAttention/consistentlyWeak) | `student_exam_error_comparison`, `student_chapter_accuracy`, `section_insights` | 🔴 | The **named behavioural cohorts don't exist**. Existing buckets are performance-tier, not behaviour-pattern. Build a classifier (rules/LLM over error profiles); natural home is `section_insights` (typed JSON) surfaced via `GET /api/section-insights`. |
| 14 | **Cross-exam mistake comparison** (origin: carried-from-class-11 vs new-in-class-12) | `GET /api/student-comparison/*`, `GET /api/chapter-comparison/*` (exam-to-exam shift) | `student_comparison_errortype_summary`, `student_exam_error_comparison`, `student_transitions` | 🔴 | Exam-to-exam error shift ✅. The **prior-year (class 11 vs 12) lineage** framing is not modelled — needs linking historical papers via `student_transitions` + a cross-year comparison. |
| 15 | **Student per-question response** (PerformanceTab: label, marks, questionText, goingWrong, nextPractise, **responseSheetImages**, answerKey) | `GET /api/exams/{id}/students` (`StudentDataDTO.questions`) | `ai_evaluation_results`, `answer_key`, `answer_papers` + **loam_ops** crops (beaver-api) | 🟡/🔴 | Everything except **response-sheet images** is ready in `StudentDataDTO` (answerKey, marksObtained, errorType, aiEvaluationFeedback). Images = beaver-api cross-service (as #11). |

---

## 4. What's already found (reusable analytics endpoints)

These `aggregatedData` endpoints are production analytics DTOs ready to consume as-is:

| Frontend need | Endpoint | DTO |
|---|---|---|
| Student roster + performance | `GET /api/students` | `StudentAccuracyDTO` |
| Per-student per-question answers | `GET /api/exams/{examId}/students` | `StudentDataDTO` |
| Chapter accuracy ranking | `GET /api/chapters` | `ChapterAccuracyDTO` |
| Chapter deep-dive (concepts, errors, questions, struggling students) | `GET /api/chapter-details` | `ChapterDetailsDTO` |
| Section insights | `GET /api/section-insights` | `SectionInsightsDTO` |
| Two-exam class overview + movers | `GET /api/exam-overview/overview` | `ExamOverviewDTO` |
| Question list (per-exam accuracy) | `GET /api/questions` | `QuestionDTO` |
| Single-question deep analytics | `GET /api/questions/{id}/stats` | `QuestionStatsDTO` |
| Cross-exam chapter comparison | `GET /api/chapter-comparison/overview` · `/chapter` · `/chapter-summary` | `ComparisonDTO`, `ExamComparisonDTO` |
| Cross-exam student comparison | `GET /api/student-comparison/list` · `/individual-detail` · `/summary` | `StudentComparison*DTO` |
| Filters (grades / exams) | `GET /api/filters/grades` · `/api/filters/exams` | `GradeFilterDTO`, exam options |

**Operational dependency:** several analytics reads (`/api/data-quality/.../comparison-summary`, `/diagnosis`, `/chapter-summary`) are served from **persisted** tables and depend on populate jobs having run: `POST /api/admin/accuracy-detail/populate-all`, `POST /api/section-insights/trigger`. Wire these into the deploy/refresh cycle.

---

## 5. What needs building (the gap list)

**Frontend (largest effort — all net-new in this repo):**
1. **API client + data-access layer** — base fetch wrapper, auth-token injection (reuse the `token` cookie / `app/lib/auth.ts`), env-var wiring (`NEXT_PUBLIC_AGGREGATED_DATA_API_URL`, `NEXT_PUBLIC_BEAVER_API_URL`), error/loading states.
2. **Per-page fetch hooks** replacing every hardcoded array (dashboard, chapter list/detail, student list/detail, question list/detail, exam detail, PerformanceTab, analysis tables).
3. **DTO→view adapters** — normalise the drift documented in the mock contract: percentages (`number` vs `'37%'` string), scores (`'50/80'`), inconsistent chapter id types (number vs string), the three divergent remediation field names (`mark`/`easyMarks`/`marksLost`) → one shape, two common-mistake `example` sub-shapes.
4. **Filter → query-param binding** — `PageFilters` (subject/grade/section/exam) currently local-only; bind to the endpoint query params and viewer scope.

**Backend — thin additions (data exists, endpoint/shape missing):**
5. `GET /api/viewer` (or client-side resolver) for `capabilities` + `scope` (needs teacher-allocated-sections exposure).
6. `GET /api/filters/subjects` and `/sections` (tables exist; no endpoint).
7. `GET /api/exams/summary` — single-exam dashboard rows (class avg + trend + marksSlipped).
8. `GET /api/exams/{id}/score-distribution` (+ per-question) — marks histograms.
9. Roster-level `strongest/weakestChapter` on `StudentAccuracyDTO` (or a small dedicated endpoint).
10. Chapter-level **common-mistake aggregation** (today per-question only).

**Backend — genuine new logic/data (🔴):**
11. **Named behavioural smart cohorts** (Foundational Gap / Inconsistent Performers / Careless Execution / Avoiders) — classifier over error profiles; store in `section_insights`.
12. **Class-11-vs-12 mistake lineage** — cross-year comparison via `student_transitions` + historical papers.
13. **Bloom's-taxonomy question tagging** — new classification/column (`questions.question_type` is CBSE format, a different axis).
14. **Answer-image evidence composition** — join `aggregatedData` marks/feedback with **beaver-api** (`loam_ops`) cropped-image URLs; decide whether the frontend calls beaver-api directly or aggregatedData proxies it.
15. **Error-type taxonomy mapping** — DB `error_type` strings → the frontend's fixed categories (4-way mistake types; 3-segment Conceptual/Calculation/Skipped legend). One shared mapping table, ideally server-side.

---

## 6. Suggested phasing

- **Phase 0 — plumbing:** API client, auth wiring, env vars, one vertical slice end-to-end (Chapter list → `GET /api/chapters`) to prove the pattern. Confirm `aggregatedData` reachable and populate-jobs have run against a seeded `loam_db`.
- **Phase 1 — the ✅ ready surfaces:** chapters, questions, students, filters, exam overview, comparisons. Highest value, lowest risk; pure adapter work.
- **Phase 2 — 🟡 thin backend additions:** viewer/scope, subject/section filters, exams-summary, score-distribution, roster strongest/weakest.
- **Phase 3 — 🔴 new logic:** smart cohorts, Bloom tagging, class-11-vs-12 lineage, cross-service answer-image evidence, error-taxonomy mapping.

---

## 7. Key risks & normalisation notes

- **Two exam models in the schema:** `question_papers` (the working analytics grain, what endpoints use) vs a first-class `exams`/`exam_types` (added in migrations, no JPA entity). Confirm which the frontend "exam" maps to — endpoints key off `question_papers`.
- **Comparison endpoints require examA + examB.** Single-exam pages must use the single-exam endpoints (`/api/chapters`, `/api/questions`, `/api/students`, `/api/chapter-details`); only trend/compare views use the comparison ones.
- **Persisted-vs-live:** comparison-summary / diagnosis / chapter-summary come from tables populated by batch jobs — stale if jobs haven't run.
- **Cross-DB seam:** learning analytics = `loam_db` (aggregatedData); scanned-image evidence = `loam_ops` (beaver-api). Any UI mixing marks + answer images spans both services.
- **Store numerics, format in UI:** the DTOs return numbers; the mocks embed formatting (`'37%'`, `'50/80'`, `'4 Marks'`). Do formatting in the frontend, not the API.
- **Two drifted exam-detail routes** exist in the frontend (`/exam/[examId]` and `/dashboard/assessment/[examId]`) with different field names and neither reads `examId` yet — consolidate before wiring.
- **Auth bypass is currently active** in `middleware.ts` (local preview) — must be reverted before any commit.

---

*Source catalogs (full detail) were produced for: (a) frontend data contract — 15 entities across all routes/components; (b) `loam_db` schema — 33 JPA entities + non-entity tables with grain index; (c) backend API surface — ~30 aggregatedData endpoints + ~70 beaver-api endpoints. Available on request if deeper per-field detail is needed.*
