# Syllabus Import — UX & Reliability

Improvements to importing syllabus text and parsing it into course structures,
for both new and existing courses, plus a review of the navigation selectors.

## Reliability

- **Defensive normalisation (`normalizeSyllabusStructure`, `utils/dataManagerUtils.ts`).**
  The AI's structure output is now coerced into a clean `SyllabusPreviewNode[]`
  before it ever reaches the preview or the importer. It unwraps the common
  shapes the model drifts into (a bare array, `{topics:[…]}`, `{data:[…]}`, a
  single topic object, topic-level dot points with no sub-topic, bare-string
  sub-topics, renamed keys like `subtopics`/`dotpoints`/`points`, dot points as
  `{description|text|…}` objects), trims, drops empties, and **never throws**.
  A garbled response degrades to "fewer/zero nodes" instead of crashing the
  import (the old code did `subTopics.map`/`dotPoints.map` on raw model output).
- **Schema-constrained parse.** `parseSyllabusStructure` now sends a
  `responseSchema` (so field names hold, especially on non-Gemini providers) and
  pipes the result through the normaliser. The single-topic path
  (`generateSubTopicsAndDotPoints`) shares the same normaliser.
- **Resilient multi-topic analysis.** The modal uses `Promise.allSettled`, so one
  failed/garbled topic no longer loses the whole import — successful topics are
  shown and the failures are named in a non-blocking notice.

## UX

- **New _and_ existing courses.** The import modal has an "Import Into" selector:
  create a new course, or **merge into an existing one**. Merging reuses
  `mergeCourseContents` — topics with matching names have their sub-topics/dot
  points merged, new topics are appended, and outcomes merge by code (no
  duplicate courses/topics).
- **Target a specific topic.** When merging into an existing course, a second
  selector lets you funnel _all_ parsed content into one chosen topic ("Add
  everything into one topic"), or leave it on "Auto" to match topic names / add
  new topics. Targeted merges use `mergeTopicContents` and report
  "Added N sub-topics… to «topic»".
- **Auto-split into topics.** A single pasted (or URL-fetched) blob can be split
  by AI into one editable tab per topic — via the "Auto-split topics" button on
  the editor, and automatically after a URL fetch (`splitSyllabusIntoTopics`).
  Falls back to a single tab when it can't confidently split.
- **Editable preview.** Before importing, users can prune anything the AI got
  wrong — remove a topic, sub-topic, or individual dot point (hover a row for the
  delete control). Live counts update; Confirm is disabled when nothing remains.
- **Clearer status.** The preview header shows topic/sub-topic/dot-point counts
  and, when merging, "Merge into «course»"; the confirm button reflects merge vs.
  create.

## Selector review (`components/PromptSelector.tsx`)

- Empty-state hints when a course has no topics or a syllabus point has no
  questions (admin-aware copy pointing to the relevant action).
- Crash-proofed the preview against missing `subTopics` (belt-and-braces with the
  normaliser).

## Tests

`tests/unit/normalizeSyllabusStructure.test.ts` pins the normaliser against the
shapes the model has been observed to produce (wrapped arrays, object dot points,
renamed keys, topic-level dot points, junk, missing names).
