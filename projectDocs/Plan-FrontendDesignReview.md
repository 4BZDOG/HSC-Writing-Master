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

## Findings 8-10, as built

### 8 — the hero mark, and where it went wrong twice

`Sparkles` was replaced with **six rungs rising left to right**, which is the
signal-strength glyph. One stock mark for another, and it took a screenshot to
see it — the reasoning that produced it ("a ladder, in the app's own band
colours") was sound the whole way and still landed on a wifi icon.

What shipped is the ladder `pdf/exportEvaluation.ts` already prints at the top
of every marking report: **six equal segments, filled to the band reached**.
Horizontal and equal is what makes it a scale rather than a bar chart. The
segments are square and carry no radius at all, because `drawBandScale` prints
them as `doc.rect` and the radius scale starts at `rounded-lg` — 8px on a 4px
rung is a capsule, which is a different mark. `tests/unit/surfaceScale.test.ts`
caught the arbitrary `rounded-[3px]` that the first attempt reached for, which
is the gate from finding 5 doing exactly its job.

The tile, its gradient and its hover all went with the glyph.

**It also went into the app header**, which was not in the finding. Changing
only the login page would have left the generic glyph on every in-app screen
and given the app two brand marks that disagree, so `components/BandLadderMark.tsx`
is shared and `AppHeader` renders it at `size="mark"`. That size is a judgement
call worth flagging: at 40px the report's true proportion is about 1.6px tall,
so the header rungs are thicker than the ladder really is. `HEADER_MARK_TILE`
and its brand gradient are untouched.

### 9 — numbered markers

The NESA marking-guide criteria lost their `01`/`02`/`03`, and the
`hover:translate-x-1` on each non-interactive `<li>` went with them; the
band-coloured left border already marks each row. `ContentAuditModal`'s
selection count no longer zero-pads to `07`. `TopicReorderList` and
`QuickStartModal` keep their numbering — both are genuine sequences.

### 10 — the trailing arrow

Gone from "Request it". The prev/next pager keeps its pair.

## Two asks that came with the fixes

**The command verb ribbon now has room.** It always had hairlines top and
bottom, but they sat flush against the header bar, where a hairline reads as
that bar's own edge rather than as the boundary of a section. The two outer
rules stopped sharing a class with the ribbon's internal seam — they do a
different job — and now take `RIBBON_EDGE_RULE_GAP_TOP` / `_BOTTOM` off the
content they bound, one opacity step up, with the transparent ends pulled
inward so the rule is a line for most of its span instead of a smudge at the
midpoint. `RIBBON_ROOT` carries vertical margin on top of `<main>`'s `gap-6`,
because at the shared 24px rhythm the ribbon read as the next block down rather
than as a change of register between the chooser above and the question below.

**Syllabus Terms is now two groups with a rule between them.** The essential
terms and the supporting ones were one wrapping row ordered syllabus-first: the
boundary was real, but it had to be inferred from a change of chip colour
partway along a row that wraps to a different place at every panel width. The
label sits in the rule rather than above the group, so the boundary and its
name are one device — the terms above it are already named by the lead sentence
and by the legend under it, and a third heading there would be the accessory to
take off. The rule is drawn only when both groups exist.
`tests/unit/keywordGrouping.test.tsx` pins that, and pins that a screen reader
gets the split from the two groups' `aria-label`s rather than from a decorative
line it cannot see.

## What remains

Everything the first pass left open still stands. Of this pass, finding 7 (the
middle-dot meta strings, now 65) is still untouched, and the header mark's
proportion is the one new open question — see finding 8 above.

---

# Third pass: the audit studio

The second pass's finding 9 reached into `ContentAuditModal.tsx` for one line —
the zero-padded selection count. This pass reads the whole surface, because the
first pass's own conclusion pointed here: "`font-bold`'s 560 total lives mostly
in admin dashboards, import wizards and the content studio."

Same commit of the skill (`41bbe19`), now installed at
`.claude/skills/frontend-design/`.

## What it found

### 11. The header opened on a gradient tile and a tracked-out eyebrow — FIXED

The same shape as finding 8, in a different file, and it had survived that pass
because that pass was looking at the login page.

`Activity` — a pulse line — in a `bg-gradient-to-br from-indigo-500/20 to-purple-600/20`
tile with `shadow-indigo-900/20` behind it, then a `t-label md:tracking-[0.5em]`
eyebrow reading "Content Overview" with a 12px hairline beside it, then the
title "Content Audit Studio". Three elements before the title, two of which are
the exact template chrome the skill names, and the eyebrow said nothing the
title under it did not.

The correction is subtraction rather than a better glyph — the mistake finding 8
made twice. The studio already has the most characteristic thing in its world on
screen: a ring showing how many syllabus dot points carry a question. That is
live NESA data, it is the whole reason the surface exists, and it was sitting to
the right as the third element in an instrument cluster. Removing the tile and
the eyebrow leaves it as the one strong element on the header, with the title
flush left against it.

**Checked on screen, not only in the diff**, because the last two passes to
touch a hero mark both got it wrong in a way only a screenshot showed:
1600×950 captures at dark, at light, and mid-run. Nothing reflowed, the title
sits flush left where the tile was, and the dial is the only strong element
left on the header. No pixel measurement was taken and none is claimed.

### 12. Copy that named the storage rather than the thing — FIXED

> Name things by what users will understand in simple language, not by how the
> system is built.

| Was                                                                                                                                             | Now                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Analytical overview of curriculum coverage. Detect resource gaps and perform bulk synthesis to align content with NESA performance standards." | "Every syllabus dot point, and what each of its questions is still missing — a marking guide, sample answers, linked outcomes. Pick a scope and fill the gaps in one run." |
| "Content Units / Questions"                                                                                                                     | "Questions"                                                                                                                                                                |
| "Proof Data / Samples"                                                                                                                          | "Sample answers"                                                                                                                                                           |
| "Overall Health · 4 / 4 Points"                                                                                                                 | "Dot points covered · 4 of 4"                                                                                                                                              |

Each metric had been carrying its own gloss on a second line — "Content Units"
above the number, "Questions" beside it — which is the tell that the first line
was not the name.

### 13. One thing under three names, and buttons that named nouns — FIXED

> An action keeps the same name through the whole flow, so the button that says
> "Publish" produces a toast that says "Published."

On one screen: the chip said **No Marking Guide**, the row badge said **No
Rubric**, the button said **Rubrics**. "Rubric" appears nowhere else in the
app's interface — five other surfaces say "Marking Guide".

Every gap now has one wording across chip, badge and button, and the buttons
lead with their verb:

| Was                   | Now                        |
| --------------------- | -------------------------- |
| `Questions (12)`      | `Write Questions (12)`     |
| `Rubrics (8)`         | `Write Marking Guides (8)` |
| `Revise (4)`          | `Reformat Guides (4)`      |
| `Samples (5)`         | `Draft Samples (5)`        |
| `Outcomes (3)`        | `Link Outcomes (3)`        |
| `Recalibrate (12)`    | `Re-mark Samples (12)`     |
| `Screen Quality (40)` | `Score Quality (40)`       |

Title case was kept. The skill asks for sentence case; `DesignSpec.md` is the
authority where they disagree, and the app's buttons are Title Case everywhere
("Export PDF", "Clear Selection", "Marking Guide"). Changing nine buttons in one
modal would have made this screen the inconsistent one.

**The rename is what makes the row badges honest.** `AuditPieces.tsx` claimed
its badges were "colour-matched to the filter chips above" — a promise nothing
held, because both sets of classes were written out by hand at each site. The
colour is now one entry per gap in `AUDIT_TONE`, read by both.

### 14. A label above content that already named itself — FIXED

> Adding unnecessary typographic labels above content.

`AI Operations`, set above a row of buttons that each now open with a verb. Off.

### 15. The chips had no light theme — FIXED

Ten chips and every row badge at `text-red-400` / `text-amber-400` /
`text-teal-400` with no `light:` counterpart, on `light:bg-white`. The app's own
pattern was two components away (`Export JSON`:
`text-emerald-400 light:text-emerald-700`) and had not been applied here.
`AUDIT_TONE` now carries both themes for all nine tones, so the quality floor —
"visually accessible" — holds in the theme the app is not designed in.

## Checked and left alone

- **`font-black ... italic` display headings.** 16 sites across the app; this is
  the house display treatment, not drift. `DesignSpec.md` §4 owns it.
- **The `animate-shimmer` on the progress bar.** Non-user-triggered motion, but
  it answers a running batch and stops when the batch does — the case the skill
  makes room for ("motion that answers a person's action … shows what changed").
- **`hover:scale-[1.03]` on the action buttons.** The codebase's haptic button
  standard, per `.claude/skills/hsc-feature.md` §6.
- **Red / amber / emerald on the coverage figures.** These are band-ramp hues on
  a percentage, which is open question 1 above, and the spec's owner has already
  answered its twin: context disambiguates.
- **`min-w-[700px]` on the tree.** It forces a horizontal scroll below 700px.
  This is a system-admin surface; a tree of five columns is not a phone screen,
  and faking it would cost more than the case is worth.

## What this pass changed that the skill did not ask for

Recorded because the two were done in one sitting and should not be conflated:
the reliability, performance and accessibility work in the same change is
listed in `changeLog.md` under 2026-09-07, and is pinned by
`tests/unit/contentAuditStudioRobustness.test.tsx`.

The design findings above are pinned only by the screenshots and by the
vocabulary assertions in `tests/unit/contentAuditStudio.test.tsx`, which now
name the buttons by their new labels. There is no mechanical gate on "one
wording per gap" — the honest version of that gate is `AUDIT_FILTERS` being the
only place a label is written, which is structural rather than tested.

---

# Fourth pass: the audit studio's layout

The third pass read the studio's chrome — its hero, its copy, its vocabulary,
its light theme — and left the layout alone. This pass is about the layout,
and it started from use rather than from the skill: an admin working the studio
reported "when zoom is small enough to fit all buttons and panels there's a
large amount of unused space in the middle of my screen", alongside an ask for
faculty grouping.

Same commit of the skill (`41bbe19`), installed at
`.claude/skills/frontend-design/`.

## What it found

### 16. Three full-width bands, each holding its content at the edges — FIXED

The studio was a header, a filter rail and an action row stacked down the
screen, every one of them a `justify-between` flex across the whole viewport.
That reads as balanced at 1280px and as two clusters shouting at each other
across a void at 2560px, which is the width this surface is actually used at.
The tree rows had the same shape one level down: a name at the left, a coverage
pill at the right, and on a 1600px window about 1,100px of nothing in between
on every branch row.

Measured before deciding, at 1600px: name column ending at 545px, coverage
figure starting at 1,185px.

The correction is not a narrower page. `DesignSpec.md` §4 already argues the
point for the report column — "the container is the thing that is too wide;
capping its contents only moves the problem inward" — and the answer there was
to change the layout, not to cap the text. So:

- **A 17rem control rail takes the left edge**, holding the search, the
  expand/collapse pair and the ten filters. That is 272px of what was empty,
  spent on the thing an admin reaches for most often, and it is also simply a
  better home for ten filters: as rows their counts line up in one column you
  can read down, where as chips they wrapped onto three lines and shifted under
  the cursor between runs. Below `md` the rail lies down into a line that
  scrolls sideways; a first attempt stood it up above the tree and gave a 700px
  window 360px of filters and 150px of tree.
- **The header, the tree and the action row share one 1800px grid**,
  left-aligned rather than centred. Centring them was tried first and put the
  title 320px in from the left while the rail below it still started at the
  edge.
- **The action row is one left-to-right flow**, not two clusters at opposite
  edges. At 2560px every button now sits on one line.

### 17. The empty middle of a row was the one question the screen could not answer — FIXED

> Visual structure is information. Structural devices … encode useful
> information about the content rather than decorate it.

Having bounded the name column, there was a fixed strip of nothing between it
and the readouts, and the temptation was to shrink the page until it went away.
What is there instead is the branch's own gap tally — dot points with no
question, questions with no marking guide, no sample, no outcome — in the
`AUDIT_TONE` colours the rail and the row badges already use.

This is not decoration filling a hole. Coverage says how many dot points have
_a_ question and says nothing about the eighty questions underneath with no
marking guide, and finding that out meant expanding the branch or toggling each
filter in turn and reading the tree back. `missingSamples` was added to the
stats roll-up for it — every other gap could already be counted for a branch;
that one could only be asked of one question at a time.

The coverage pill became a bar at the same time, at a **fixed** width: a bar
whose length depended on how long the name above it was would compare nothing.
A row with no gaps shows no tally at all — the first draft wrote "No gaps"
there, which on a healthy library is two words repeated down fifteen hundred
rows.

### 18. Nine filled buttons, and colour that meant nothing — FIXED

> Spend your boldness in one place.

Seven batch actions in seven saturated fills — indigo, sky, amber, pink,
purple, teal, rose — beside a gradient `Fix All Gaps` and a red
`Clear Questions`. Nine filled buttons in a row is no hierarchy at all, and the
colour was the last thing on this screen that did not mean anything: the third
pass had made the chip and the row badge agree on one colour per gap, and the
button that repairs that gap was picked separately. The seven are quiet now and
read their tone from `AUDIT_FILTERS`. `Fix All Gaps` is the one filled button
left, which is the one that runs everything.

### 19. A faculty is not a sixth syllabus level — FIXED

The grouping ask had an obvious wrong answer: give faculty a sixth hue in
`LEVEL_ICON_TINT` and a sixth `Folder`-family glyph, and the five levels, five
hues rule that `utils/levelColors.ts` exists to hold would be gone. A faculty is
not a NESA entity at all — it is the boundary a school's own structure draws
across the library — so it is drawn as a boundary: the subject's own mark, its
name in `.t-section` (which §4 reserves for exactly this, "a heading that
divides a panel into named parts"), and a rule down the left in the faculty's
colour. The five level hues are untouched underneath.

The faculty palette was not invented either. `ManifestImportModal` had been
colouring subjects for as long as it has existed; those values moved to
`utils/subjectAreas.ts` and both surfaces read them.

## Checked and left alone

- **The coverage dial keeps the header's strong position.** Finding 11 put it
  there and it is still the most characteristic thing in this subject's world.
  Shrunk from 64px to 56px with the header, and nothing else changed.
- **The big italic selection figure.** It duplicates the summary line now
  beneath it, and it is still the glanceable number; finding 9 already settled
  its treatment.
- **`min-w-[700px]` on the tree**, per the third pass. Still true.
- **The header's own left/right split.** Title at the left, instruments at the
  right, close in the corner. This is the one band where two clusters is the
  right answer, and the 1800px grid bounds how far apart they get.

### 30. The marking report would have told every student they skipped the strategy — FIXED

Caught while reviewing 24, not by a test. `SupportUsageSummary` names the
supports a student did not open, at the moment they are looking at a lost
mark, and the strategy's record read `showStrategy || strategyOpened` — the
row, and only the row.

That was right while the row was the only way to the advice. It is not any
more: the brief leads on the blank page and the row is the way back to it, so
a student who read the strategy exactly as intended and then started writing
never touches the row. Left alone, the report would have said "you did not
open the command verb's strategy" to every coach-mode student, about the
largest thing that had been on their blank page.

The brief counts now. The worst moment to tell someone something untrue about
what they did is while they are reading why they lost a mark.

## Checked on screen

1600×950 and 2560×1100 in dark, 1600×950 in light, and 700×900 for the
laid-down rail — plus a run through the actual workflow the ask described:
tick SCIENCE, watch it cascade to both courses, read the footer.

---

# Fifth pass: two more from use

Not a reading of the skill this time — two changes that came from working the
studio, recorded here because both are layout decisions the fourth pass's
grid has to keep holding.

### 20. A 1,500-row tree with no fixed point — FIXED

The fourth pass gave every row a readout column; it did not answer "where am
I". Expanded, the library is about 1,500 rows, and scrolling into the middle of
one leaves a screen of dot points and questions with nothing naming their
course or faculty.

Faculty and course rows pin. Two levels, not four: topics and sub-topics stay
in the flow because four pinned bands would be most of a short window, and the
two that pin are the two a reader loses first.

The cost is that row heights are now fixed rather than falling out of padding —
44px for a faculty band, 36px for everything else, which is what they already
measured. A pinned course sits directly under the faculty band, so it has to
know that band's height; deriving it at runtime to avoid writing the number
down would be a measurement in a render path for no gain. A pinned row also
needs an opaque ground: its own fill is a translucent tint over the tree's
background, and without one the rows sliding under it read through.

### 21. Where a retry control goes — FIXED

`Retry Failed (n)` joins the row after the rule, with `Export JSON`,
`Import JSON…`, `Sync to Library` and `Clear Questions` — the group that acts
on what the studio has already done, rather than the seven that act on the
current selection. It takes the amber of the "needs review" family rather than
a colour of its own, and it appears only when a run actually left something
behind, which is the same rule `Sync to Library` follows.

`Fix All Gaps` is still the one filled button on the row.

---

# Sixth pass: the four surfaces a student writes inside

The workspace's own coaching chrome, read against the skill: the verb strategy
area of the writing card, the Live Insights panel under it, the live stats
strip with the timer, and the outcome brief a student opens before writing.

These four had never been read as a set, and that turned out to be the
finding. Each was designed well on its own terms; together they all claimed the
same moment. At word zero a student met a glowing amber strategy band, a lit
amber lightbulb on the insights panel, three large stat figures, and a footer
saying "Before you write" — four things shouting, in a card where the writing
had not started.

The decisions below were put to the spec's owner as sixteen questions across
four rounds before any code moved.

## What it found

### 22. One glyph, three jobs — FIXED

`Lightbulb` marked Coach Mode in the editor header, the verb strategy row
directly beneath it, AND the Live Insights panel below that: three different
meanings, one glyph, all on screen at once. §5's "one glyph, one job" was
already in the spec; nothing had read these three together.

None of them kept it. The strategy row sets **the verb itself** as the mark —
`ANALYSE` in Newsreader, in the question's tier colour, the way a command term
is printed at the head of an HSC question. NESA's command terms are the
vocabulary this whole app is built on; a lightbulb is the most generic thing a
glyph can say. Coach Mode took a `Compass`, pairing against Exam's
`GraduationCap`. The insights panel dropped its tile for the count (below).

### 23. An infinite animation on a state that is not changing — FIXED

`animate-pulse-glow`, 4s, behind the strategy row's lightbulb. §5 retires
exactly this pattern and names it: "A heartbeat on a static state is decoration
that moves." The row was not changing; it was sitting there.

Gone with the leading state that carried it — see 24.

### 24. The coaching claimed the moment before the first sentence, from beside it — FIXED

The strategy row had three states, and its own comment said the leading one's
"whole claim is on the moment BEFORE the first sentence". That moment is the
blank writing surface, which was sitting empty two rows below, holding a
placeholder.

**The brief is now the blank page.** Verb, definition and method, set in
Newsreader — the face §1 chose to "simulate the gravity of an official
examination paper", and the same face the writing surface itself uses, so the
page's own voice states the instruction and then hands over. It is a
`pointer-events-none` layer sharing the textarea's padding, so the verb sits
exactly where the student's first word will; a click anywhere still lands on
the textarea; the first character fades it out; clearing the draft brings it
back. The row above went to a hairline permanently — two loud things at word
zero would spend the page's attention twice — and opens the same brief at panel
scale mid-draft.

**It trims itself to the card it is drawn on.** The writing card's height is
floored by the question beside it: ~200px of body on a laptop, ~100px on a
phone. A fixed per-part budget was tried first and could not work — the method
is one line for DESCRIBE and three for EXPLAIN, and the definition wraps
differently at every width, so any single number either hid a method that would
have fitted or showed one that clipped. It measures instead
(`hooks/useAvailableHeight.ts`), and cannot oscillate: the trim only ever goes
false → true for a given verb and room.

**The tip's shape is now visible.** The tips in `data/commandTerms.ts` are
authored as a method followed by its caveats — "Just name it and stop." /
"Explanations waste time and earn zero extra marks." Rendered as two identical
bullets, that relationship was thrown away. The method leads at reading size;
the checks sit under a rule, a step down in size and tone.

The textarea keeps its `placeholder` attribute throughout — it is that field's
accessible name, and dropping it while the brief showed left a screen reader
announcing an unnamed edit box. It is hidden to the eye only.

### 25. Notice colour and band colour were the same colour — FIXED

Live Insights painted warnings amber, positives emerald and notes sky. Those
are Tiers 3, 4 and 5. The panel sits directly beneath a writing surface painted
in the question's own tier hue, so on a Tier 3 question an amber "you are
missing terms" box sat under an amber writing card.

This is open question 1 from the first pass, answered in the one place it was
actually live. Colour as **fill** now belongs to the band system alone; a note
is marked by a rule down its left edge and its glyph. No seventh hue was added
— a system whose whole claim is six colours does not get a seventh for notices.

### 26. "Live Insights" was dashboard vocabulary — FIXED

Renamed **Draft check**, and re-cut to match: `buildWritingInsights` now puts
everything actionable first and allows at most one line of reassurance to
close, so a student scanning for what to do next does not filter praise out of
the list. The lightbulb tile became the **count**, which holds the row at its
neighbours' height and is the one marker there that says something the label
does not.

Two bugs fell out of looking at it on screen. The badge counted every note
while the line beneath it counted only the work, so a panel showed `2` over
"1 to work on". And the keyword nudge rendered "helicase…." — an ellipsis
followed by a full stop.

### 27. Three equal stat boxes, and a clock that could not be trusted — FIXED

The strip was icon + small label + large figure, three times, divided — the
treatment the skill names as the generic default. The three facts are not
equal: the clock is the only one that moves on its own and the only one with a
consequence. It leads; words and syllabus coverage support it at label weight.
Figures take the mono face per §4, and no longer borrow emerald and sky for
quantities that mean no band.

The clock itself was worse than its presentation. It counted down from a
per-verb, per-mark budget and **stopped dead at 00:00**, sitting red for the
rest of the session — a cliff at exactly the point "you are two minutes over"
becomes the useful reading. And in Coach Mode it never started unless a student
pressed Play, which almost nobody does, so the one figure with a consequence
was usually frozen at its starting value.

It now measures time spent: starts on the first keystroke, runs past the budget
as `+2:10 over`, and stops itself after three minutes without typing — because
a clock that starts itself has to stop itself, or an abandoned tab reports a
student eight hours over a six-mark question. Exam Mode never pauses: under
exam conditions the clock does not stop while you think. A student's own Pause
outranks the auto-start and survives the next keystroke.

`animate-pulse` on the sub-minute figure is gone. It is an opacity animation
sitting on a reading — the fault §2 rule 3 exists to keep out — and it dimmed
the one figure that had just become urgent. Urgency is tone now. The figure
also gained `role="timer"` and a spoken label; a ticking display is not
readable as digits.

### 28. The outcome brief was four cards and two closes — FIXED

Re-cut as a reading document: the question frames at the top, the outcome
statement is the one tinted thing on the page, the briefing is prose under it.
The shell narrowed from `max-w-2xl` to `max-w-xl`, because the briefing ran
95–100 characters against §4's measure rule and the whole dialog is a reading
surface — §4 also records that capping the text inside a wide card was tried
elsewhere and reverted.

Five things went:

- `← Previous` / `Next →`. Finding 10's pattern, still live here.
- A gradient-filled "Close" styled as a primary action, in a dialog whose only
  job is to be read, beside a ✕ that already closed it.
- `Target` used twice in one modal, and `Sparkles` marking the AI panel — the
  glyph finding 8 already retired, on a panel whose first screenful is NESA's
  own syllabus wording.
- "What Students Must Demonstrate": a label above the sentence it described,
  written in the third person to the one person reading it. Now
  "What you have to show".
- `opacity-70` on the locked teaser, which the blur beside it was already
  doing. `textDimming.test.ts`'s ratchet is at three exemptions, from four.

### 29. The copy that earned the click was hidden below 1280px — FIXED

"Before you write" was an eyebrow over "What's assessed", and `hidden xl:block`
because it is the widest element in a footer row that is tight on a phone and
tighter in the two-column layout. So on most screens the promise was simply
gone.

Folded into the label: **"Read before you write"**, one line at every width,
narrower than the pair it replaced. Its glyph is the one the dialog opens on.

### 30. The marking report would have told every student they skipped the strategy — FIXED

Caught while reviewing 24, not by a test. `SupportUsageSummary` names the
supports a student did not open, at the moment they are looking at a lost
mark, and the strategy's record read `showStrategy || strategyOpened` — the
row, and only the row.

That was right while the row was the only way to the advice. It is not any
more: the brief leads on the blank page and the row is the way back to it, so
a student who read the strategy exactly as intended and then started writing
never touches the row. Left alone, the report would have said "you did not
open the command verb's strategy" to every coach-mode student, about the
largest thing that had been on their blank page.

The brief counts now. The worst moment to tell someone something untrue about
what they did is while they are reading why they lost a mark.

## Checked on screen

Driven in Chromium at 1440×950 and 390×844, both themes, against the bundled
Biology curriculum — which is how three of the defects above were found at all.
The blank-page brief was clipped by the card on the first build and again on
the second, the draft-check badge disagreed with its own summary, and the
doubled ellipsis was sitting in a live nudge. None of them would have shown up
in a unit test written against the same reasoning that produced them.

## What this pass did not change

The tier palette, the luminous progression, the panel surface, the disclosure
model, and the `t-section` / `t-label` voices. Every one of those was checked
against the four surfaces and left alone: they are the spec working.

---

# Seventh pass: the follow-ups from the sixth

Four of the five items the sixth pass left open. The fifth — persisting the
clock across a refresh — touches the data layer and a version bump, so it is
its own change.

### 31. A rename silently defeated a contrast state — FIXED

The sixth pass renamed "Live Insights" to "Draft check". The light-theme
sweep's `openPanel` helper opened panels by name and **returned quietly** when
the name matched nothing, so that state went on passing while measuring one
panel fewer. Its sibling guard did not catch it either: `readings.length > 20`
counts the whole page, and one panel's handful of nodes does not move it.

This is the failure the spec's own header warns about — green partly by never
having seen the component — and it had happened twice more than anyone knew:

- **"What's Assessed" had never been measured at all.** It renders only when
  the question links an outcome, and `openFirstQuestion` lands on one that
  links none. In the bundled Biology curriculum every question that DOES link
  outcomes is Tier 4+, which the free plan locks, so as `user` the panel was
  unreachable in the most literal way: the questions that produce it cannot be
  selected. `openQuestionWithOutcomes` now walks to one, and that state runs as
  `admin`.
- **`openPanel` was matching the wrong buttons.** It searched every button on
  the page by accessible name and took the first in DOM order, so asking for
  /syllabus terms/ found the question card's "Syllabus terms to weave in"
  label — a button, earlier in the tree, and not a panel. It now looks only at
  `button[aria-expanded]`, which is what a disclosure is, and that also waits
  out the resting `DraftCheck` for free.

A missing panel is now an error with a message naming the three things it can
mean. **Three contrast failures fell out the moment the state actually opened**,
all pre-existing, none reachable before:

| reading                                                          | measured | floor |
| ---------------------------------------------------------------- | -------- | ----- |
| "Terms with this mark are named…" `emerald-600` on white         | 3.77:1   | 4.5   |
| the API counter's figures, `--color-accent` → `sky-600` on white | 4.09:1   | 4.5   |
| "Context Scenario" `slate-500` on the card, dark theme           | 3.73:1   | 4.5   |

The last of those only renders for a question that HAS a scenario, which is the
same gap in a second dimension.

### 32. One glyph, three jobs — the other half — FIXED

The sixth pass removed the lightbulb from the writing page and the draft check.
The verb ribbon still rendered `StrategyTip`, so the same advice for the same
verb read one way on the writing page and another in the ribbon minutes later —
with the method and the caveat on it flattened to equal bullets. That is the
thing `StrategyTip`'s own docstring claimed to prevent.

The ribbon renders `StrategyBrief` now, headless: the term is already a heading
beside its tier chip there, and the definition is the line above. `StrategyTip`
is deleted. The contrast measurement its accent token carried — `slate-500` is
within a tenth of the floor on `slate-100` over a tier wash — is kept where it
still binds, and the sweep measures it.

### 33. A control named by its own tooltip — FIXED

Below `2xl` the writing-mode toggles hide their labels, so the accessible name
fell back to `title` and a screen reader announced "Coach Mode — live
highlighting, draft checks and exemplars, button". A name that swallows a
sentence also collides with everything: a locator for the draft-check panel
matched the coach toggle, because "draft checks" is inside its tooltip.

The question flag chip was worse — its title interpolates the flag reason, so
whatever a curator typed became the name of the control.

Named explicitly; the sentences stay in `title`, which is what they are.
`tests/unit/controlNames.test.tsx` holds it. Also fixed in the same sweep:
"Change" in the breadcrumb, the sample-answer generate button, and the
auto-save note in the results modal, which collapsed below `md` to a tick that
said nothing at all to a screen reader.

### 34. The draft check appeared mid-sentence — FIXED

It returned `null` on a blank draft, so it popped into existence on the first
word and pushed the metrics strip and the reference rail down the page while
the student was typing — and the one moment it could say what it is for was the
one moment it was absent (§5: an empty screen is an invitation to act).

It rests now: same row, same height, saying what it will do. Not a disclosure
in that state, because there is nothing behind it. The count reads `—` rather
than `0`, since zero is a RESULT — what it says when it has read the draft and
found nothing to fix — and there is no draft yet.

### 35. Two calls to the metrics hook — CHECKED AND LEFT

`WorkspaceRightPanel` and its child `WritingMetricsDashboard` both call
`useWritingMetrics` over the same debounced answer, so every pass runs twice.
Measured before touching it: a full pass over a 181-word draft with 12 syllabus
terms costs **0.18 ms**. There is no correctness argument either — these are
pure functions over identical inputs, so the two cannot disagree whether or not
they share a computation.

Prop-drilling the result would change a component contract and three test files
to save a fifth of a millisecond. The measurement is recorded in the hook so
the next reader does not re-derive it, along with the invariant that actually
matters: the dashboard must keep receiving the DEBOUNCED answer.

---

# Eighth pass: the clock keeps its place

The last of the sixth pass's five. Held back from the seventh because it
touches the data layer and a `DATA_VERSION` bump, and because writing six
minutes onto the wrong question is the same class of mistake as writing an
answer onto it — it deserved its own read.

### 36. The lead figure on the strip was the one thing that forgot — FIXED

Drafts persist to IndexedDB. Time spent did not, so a reload handed back the
full budget as though no time had passed — and the sixth pass had just made
that figure the lead of the live stats strip.

`Prompt.draftElapsedSeconds` sits beside `userDraft` and is saved by the same
machinery, under the same ownership guard: the workspace's `latestDraft`
snapshot carries it, so whichever moment a flush fires in, the clock is
written to the question it was counting. It never goes backwards — a flush can
fire from `pagehide` after the clock has been reset for another question, and a
saved total that went down reads as time a student never got back.

Restore or reset, and the difference is which of the two happened. Arriving at
a question hands back the time already spent on it. **Switching into Exam Mode
does not**: that is a fresh attempt under exam conditions, and starting it
part-spent would make the simulation a lie. A reload mid-exam is an arrival,
not a switch, and that is the clock where elapsed time matters most — so the
component remembers which mode it was last set up in to tell the two apart.

### 37. Reloading started a clock nobody had started — FIXED, and only seen in the app

Found by driving the real app, not by a test. The clock starts on the first
keystroke, and the effect that does it fired on the mere PRESENCE of text. That
was harmless while nothing survived a reload. The moment the draft came back
WITH its words, reloading also started the clock: a student returning to read
what they had written was charged for the reading, up to the three-minute idle
pause, without typing a character.

The test is the one the workspace already uses to decide whether an answer
belongs to its question — what is on screen is the stored draft until it
differs from it. The stored draft arriving looks exactly like typing from
inside the component, and it happens on every mount, every reload and every
switch back.

Measured on the real app before and after: `07:00` on arrival, `05:44` after
74 seconds of writing, `05:45` after a reload. One second of drift, and the
figure no longer runs while nobody is writing.

### 38. The final flush held back the part-minute — FIXED

Elapsed time is written on whole minutes during a session: the clock reports
every second and a flush fires on every pause in typing, so writing on any
change would put a storage round-trip behind each tick to record a number
nobody reads at that resolution. The flush on the way out is not during a
session and the throttle saves nothing there, so it writes whatever has
accrued.

A backstop rather than the main path, and worth saying so: because the answer
and the clock are written together, any flush that saves typing carries the
clock with it. This is for what the debounce misses — switching apps on a
phone mid-sentence.

### Still not measurable: the clock's urgency tones

`text-amber-700` under a minute and `text-red-600` past the budget. The budget
is two minutes at the very shortest and four to fourteen for anything a student
writes, so no sweep state can sit through it — and the clock pauses itself
after three idle minutes precisely so a tab left open does not keep counting,
so waiting does not get there either.

Persistence made the state RESTORABLE but not reachable: seeding it means
writing into IndexedDB behind the app's back, which is a fixture pretending to
be a user. The unit tests cover which tone is applied when, including restored
past the budget. What nothing measures is the ratio those two tones actually
make on the stats strip. Recorded in `tests/e2e/light-theme.spec.ts` beside the
other state it cannot reach.

---

# Ninth pass: looking at it

No new brief — the four surfaces from passes six to eight, driven in Chromium
and read on screen at 1440 and 390 in both themes. Three findings, all of them
things only a screenshot shows.

### 39. Opening the strategy row on a blank page rendered the verb twice — FIXED

The worst of the three, and invisible to every test. On a blank page the brief
is the writing surface; opening the row put a second copy of the same verb and
the same definition in a panel above it, and the panel's height pushed the page
copy down until it was clipped mid-sentence. Two DESCRIBEs, one of them cut in
half.

The brief shows in ONE place at a time. The page yields to the panel, so
opening the row on a blank page trades the large brief for the complete one —
panel scale also carries the checks on the method, which the page drops to fit.
Shutting it hands the page back.

### 40. One panel in the column labelled itself differently — FIXED

`DraftCheck` set its name AND its summary in `.t-label`, under a comment
claiming "the rail's other panels label themselves the same way". They do not:
`AccordionSection` and `SampleAnswersAccordion` both set the name in
`.t-section` with the caption in `.t-label`, and `ReferenceMaterials` carries a
comment explaining that this is what makes the pair read as a heading and its
caption rather than two labels.

On a desktop it read as a slight oddity between the two columns. On a phone,
where all five panels stack — Draft check, Syllabus terms, Grade standards,
Marking guide, Sample answers — it was the only one in a different voice.
`tests/unit/workspacePanelChrome.test.tsx` now holds the treatment across the
panels that share the column.

### 41. The clock read as three tokens — FIXED

JetBrains Mono gives the colon a full digit's advance, which is right for a
column of figures and wrong for a time. At 30px the lead figure on the stats
strip read `07 : 00`, with air around the middle.

Pulling the colon 0.18em each side closes it without touching the DIGITS, so
they keep their tabular advance and the figure does not jitter as it ticks —
which is the whole reason it is set in mono. Compared on screen before
choosing: `tracking-tighter` on the whole string was indistinguishable from the
default, and 0.28em crowded the colon into the digits either side of it.

## The pattern, four passes running

Every pass since the sixth has found something in the browser that the tests
agreed on and got wrong: a brief clipped by its card, a badge disagreeing with
its own summary, a doubled ellipsis, a clock starting itself on reload, a verb
rendered twice, a panel in the wrong voice. None of them would have failed a
test written from the same reasoning that produced the code.

Worth treating as the standing rule for this area rather than a run of
coincidences: **when a surface changes, look at it.**

---

# Tenth pass: the two guides, and getting into them

The brief this time came from use: the outcome brief and the command-verb
guide "are not immediately obvious as items worth interacting with unless you
already know". That is a discoverability problem before it is a design one, so
it is the half this pass leads with.

### 42. The affordance was on the element that did nothing — FIXED

The command verb inside a question has always been drawn `font-black`, in the
accent colour, `underline decoration-2` — which is to say, **exactly like a
hyperlink**. It was a `<span>`. Meanwhile the only real way into the guide was
a chip in the card header styled identically to the `4 Marks` and `Band 2`
chips beside it, which state facts and do nothing: same fill, same border, same
radius, same everything, with a hover tint and a `title` as its entire claim to
being pressable.

So the app put link styling on the thing that did nothing, and no styling on
the thing that did something. A student who did not already know the guide
existed had no reason to look for it — which is exactly what was reported.

The highlighted verb is the trigger now. It costs no new chrome, it is where
the eye already is, and it explains the highlight that was already there: the
app marks this word as the one that matters, and pressing it now says what it
wants. It is also the glossary gesture every reader knows — so the underline
became dotted, which is what "this word has a definition" looks like.

`renderFormattedText` takes an optional handler, and **only the question card
passes it**. Everywhere else the verb renders — feedback, exemplars, marking
criteria — it is being quoted rather than asked, and a button there would be a
control acting on a different question. Exam Mode passes nothing: the guide is
assistance.

The header chip keeps its place (a question does not always contain its own
verb literally) and takes the same dotted underline, so one visual language
means "this opens the verb guide".

### 43. A text button with no edge until you hover — FIXED

"Read before you write" sat in a footer of icon buttons and chips with
`border-transparent` until the pointer arrived. On a touch screen, where there
is no hover at all, it never read as anything but a caption. It has a resting
tint and edge now.

### 44. The verb guide was seven identical boxes — FIXED

The content is the best in the app — definition, the shape of the answer, how
to answer it, the marker-facing language, what separates a strong answer, how
the marks fall, a worked example. The presentation gave all seven the same
bordered tinted box, each with a glyph beside its heading, over a grid of five
stat tiles with circular icon badges. Everything looked exactly as important as
everything else, which for a student who has stopped writing to ask "what does
this word want?" is the one thing the page must not say.

Rebuilt on the same terms as the outcome brief in pass six:

- **The definition is the hero** and the only thing with a fill, set in
  Newsreader like the outcome statement.
- **Five figures, one line.** A tier, a mark range, a ceiling, a time and a
  length are one reading — what am I asked for, and how much of it — not five
  cards. The boxes, the badges and the five glyphs go; the figures keep their
  weight and take the mono face.
- **Sections are a heading over prose, divided by rules.** Seven glyphs gone:
  each was the third thing announcing "this is a section" after the heading and
  the box.
- **The structural keywords are spaced words in the band colour**, matching
  `StrategyBrief` — they are words to WRITE, not controls to press.
- **One close.** The header ✕, Escape and the backdrop; the gradient "Done"
  button went, as it did in the outcome brief.
- **A reading measure**, `max-w-xl` like the outcome brief, down from `3xl`.

The header said `Info` in a tile beside a verb, over a meta line repeating the
tier and marks the figures now state. It says what the reader is looking at
instead — "Command verb" over the word itself — which is what someone who
arrived by pressing a word in their own question needs to be told.

It now fits one screen without scrolling. It did not before.

---

# Eleventh pass: the panels stand on one line

Also from use: _"in two column view the placards underneath the writing prompt
and writing area are almost aligned and have balanced spacing but the writing
stats placard is large."_

Measured at 1440×950 before changing anything, which is how "almost" turned
out to be exact:

|       | left column                   | right column                 |
| ----- | ----------------------------- | ---------------------------- |
| row 1 | Syllabus Terms — y 794, h 62  | Draft check — y 794, h 62    |
| row 2 | Grade Standards — y 872, h 62 | **live stats — y 873, h 84** |
| row 3 | Marking Guide — y 950, h 62   | Sample Answers — y 973, h 62 |

Row 1 aligned to the pixel, row 2 was a pixel out, and row 3 was 23px out —
the whole of it the one panel's extra height, handed down the column.

### 45. Four panels agreed on a height by coincidence — FIXED

Nothing said what height a panel row stands at. Four of the five reached 60px
the same way by accident — `py-3.5` either side of a 32px icon tile — and the
live stats strip, which has no tile, did not. There was no shared value to be
wrong about, so the answer was "whatever the contents come to", and the two
columns only read as a grid for as long as the contents happened to agree.

`PANEL_ROW_MIN_H` in `utils/panelStyles.ts` now states it once, beside the
surface all five already share, and all five carry it. A panel whose contents
come out shorter is padded up to the line; one that wants to be taller has to
say so on purpose.

It is 61px rather than a round 60, and the odd number is the point. A 12px line
at the 1.35 leading these panels use is 16.2px tall, and three of them stack a
name over a caption: 32.4px of text against a 32px tile. At 60 those three
overshot by four tenths of a pixel — invisible on any one panel, and exactly
how the two columns' third rows ended up a pixel apart. A line the tallest
natural stack clears puts every panel on the same whole pixel. All six now
measure 63.0px (61 + the surface's 2px border) at every width from 768 up, and
both columns' rows sit at 794 / 873 / 952.

### 46. The clock was stacked on its own caption — FIXED

The 22px was one decision: the clock at `text-3xl` with its caption set
beneath it, 58px of stacked lead in a row whose other content is 36px.

Shrinking the clock was the obvious fix and the wrong one — it is the lead
figure on the strip, the only one that moves on its own and the only one with a
consequence, and that was settled in the eighth pass. **The caption moved
beside it instead.** A clock reads that way anyway — "07:00, guide for 4
marks" is how it would be said aloud — and it puts the tallest thing in the row
back to being the two support lines.

Two things fell out of moving it:

- **The caption needed a reserved slot.** It is the one string here that
  changes length on its own — `paused` to `left of 7 min` to `over 7 min` — so
  left to size itself it shunts the word count sideways mid-sentence.
  `md:w-[13.5rem]` holds the longest state, checked against the longest verb
  budget and the largest mark value.

  From `md` and not `sm`, which the probe caught and the eye would not have:
  the strip goes one-line at 640 and the controls take their full width from
  the start, so between 640 and 767 holding 216px truncated `15 words of about
  32` into `15 words…`. A figure the student cannot read is a worse trade than
  a caption that moves three times in a session, and those widths are a single
  column anyway, where nothing is lining up against the strip.
- **The opening caption was a repetition.** It read `7 min for 4 marks` while
  sitting under a clock reading `07:00`. That was already a restatement; on one
  line it was a plain one. It reads `guide for 4 marks` now — the marks are the
  half of that sentence the clock cannot say, and "guide" is the word the
  spoken label already uses.

### What the tests could not have caught

Both of these are the standing rule again. No unit test can see a panel's
height — jsdom does no layout — so `workspacePanelChrome.test.tsx` asserts the
shared token instead, which is what stops a panel quietly leaving the set; the
height itself was measured in a browser, at eight widths and in both themes —
every panel 63.0px from 640 up, and both columns' rows level at 1280 and 1440.
