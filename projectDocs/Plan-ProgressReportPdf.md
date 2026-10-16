# Progress report PDF — students, teachers and schools

_A printable report of a person's (or a class's, or a school's) own data, with
drill-down by course, period and class. Built on the same vector exporter as the
marking-feedback report (`pdf/`, see `Plan-PdfExportDesign.md`) and held to the
same standard. British/Australian English throughout._

## What it is

| Audience | Who | Report | Scope the user can narrow |
| -------- | --- | ------ | ------------------------- |
| `student` | role `user` | **Progress report** — their own marked answers | course · period |
| `teacher` | role `teacher` | **Class report** — the classes they teach | class · course · period · student names on/off |
| `school` | role `admin` | **School report** — every class in the deployment | class · course · period · student names on/off |

Entry point: the profile (Stats tab) — "Download progress report". Gated by the
existing `pdfExport` feature (`services/entitlements.ts`), exactly like the
marking-feedback PDF: a Free student sees the lock and the upgrade prompt;
teachers (staff perk) and admins pass.

## Contract

`pdf/reportModel.ts` is the contract between the data side and the print side.
Neither side may change it without telling the coordinator. The print side
formats; the data side aggregates, filters and never formats.

## Print side (`pdf/`)

Reuse, do not fork: `createMeasurer`, `loadJsPdf`/`loadInterFont`, `drawRunningHead`,
`drawFooter`, `drawDisplayLine`, `drawIcon`, the `heading` / `paragraph` /
`listItem` / `masthead` block kinds, `planLayout` / `flowBlocks`, document
outline, `bandColor` from `utils/renderUtils.ts` (the one band palette — never
literals) and the colour rules from the PDF design plan: **each colour means one
thing per report** — band accent = attainment, slate = structure, rose = something
to fix. Do not introduce a new accent.

New block kinds (added to `BlockKind`, measured in `layout.ts`, drawn in a new
`pdf/reportDraw.ts` so `exportEvaluation.ts` does not balloon):

- `statStrip` — the result strip: 4–5 cells (value at ~22pt, label, hint), hairline
  dividers, band-coloured value where `band` is set.
- `lineChart` — progress over time on the band ladder (y = Band 1–6 with the six
  band names, gridlines at each band, points and line, dashed average line labelled
  "All-time average 4.3", first/last date labels on the x axis). A single point is
  drawn as a point with a caption, never hidden.
- `barList` — horizontal bars, one per row, label left, bar, value right
  ("80% · 5 attempts"); a row with no attempts reads "Not attempted" with a dashed
  empty track. Used for the six tiers.
- `table` — columns with alignment and widths in proportion, header row, zebra or
  hairline rows, optional inline bar column (mark share), band chip column, sparkline
  column, group header rows (a course heading over its topics). **A table splits
  across pages and repeats its header row** (a continuation fragment keeps the
  columns). Never orphan a header row at the foot of a page. Numeric columns
  right-aligned and tabular.
- `heatmap` — students × six tiers, cell shaded by mark share in the band ramp
  (colour AND the value printed in the cell so it survives greyscale), "—" for not
  attempted. Splits across pages with a repeated header.
- `callout` (or reuse `paragraph` with `panel`) — "About this report" notes.

Page architecture, in order: masthead (title, subject, scope line, generated date)
→ result strip → progress chart + tier bars (side by side in the two-column flow
when it improves the fill, else stacked) → by course → by topic → by verb → (student)
recent attempts → (teacher/school) students table and tier heatmap → (school) classes
→ About this report. Sections the user switched off are absent, not blank. An empty
section says what is missing and what would fill it ("No marked answers in this course
in the last 30 days"), never an empty frame. The result strip always prints.

Quality bar (same as the feedback report): selectable vector text, embedded Inter,
no overlapping text, no clipped labels, long names wrap or truncate with an ellipsis
inside their column, a running head on pages 2+, the footer with report id / date /
page x of y and an accurate disclaimer (marks are AI-assisted estimates, not NESA
results; teacher and school reports also say "contains student names — handle in line
with your school's privacy policy" unless anonymised), document outline entries per
section, document properties (title, subject, author, keywords). Greyscale-safe:
every colour-coded value is also printed as a number. Works for 0 rows, 1 row, 3 rows
and 120 students; Letter as well as A4. Long reports are fine (page count is not
capped) but the layout must not leave pages mostly blank.

The sample generator (`scripts/pdfSamples`, `npm run samples:pdf -- --png`) gains
progress-report fixtures for all three audiences (small / typical / large / empty /
anonymised) and the print agent MUST render and look at the PNGs and fix what looks
wrong before reporting.

## Data side

### Student
Reads the caller's own `response_events` (`fetchMyAttemptHistory` already exists;
extend it additively to embed the course and topic: `prompts(verb, total_marks,
dot_points(sub_topics(topics(name, courses(id, legacy_id, name)))))`) with a larger
limit for reports. Course and period are filtered client-side. Local mode / guest:
no history → a report from the stored totals only, with a note saying history is kept
for signed-in accounts.

### Teacher / school
New additive RPC (schema §26) `get_progress_report(p_days int default 90,
p_class_id uuid default null, p_course_id uuid default null)` — reviewer-gated, scoped
exactly like `get_class_cohort` (§20: `v_all := is_admin() and p_class_id is null`,
else `visible_student_ids(p_class_id)`), window via `analytics_window_start`, 1–365
days. Returns one jsonb: `totals`, `byVerb`, `byCourse`, `byTopic` (with its course),
`byStudent` (username, display_name, attempts, avg_band, avg_mark_frac, last_active),
`byStudentVerb` (for the tier heatmap), `weekly` (cohort, oldest week = 0), and
`byClass` (only when `p_class_id` is null). Counts and averages only — never draft
text. `p_course_id` filters every one of them. The client sends it only when set (the
`withClass` pattern) and treats a database without §26 as "course drill-down
unavailable" rather than failing. Add RLS/negative tests alongside the existing ones in
`supabase/tests/`.

Builders in `utils/progressReport.ts` turn (stats | history | RPC payload) + options
into a `ProgressReport`. Tier folding reuses `utils/classAnalytics.ts`
(`foldVerbsIntoTiers`, `buildCohortRows`) so a tier here and a tier on screen cannot
disagree. Mark share is the headline measure (a verb caps the band, so band alone
penalises low-tier questions) — the notes say so.

## UI

`components/ProgressReportModal.tsx`, opened from the profile Stats tab: report-for
(per role), class picker (teachers/admins, `fetchMyClasses`), course picker (courses
in the loaded syllabus), period (30 days / 90 days / 12 months / All time — student
only for "All time"), section toggles, "include student names" (teacher/school),
page size (the saved `pdfExportPreferences`). Loads the data when opened or when the
scope changes, shows loading / error / empty states, a one-line summary of what will be
printed ("25 answers across 2 courses, 12 Aug – 4 Oct"), and a Download button that is
disabled with a reason when there is nothing to print. Locked → upgrade prompt, as the
feedback PDF does.

## Out of scope

Emailing or scheduling reports, per-student PDFs for a whole class in one go, charts
the screen does not already have, changes to how marks or bands are computed.
