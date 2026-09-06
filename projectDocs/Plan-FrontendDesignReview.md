# Frontend design review

The app measured against Anthropic's `frontend-design` skill
(`github.com/anthropics/skills`, commit `41bbe19`). Findings are counted, not
impressions — every number below is a grep anyone can re-run.

`DesignSpec.md` is the authority. Where this review disagreed with it, the
review was wrong until a human says otherwise; see the correction below.

## What the review got wrong first

The initial pass reported "palette fragmentation": 18 colour families in use,
with amber (509 uses), emerald (346), indigo (400) and sky (81) treated as rogue
accents crowding the six-colour band ramp, and the claim that a student could
not tell whether green meant "Band 4" or "done".

That was wrong, and it was wrong because the review had not read `DesignSpec.md`
§2 first. The spec names those very colours as the tier palette:

> Tier 3 (Comprehending): **Yellow/Amber** … Tier 4 (Analysing): **Green/Emerald**
> … Tier 5 (Synthesising): **Blue/Sky** … Tier 6 (Evaluating): **Purple/Indigo**

So amber, emerald, sky and indigo are the band colours, under their documented
aliases. Their usage counts are the tier system working as specified, not drift.
The same applies to the editor's Slate → Emerald → Sky → Indigo shift, which §1
specifies as "Luminous Progression", and to glassmorphism, mesh textures and
aurora motion, which §1 specifies as the "Studio" aesthetic.

**No colour change has been made, and none should be made from this review
alone.** There is a real question underneath — whether a UI colour and a band
colour can be told apart when they are the same hue — but it is a question for
the spec's owner, not a defect. It is recorded as open question 1 below.

## The findings

Each checked against `DesignSpec.md` before acting on it. One did not survive
that check and is marked withdrawn.

### 1. The all-caps micro-label was the app's entire labelling voice — FIXED

The skill names "a tracked-out ALL-CAPS eyebrow label above every heading" as
template chrome, and "using all caps for labels" as a default to avoid.

| Measure                                          | Before                      |
| ------------------------------------------------ | --------------------------- |
| `uppercase` in `components/`                     | 475, across 73 of 106 files |
| className regions containing `uppercase`         | 467                         |
| …of those, also heavy (`font-bold`/`font-black`) | 463                         |
| …also tracked (`tracking-*`)                     | 449                         |
| distinct sizes and tracking steps in play        | 4 sizes, 8 tracking steps   |

Addressed by `.t-label` (see `DesignSpec.md` §4, "Labels"). 424 call sites in
`components/`, 18 shared constants in `utils/*Chrome.ts`, and the `MicroLabel`
component now all resolve to one rule. Three display treatments were preserved
deliberately.

### 2. The default reading size was 10–12px — PARTLY FIXED

560 uses of `text-[8px]`–`text-[11px]` and 378 of `text-xs`, against **6** uses
of `text-base`. A readability floor at the bottom of `index.css` was already
compensating centrally (`text-[10px]` renders at 11.5px) — a previous fix that
named the same problem and chose not to touch 280 call sites.

Labels are now 12px via the token. The floor stays for data readouts and chips,
which were not in scope.

### 3. Everything is bold, so weight encodes nothing — PARTLY FIXED

`font-bold` 562 + `font-black` 280 = 842, against `font-normal` 4 and
`font-medium` 122.

A weight ladder is now documented in `DesignSpec.md` §4 — 400 prose, 500 label,
600 a title inside a block, 700 headings and buttons and numbers, 900 display —
and the two ends of it are gated by `tests/unit/weightLadder.test.ts`: prose no
longer takes bold (33 elements), and 900 no longer sits on 10px chips (23
elements). `font-black` fell from 148 to 113, all of it now display type, large
headings or telemetry figures.

**The gate this phase was given was wrong, and was changed.** It said
"`font-bold`+`font-black` falls below 300". `font-bold` is still 560, and no
honest mechanical pass gets it to 300: deciding whether any given
`font-bold` span is a heading, a control, a number or emphasis needs per-site
judgement, the same as `rounded-2xl` in phase 3. The gate is now the ladder's two
checkable ends, and the middle — demoting secondary text from 700 to 500 or 600
— is left as reading work rather than pretended at with a codemod.

One thing the size-based rule could not see: a `<p>` is not automatically prose.
Seven held a title above their own body line — the error notice's heading, a
course name above its topic count — or a figure in a table cell. Those were
restored by hand to 600 and 700.

