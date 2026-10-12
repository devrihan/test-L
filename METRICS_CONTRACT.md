# Metrics contract — lighting up the dashboard

Distilled from **"Placeholder and metrics description.docx"** (DPS_East/11thGrade/docs,
2026-07-14) — the guideline mapping every dashboard placeholder to its intended
metric. Cross-referenced against what loam_db actually holds today, so each
metric has a **status**:

- ✅ **wired** — real data renders now
- 🟢 **computable now** — data exists in loam_db (mostly `student_answer_crops`
  marks, `student_answer_pages`, `student_exam_marks`); needs an
  endpoint/wiring, no new upstream dependency
- 🟡 **awaits taxonomy / chapter-concept mapping** (user will provide)
- 🔴 **awaits heron real run** (AI-generated narratives; run is staged, fires
  once taxonomy lands)

## Quantitative metrics

| Placeholder (guideline) | Definition | Source | Status |
|---|---|---|---|
| Average score / class average (dashboard trend, exam cards) | mean % score per assessment | crops `student_total_marks` / `student_total_max`; `student_exam_marks` | ✅ (crops roster avg) |
| Pass rate | % of students ≥ pass threshold | same + threshold config | 🟢 |
| Attempt rate | % enrolled who attempted | needs enrolment denominator (`student_transitions`?) | 🟢 (denominator TBC) |
| Delta vs previous assessment (+10.2 from midterm) | change across exams | `student_exam_marks` per exam over time | 🟢 (needs multi-exam marks per class; currently flat/synthetic) |
| Chapters / Students / Questions · N (scope counts) | counts in scope | paper questions, crops roster, chapter_blueprint | ✅ / 🟢 |
| Max marks, exam date | static paper config | `question_papers` (`/exam-info`) | ✅ |
| **Class avg per question** (Analysis question table/chart) | mean % scored per question | **crops `marks`/`max_marks` per question_number** | 🟢 ← biggest unblocked win |
| **Score distribution per question** (question detail histogram) | students per mark bucket | crops marks per question | 🟢 |
| Section average per question | mean % on this question | crops | 🟢 |
| Student performance distribution (0–8 … 73–80 histogram) | students per score bucket | crops totals | ✅ (dashboard) |
| Per-student raw score (roster Score 50/80) | awarded/max | crops totals | ✅ |
| Marks lost / easy marks per topic, students affected | sums per chapter | crops marks × chapter↔question mapping | 🟡 (needs chapter mapping) |
| Chapter average (by-chapter chart/table) | mean % per chapter | crops marks × chapter mapping | 🟡 |
| Chapter average across exams (chapter detail line) | trend | + multi-exam data | 🟡 |
| Marks lost · 0/4 per evidence | per-question score | crops | ✅ (evidence drawer) |

## Qualitative / AI metrics (heron)

| Placeholder | Definition | Status |
|---|---|---|
| Recover-with-practice / Needs-revision buckets | per-topic remediation tag | 🔴 |
| "What is going wrong" / "What to practise" columns | diagnostic + prescriptive narratives | 🔴 |
| Insight headlines, tooltips ("Science practice pulled the grade average up") | AI annotations | 🔴 |
| Error-type split bars (Conceptual/Calculation/Skipped) | error taxonomy distribution | 🔴 (mock rows in place; real = run) |
| Named mistakes, common-mistake per student (+N) | error patterns | 🔴 |
| Smart cohorts (Foundational Gap / Avoiders…) | behavioural clustering | 🔴 (also needs student-level export design) |
| Carried from class 11 / new (provenance) | cross-grade mistake provenance | 🔴 (future; needs multi-year runs) |
| Status verdict ("Harder than expected") | chapter status | 🔴 |
| Strongest / Weakest per student | best/worst topic | 🟡 + 🔴 (chapter mapping × per-student scores) |

## Question classifications

| Placeholder | Source | Status |
|---|---|---|
| Bloom's Type (Remember/Understand/…) | `questions.bloom_taxonomy` | 🟢 where populated; blueprint has per-chapter Bloom marks (unreliable handwriting) |
| Concept | `concepts` via `questions.concept_id` | 🟡 (G11 unmapped) |
| Weightage (Low/Med/High) | `questions.weightage_tag` | ✅ (question detail) |
| Chapter↔question chips | concept→chapter linkage | 🟡 |

## Evidence artifacts

| Placeholder | Source | Status |
|---|---|---|
| Response sheet / student answer crops | `student_answer_crops.cropped_image_url` | ✅ |
| Full scanned script pages | `student_answer_pages` (`/api/answer-crops/pages`) | ✅ endpoint; UI toggle not wired (design change — ask first) |
| OCR text of an answer | `student_answer_crops.ocr_text` (new) | 🟢 |
| View answer key | `answer_key` (`/answer-key` endpoint) | ✅ |

## Ground rules from the guideline

- Quantitative metrics = aggregate means (% and raw), sums, counts, deltas,
  histograms, categorical proportions — all derivable from marks data.
- Qualitative metrics = AI-derived (heron): status verdicts, buckets,
  narratives, cohorts, provenance. Never fake these; show honest empties.
- "Chapter" column in the Analysis question table is **mislabelled — holds
  difficulty** (guideline calls this out explicitly).
- Half-marks exist (5.5) — keep numerics, don't round to int.
