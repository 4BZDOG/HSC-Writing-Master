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

### 3. Everything is bold, so weight encodes nothing — OPEN

`font-bold` 562 + `font-black` 280 = 842, against `font-normal` 4 and
`font-medium` 122. The label token takes weight 500 at its 424 call sites, which
is a dent, not a fix. Body copy is untouched.

### 4. Motion is scattered rather than orchestrated — OPEN

103 `animate-fade-in` + 41 `animate-fade-in-up` across 73 of 106 files, 340
`transition-all`, 53 `hover:shadow`, 50 `hover:scale`. The skill calls
per-section fade-and-slide-up plus per-card hover transitions the generic
default.

Note in mitigation: `prefers-reduced-motion` is honoured in `index.css` and five
components, and every keyframe animates only `transform`/`opacity`. The quality
floor is real; the budget is not.

### 5. No radius or shadow system — OPEN

16 distinct radii (`rounded-lg` 321, `xl` 260, `2xl` 151, plus nine arbitrary
values from `[14px]` to `[48px]`) and 7 shadow steps. `PANEL_SURFACE` in
`utils/panelStyles.ts` is the existing cure and is imported by 4 of 106
components.

### 6. Line length is never constrained — OPEN

`max-w-prose` and `ch` units appear zero times. Reading surfaces are bounded by
container width only. The skill asks for under 80 characters; `DesignSpec.md` §4
already assigns Newsreader to the manuscript surfaces, so the measure is the
missing half of a rule the spec has started.

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

| Phase | Scope                                                          | Gate                                             |
| ----- | -------------------------------------------------------------- | ------------------------------------------------ |
| 2     | Body copy to normal weight; bold means something (finding 3)   | `font-bold`+`font-black` count falls below 300   |
| 3     | Three radii, two shadows, `PANEL_SURFACE` adoption (finding 5) | distinct radii ≤ 4; `PANEL_SURFACE` imports > 40 |
| 4     | One orchestrated entrance per screen (finding 4)               | files with an entrance animation < 20            |
| 5     | Measure caps on prose surfaces (finding 6)                     | every manuscript surface carries a `ch` cap      |

Phases 2–5 are deliberately not started. Colour work is not listed at all, and
should not begin before question 1 is answered.