### 4. Motion is scattered rather than orchestrated — WITHDRAWN

The count was right and the reading of it was wrong. 103 `animate-fade-in` + 41
`animate-fade-in-up` across 73 of 106 files, 340 `transition-all`, 53
`hover:shadow`, 50 `hover:scale` — and the skill does name per-section
fade-and-slide-up plus per-card hover transitions as the generic default. But
the skill draws a line the raw count cannot see:

> Motion that answers a person's action (opening, expanding, confirming) is
> welcome when it shows what changed.

Every one of the 156 entrances was read before deciding. 99 sit directly inside
a conditional render — `isEnriching &&`, `enrichError &&`, `isEditingQuestion ?`.
Of the 58 that looked unconditional, about 25 are modal shells whose mount gate
(`if (!isOpen) return null`) is earlier in the file, eight are banners and
overlays that only exist in an error or busy state, four are dropdown popovers,
and the rest are per-item reveals as content arrives — carousel slides, insight
rows, audit log lines.

That leaves the login and reset-password pages, which each fade in a wordmark
and then a form card: two elements, one page, in sequence. That is not the
pathology, it is the single orchestrated page-load moment the skill asks for.

There is no fade-and-slide-up-on-every-section at load in this app, so nothing
was changed. The quality floor is met properly too: `index.css` neutralises
every animation and transition under `prefers-reduced-motion` with a global
`*, *::before, *::after` rule, and every keyframe animates only `transform` and
`opacity`.

The one thing left standing is `transition-all` at 340 sites, which animates
every property that changes rather than the ones intended. That is a precision
question rather than a design-language one, and naming the properties needs
per-site knowledge of what actually changes, so it is not codemod work.

### 5. No radius or shadow system — FIXED

24 distinct radius expressions and 7 shadow steps. The arbitrary values had
drifted to ten — 14, 18, 20, 24, 28, 30, 32, 36, 40, 44, 48px — across four real
jobs; modal shells alone used five of them.

Addressed by role tokens in `tailwind.config.js` and documented in
`DesignSpec.md` §3: `rounded-surface`, `rounded-surface-inner`, `rounded-panel`,
`rounded-tile`, with `xl`/`lg` kept as the control pair. Elevation is two steps,
`shadow-sm` resting and `shadow-lg` lifted. `tests/unit/surfaceScale.test.ts` is
the gate.

**The gate this phase was given was wrong, and was changed.** It said "distinct
radii ≤ 4". That target was set before looking at what the radii were doing.
Radius has to decrease with nesting — a chip at its card's radius reads wrong —
so a four-value scale would have been a simpler rule and a worse interface. The
gate is now "no arbitrary pixel radius, and no step below `rounded-lg`", which
is what the design actually wants and is checkable.

Two things it deliberately did not do. `rounded-2xl` stays on the 236 cards that
are neither a surface nor a panel: classifying those needs per-site judgement,
not a codemod. And `PANEL_SURFACE` adoption was dropped as a goal — the original
"> 40 imports" was a number invented without looking. `PANEL_SURFACE` bakes in
its own background colours, so pushing it onto panels inside modals would change
their surface, not just their radius. It stays what it is: the shared surface
for the workspace reference rail.

### 6. Line length is never constrained — FIXED

`max-w-prose` and `ch` units appeared zero times, and the three main reading
blocks carried `prose prose-slate dark:prose-invert max-w-none` while
`@tailwindcss/typography` is not installed — so those classes were inert except
`max-w-none`, which switched off a measure that had never been on.

A `max-w-[56ch]` cap was added to five reading surfaces, then **reverted after it
shipped**, because it made the text stop halfway across its panel. The measured
reason: 508px of text in a 1022px container. The cap itself is right — 56ch
renders 74-76 characters — but the container is about twice as wide as a single
column of prose wants, and filling it needs ~148 characters. Centring the column
instead misaligned the prose with its own panel header.

The fix belongs to the container, not the text: narrower reading panels, or
something else in the space beside them.

