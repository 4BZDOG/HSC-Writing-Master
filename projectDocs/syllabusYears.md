# Year 11 and Year 12: two syllabuses under one course name

A NSW senior course is not one syllabus a student walks through over two years.
Year 11 (Preliminary) and Year 12 (HSC) have entirely separate topics,
sub-topics, syllabus points and outcomes. The only thing they share is the
course name and the student.

## The shape

Two populations of topics inside **one** `Course`, chosen by a control beside
the course name.

The alternative — two courses linked by a family id — was rejected for two
reasons. It doubles the course list, so every picker gets twice as long for a
distinction that is not a course. And it splits a teacher's content across two
entities, so "my Software Engineering material" stops being one thing they can
export, share or reason about.

```
Course  ── "HSC Biology"
  ├── Topic (year: 'year11')   Cells as the Basis of Life
  ├── Topic (year: 'year11')   Organisation of Living Things
  ├── Topic ()                 Heredity          ← no year field = Year 12
  └── Topic ()                 Genetic Change
```

## Absence means Year 12

`Topic.year` is optional, and **the absence of a year means Year 12**. That is
not a shortcut, it is the whole reason nothing needed migrating:

- Every topic authored before this existed is HSC content.
- A saved path from before the split restores exactly where it was.
- An export from an older version imports into the year it belongs to.
- A database column that is NULL says the same thing as a JSON field that is
  missing.

The corollary is a rule the code follows everywhere: **only ever write
`'year11'`.** Writing `'year12'` would give one fact two spellings, and every
filter would then have to agree about both. `yearTag()` in `useSyllabusData`
and the `...(year === 'year11' ? …)` spreads elsewhere all exist to enforce it.

## Where the choice lives

| Surface | Behaviour |
|---|---|
| `components/PromptSelector.tsx` | The control, beside the course picker. Filters the topic list; changing it clears everything below the course, because a topic id from one year means nothing in the other. |
| `utils/syllabusYear.ts` | The model: `yearOfTopic`, `topicsForYear`, `hasContentForYear`, `resolveSyllabusYear`, `outcomesForYear`. |
| `hooks/useNavigation.ts` | Resolves the path against the year, so a topic from the other year is as gone as a deleted one. Without this the workspace would keep showing a Year 12 question while the picker sat on Year 11 with nothing selected. |
| `utils/assignmentLink.ts` | A shared question's year is read off its topic. The link carries ids only; a Year 11 question opened without a year would resolve to Year 12, where the navigator filters its own topic out and the question never opens. |
| `components/AppModals.tsx` | Everything created or imported from the modals lands in the year on screen — new topics, pasted syllabus text, imported topic files, outcomes. |
| `components/OutcomesEditorModal.tsx` | Edits one year's outcomes. See below — this is the one place where the exact filter matters. |
| `components/Workspace.tsx` | The outcomes a question may be linked to are its topic's year's. |
| `components/dataManager/TopicReorderList.tsx` | Both years share one list in the Vault, so Year 11 rows carry a badge. |

## When a year is empty

The control is always shown; the empty year is always listed. What changes is
who may go there:

- **A reader** is offered Year 11, sees "No content yet", and cannot select it.
  A stale path asking for an empty year falls back to one with content, so
  nobody lands on a blank picker.
- **A curator** can select it, and it says "Empty — add the first topic".
  Without this the feature could never be populated: every empty year would
  bounce back to Year 12, including the one someone was trying to fill.

That is what `resolveSyllabusYear`'s `allowEmpty` option is for, and it is the
only place the two roles differ.

## Outcomes: reading is lenient, writing is exact

BI-11-01 is not BI-12-01. NESA writes a separate set of outcomes per year, so a
Year 11 question offered an HSC outcome to link itself to is simply wrong — and
the enrichment pass writes `linkedOutcomes` without anyone reviewing it.

Two filters, and the difference is not cosmetic:

- **`outcomesForYear` — lenient.** Filters only when at least one outcome in the
  course declares a year. An unlabelled list is a list from before the split, so
  it shows in full in both years, exactly as it did before any of this existed.
  This is what readers, pickers and AI context use.
- **`outcomesOfYear` — exact.** Declared year only, absence meaning Year 12.
  The editor and the save path use this one. Through the lenient filter, a
  course whose outcomes are unlabelled answers "all of them" for Year 11 too —
  editing that list and saving would stamp every HSC outcome `year11` and empty
  Year 12 in a single click.

The editor holds one year, so `replaceOutcomesForYear` puts it back without
touching the other, and tags what was typed with the year it was typed in.
Its footer says so, because "these are the only outcomes I can see" is
otherwise indistinguishable from "the others are gone".

Displaying is a third case. The workspace shows the year's outcomes **plus any
the question is already linked to**: an outcome missing from the list does not
read as "not linked", it just is not there. A cross-year link is something a
teacher can see and fix; a blank space is not. Narrowing belongs where new links
are made.

## Getting Year 11 content in

No shipped course has Year 11 content — every course in `public/courseData` is
HSC (their outcome codes say so: `BI-12-01`, `SE-12-01`). The content itself
comes from the NESA syllabus documents, through the routes that already exist:

1. Choose Year 11 in the navigator (as a teacher or admin).
2. **From Syllabus** — paste the Year 11 syllabus text; the parsed topics,
   sub-topics and dot points land in Year 11.
3. Or add topics by hand, or import a topic `.json`.

An imported file that declares its own year keeps it; one that says nothing
joins the year on screen.

## The remote half

`supabase/schema.sql` §22 adds `topics.year`; §23 adds `course_outcomes.year`.
Three things are deliberate:

- The client asks for the column and **asks again without it** if the request
  is refused, because naming an unknown column fails the request — and those
  requests are the whole curriculum. A deployment that has not applied §22/§23
  keeps all its content and simply does not sync the year.
- A Year 12 row omits the field entirely, so it is byte-identical to what it
  was before the columns existed.
- `supabase/seed.mjs` and `supabase/export.mjs` follow both rules, so the year
  round-trips through `courseData/*.json` and re-seeding an HSC-only export is
  still a no-op upsert — and seeding all-HSC content still works against a
  database that has not applied either section.

## Not done here

Nothing in the app authors a Year 11 **course outcome code** for you — the
codes come from the NESA document, like the rest of the content. And the course
creator still writes its outcomes as Year 12, which is what creating a course
means: the year control takes over once the course exists.
