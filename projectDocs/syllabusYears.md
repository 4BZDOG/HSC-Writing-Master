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
| `components/AppModals.tsx` | Everything created or imported from the modals lands in the year on screen — new topics, pasted syllabus text, imported topic files. |
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

`supabase/schema.sql` §22 adds `topics.year`. Two things are deliberate:

- The client asks for the column and **asks again without it** if the request
  is refused, because naming an unknown column fails the request — and that one
  request is the whole curriculum. A deployment that has not applied §22 keeps
  all its content and simply does not sync the year.
- A Year 12 contribution omits the field entirely, so its row is byte-identical
  to what it was before the column existed.

Outcomes carry an optional `year` in the app but are **not** yet synced with
one; `outcomesForYear` filters only when at least one outcome declares a year,
so a remote course shows all of its outcomes in both years, exactly as it did
before. That is the next thing to do here if Year 11 outcomes are wanted.