**Both halves are now done.** `max-w-3xl` on the report column took the line
from 142 characters to 104 and left ~400px of nothing beside it on a desktop.
From `xl` the score placard, the goal card and the metrics move into that space
— a `minmax(0,1fr)` column and a 22rem margin inside a `5xl` shell — and the
prose narrows behind them to **86 characters**. Below `xl` nothing changed, by
construction rather than by a second rule: the wrapper is a flex column there
and the aside is its first child, so a phone still meets the mark before the
report. Measured at six widths, nothing clips in the 352px margin, and
`tests/e2e/report-column.spec.ts` holds it — verified to fail without the change.

A sticky margin was built, worked, and was removed: the aside is 687px against a
572px scroll container at 1440x700, so pinning it puts the metrics permanently
out of reach on a short window. See `DesignSpec.md` §4, "Measure".

**How this was missed.** The change was verified by measuring characters per
line — 74-76, correct — and never by measuring the text against its container,
which is where the defect was. A number that confirms the thing you set out to
check is not a test of the thing you changed.

### 7. Middle-dot meta strings — OPEN

63 across 27 files ("Usage today · per user", "Free plan · daily marked
evaluations"). Named by the skill as template chrome. Low value, low risk.

## Open questions for the spec's owner

1. **Can a UI colour and a band colour share a hue?** §2 aliases four tiers to
   amber/emerald/sky/indigo, and those same families also carry non-band
   meaning (amber for locks and warnings, emerald for success, indigo for
   primary actions). Either that is fine because context disambiguates, or the
   non-band uses need their own hues. This review has no mandate to decide it.
2. ~~**Does "Luminous Progression" survive contact with the band colours?**~~
   **ANSWERED — leave it.** The spec's owner's call: context disambiguates. The
   editor glow and a band chip never appear in the same role, so a student is
   unlikely to read the editor turning indigo as "this is Band 6". Same answer
   as question 1, and it closes both. Nothing changed.
3. ~~**Is Inter still the right interface face?**~~ **ANSWERED — IBM Plex Sans.**
   Four candidates (Inter, IBM Plex Sans, Source Sans 3, Public Sans) were
   rendered on the workspace and the marking report and put to the spec's owner,
   who chose Plex. See "The typeface change" below for what it actually cost,
   which was not what the question assumed.

## The bold slice, and what it found

Finding 3's middle was worked through for the two screens students live in — the
workspace and the marking report — reading each site rather than pattern-matching
them. **50 `font-bold` regions in that scope, of which 46 were already correct**:
buttons, headings, mark figures, keyboard shortcuts, and two genuine emphases
inside the tier sentence ("'DESCRIBE' is a Tier 2 command … tops out at Band 2").

Four were not, and moved:

- The past-paper year and question-number inputs. What someone types into a
  field is their input, not emphasis; the border and label already mark it out.
- The syllabus-term chips, at `text-[11px] font-bold` — the small-and-bold habit,
  where colour, border and fill were already doing the work.
- "Outcome Link", a label, which now takes the label token.

**The useful finding is the ratio.** 46 of 50 correct says the student-facing
screens were already disciplined about weight, and that `font-bold`'s 560 total
lives mostly in admin dashboards, import wizards and the content studio. If the
middle of the ladder is worth more work, that is where it is — not here.

## The typeface change

The question was framed as a trade — a more specific face, paid for in bundle
size and in truncation risk from wider glyphs. Measuring it, both halves of the
price turned out to be wrong.

**It is lighter, not heavier.** Taken as a variable font, IBM Plex Sans is one
96KB latin file (`wght` plus `wght-italic`) covering the whole 100–700 axis. It
replaced twelve static Inter faces totalling 289KB. Net saving: ~193KB and ten
fewer requests.

**It is narrower, not wider.** Measured at 390, 768, 1024 and 1440 against the
Inter baseline on the same page, the set of clipped strings is identical — 11 on
a phone, 4 above it, the same strings — and every one overflows _less_ under
Plex. "Evaluate, Synthesise & Create" went 200px → 187, "Construct models of the
processes" 313 → 296. No new truncation at any width. Part of that is the face
and part is `font-black` becoming 700; the two are not separated here because
the shipped combination is what matters.

**The real cost was somewhere else: the ladder lost a rung.** Plex stops at 700,
and so does Newsreader, so five rungs had four faces to sit on. 700 and 900 now
share a value — the merge that costs least, because display type carries its
rank at three times the size, where 600 and 700 sit side by side on every card.
`font-black` keeps its own class so the job stays marked. Recorded in
`DesignSpec.md` §4 and gated by `tests/unit/typefaceLadder.test.ts`, which fails
if the theme names a face the app does not import or asks for a weight the face
cannot draw — both of which fail silently on screen.

**Still on Inter: the PDF export.** `pdf/fontLoader.ts` embeds
`public/fonts/Inter-{Regular,Bold}.ttf` into the jsPDF document, so an exported
report is now set in a different face from the app that made it. The export
toast, which is on-screen chrome rather than print, was moved to Plex. The
embedded TTFs were not: swapping them changes the line breaks and pagination of
every export, which needs its own verification pass against the PDF samples. It
is a genuine open item, not an oversight — see the follow-ups.

## The second slice: the content studio

Where the first slice's ratio pointed. The studio is not one screen but the set
of AI authoring surfaces — the prompt generator, the manual prompt builder, the
sample-answer generator, the dot-point and outcomes editors, the keyword and
rubric helpers — read the same way, site by site.

**44 heavy-weight regions, of which 31 were already correct**: modal headings,
primary and tertiary buttons, mark figures, step numbers in their tiles, mono
telemetry, and three genuine emphases inside prose (the pinned verb, the tier's
name, "a **direct question** with no scenario").

Thirteen moved, in five kinds:

| Kind                                          | Sites | To      |
| --------------------------------------------- | ----- | ------- |
| Number and text inputs                        | 2     | 400     |
| Chips already carrying colour + border + fill | 5     | 500     |
| A notice's own message                        | 3     | 400/500 |
| A card's title, which is a title in a block   | 1     | 600     |
| `font-black` on 12–14px type                  | 2     | 700     |

**The ratio fell, and that is the point of running it here.** 31 of 44 is 70%,
against 46 of 50 — 92% — on the student screens. The authoring surfaces are
where the habit actually lives, which is what the first slice predicted, and it
is a milder gap than the raw count suggested.

**Two rules came out of it and went into the spec**, because both were being
applied by feel: a chip that already has a colour, a border and a fill does not
also need 700, and a notice's message is prose. The first resolves a genuine
contradiction — the ladder's table said chips take 700 while the workspace slice
had demoted them to 500 — so `DesignSpec.md` §4 now says which chips take which,
rather than leaving the next person to guess from precedent.

## Where this leaves the review

Findings 1, 5 and 6 are fixed and gated — 6 after being reopened once. Findings 2 and 3 are partly fixed, with
their middles left as reading work. Finding 4 and the colour finding were
withdrawn after investigation. Finding 7 is untouched.

Two of the seven did not survive contact with the code, and both failed the same
way: a grep produced a large number and the number was read as a verdict.
Amber's 509 uses were the tier palette doing its job. The 156 entrance
animations were reveals answering a click. Counting is how the rest of this
review found things worth fixing, so the lesson is not to stop counting — it is
that a count locates a question and never answers one.

What remains, none of it codemod work:

- **Finding 7**, the middle-dot meta strings, 63 across 27 files. Low value, and
  changing them is a copywriting decision rather than a styling one.
- **`font-bold` at 560 uses** (finding 3's middle) and **`rounded-2xl` at 236**
  (phase 3's). Both need someone to look at each site and say what it is.
- **The writing surface's 114-character measure**, which is the editor rather
  than the report, and is a live typing surface rather than a reading one — a
  different question from finding 6, and still open.
- **The PDF export is still set in Inter.** `pdf/fontLoader.ts` embeds
  `public/fonts/Inter-{Regular,Bold}.ttf`, so a report now leaves the app in a
  different face from the app. Swapping the TTFs changes the line breaks and
  pagination of every export, which needs verification against the PDF samples.
- **The three open colour questions above**, which are the spec owner's.

---

# Second pass

The skill is now **installed in the repo** at `.claude/skills/frontend-design/`
(SKILL.md + Apache-2.0 LICENSE.txt), rather than read ad hoc as the first pass
did. Upstream `anthropics/skills` is still at `41bbe19` — the same commit the
first pass measured against — so nothing in the guidance has moved, and the
findings above were made against current text.

This pass covers the parts of the skill the first pass did not reach, and
re-runs the earlier greps to see whether what was fixed has stayed fixed.

## Regression check on the first pass

| Finding                       | Then                  | Now                       | Verdict             |
| ----------------------------- | --------------------- | ------------------------- | ------------------- |
| 1 · all-caps labels           | 475 `uppercase`       | 11 (3 real)               | Holding             |
| 5 · radius system             | 10 arbitrary px radii | 1 site                    | Holding             |
| 5 · `rounded-2xl` (left open) | 236                   | 154                       | Improved unasked    |
| 5 · elevation                 | 7 shadow steps        | 286 of ~340 are `sm`/`lg` | Holding             |
| 7 · middle-dot meta strings   | 63                    | 65                        | Still open, drifted |

`.t-label` still resolves to 12px / 500 / no tracking / no caps, so the label
voice has not crept back. The three surviving `uppercase` hits are two code
comments explaining why a treatment was _not_ applied, and the skip-link's
`focus:uppercase` — which is chrome that appears only under a keyboard tab.

## New findings

### 8. The login hero opens on a Sparkles icon — OPEN

`components/LoginPage.tsx:387-403`. This is the first screen every user sees.

> Open with the most characteristic thing in the subject's world.

The headline underneath is **"Band 6"** — exactly right, and unmistakably NESA's
vernacular rather than anyone else's. The element above it is a `Sparkles` glyph
in a `bg-gradient-to-br from-indigo-500 to-sky-500` tile with an indigo blur
behind it. That is the generic AI-product mark; it belongs to no subject, and it
is the first thing on the page, sitting above the one element that is genuinely
specific.

The tile also carries `group-hover:scale-105` and a blur that runs 20% → 40% on
hover, on an element that is not interactive and has no action to answer. The
skill asks for motion that answers a person's action, or one orchestrated
moment; the page already has its orchestrated moment in the wordmark-then-card
sequence the first pass defended.

Worth noting what this is _not_: the hero is not the "big number, small label,
supporting stats" default. The copy is a plain sentence that says what the app
does. The defect is one element, not the composition.

### 9. Numbered markers on content that is not a sequence — 2 sites

> Before adding numbered markers, check the content really is a sequence.

- **`components/CommandTermGuideModal.tsx:220`** numbers the NESA marking-guide
  criteria `01`, `02`, `03`. A marking guide is a set of descriptors a marker
  weighs together, not steps worked through in order — numbering them tells a
  student there is a first criterion and a last one, which is not true of the
  thing being described. The same `<li>` also carries `hover:translate-x-1` on a
  non-interactive list item.
- **`components/admin/ContentAuditModal.tsx:1504`** renders
  `selectedIds.size.toString().padStart(2, '0')` — a **count**, shown as `07`.
  There is no index here to zero-pad; the leading zero is the 01/02/03 look
  applied to a number that never had a position in a list.

Checked and left alone: `TopicReorderList` (the position _is_ the content being
edited) and `QuickStartModal` (genuine ordered steps). Both are the case the
skill says numbering is for.

### 10. An arrow appended to a link — 1 site

> a '→' appended to link and button text

`components/PromptSelector.tsx:1130`, "Can't find your course? Request it →".
The sentence is complete without the glyph and no direction is being encoded.

**Seventeen other arrow hits were read and cleared.** `OutcomeDetailModal:417`
is the interesting one: `← Previous` / `Next →` looks like the same tell, but
it is a paired pager where the glyph _is_ the direction affordance rather than
decoration on a CTA. The rest are the maths symbol toolbar, before→after mark
ranges, and prose in code comments.

## Checked and cleared

Recorded so the next pass does not re-litigate them.

- **Tinted near-black standing in for black** — one `slate-950` in the whole app.
- **Single-word headline accenting** — none. Every coloured `<span>` near an
  `<h1>`–`<h3>` is a badge or a count beside the heading, not a word lifted out
  of it.
- **Gradient washes as decoration** — 120 uses, but no file has more than six and
  the hue always follows something real: indigo for the primary action, or the
  amber/emerald/sky tier palette from `DesignSpec.md` §2. Not a wash.
- **Monospace for small data labels** — 94 uses, 20 at ≤10px, and all of the
  small ones are masked API keys or `tabular-nums` figures in tables. Mono is
  doing character alignment, which is its job, not standing in for a label voice.
- **Quality floor** — `index.css:258` gives every focusable element a 2px accent
  `:focus-visible` outline, and `index.css:235` neutralises animation and
  transition under `prefers-reduced-motion` with a global `*` rule.

## What remains

Everything the first pass left open still stands, plus findings 8-10 above.
Finding 8 is the one with reach: it is on the first screen, it is a single
element, and the headline beside it already proves the app can name its own
subject.
