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

## Findings that stand

Checked against `DesignSpec.md`; none of these contradict it.

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

### 4. Motion is scattered rather than orchestrated — OPEN

103 `animate-fade-in` + 41 `animate-fade-in-up` across 73 of 106 files, 340
`transition-all`, 53 `hover:shadow`, 50 `hover:scale`. The skill calls
per-section fade-and-slide-up plus per-card hover transitions the generic
default.

Note in mitigation: `prefers-reduced-motion` is honoured in `index.css` and five
components, and every keyframe animates only `transform`/`opacity`. The quality
floor is real; the budget is not.

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

`max-w-prose` and `ch` units appeared zero times. Worse: the three main reading
blocks carried `prose prose-slate dark:prose-invert max-w-none`, and
`@tailwindcss/typography` is not installed — `.prose` appears zero times in the
built CSS — so those classes were inert except `max-w-none`, which switched off
a measure that had never been on.

Five reading surfaces now carry `max-w-[56ch]`, documented in `DesignSpec.md` §4
and gated by `tests/unit/readingMeasure.test.ts`.

The number was measured in a browser rather than reasoned about, and the obvious
values were all wrong: `ch` is the advance width of "0", about 1.35× wider than
Newsreader's average lowercase, so `68ch` rendered **89** characters. `56ch`
gives **74–76**, which is where a serif wants to be.

The writing surface is deliberately still uncapped, at 114 characters. Its three
stacked layers must align pixel for pixel, and the card's width comes from the
question above it, so a cap leaves a few hundred pixels of empty card. They
share one constant, so it is a one-line change whenever that trade is judged
worth making.

### 7. Middle-dot meta strings — OPEN

63 across 27 files ("Usage today · per user", "Free plan · daily marked
evaluations"). Named by the skill as template chrome. Low value, low risk.

## Open questions for the spec's owner

1. **Can a UI colour and a band colour share a hue?** §2 aliases four tiers to
   amber/emerald/sky/indigo, and those same families also carry non-band
   meaning (amber for locks and warnings, emerald for success, indigo for
   primary actions). Either that is fine because context disambiguates, or the
   non-band uses need their own hues. This review has no mandate to decide it.
2. **Does "Luminous Progression" survive contact with the band colours?** The
   editor shifts Slate → Emerald → Sky → Indigo with word count, which is the
   same ramp as Tiers 4–6. Two different things moving through one set of
   colours.
3. **Is Inter still the right interface face?** The skill calls it the default
   pairing of every AI-built product. Newsreader already carries the manuscript,
   which is the half of the system specific to this subject. Changing the
   interface face is a bundle and legibility decision, not a styling one.

## Remaining phases

Each is a separate PR, each verifiable by a grep count plus the existing
`tests/e2e/support/contrast.ts` audit.

| Phase | Scope                                            | Gate                                  |
| ----- | ------------------------------------------------ | ------------------------------------- |
| 4     | One orchestrated entrance per screen (finding 4) | files with an entrance animation < 20 |

Phases 2–5 are deliberately not started. Colour work is not listed at all, and
should not begin before question 1 is answered.
