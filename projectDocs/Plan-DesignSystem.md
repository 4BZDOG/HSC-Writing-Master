# The next batch: making the declared voice a system

Worked through `.claude/skills/frontend-design/SKILL.md` in its own two passes —
a token system first, then that plan reviewed against the brief before any of it
is built. Every number below is from a grep or a browser measurement.

## The brief, stated

The skill asks for this before designing, and the repo has never written it down.

- **Subject.** NSW HSC exam-response practice and marking. The vernacular is
  NESA's: bands, command verbs, marking guides, dot points.
- **Audience.** Year 11–12 students writing under exam conditions, and the
  teachers who curate what they answer. Two audiences on one screen, which the
  Common mistakes panel already had to solve once.
- **Primary job.** Write a response, then understand the band it lands in and
  why. Everything else on the page is in service of that.

## The fixed point

The owner has settled the display voice this session: **Inter 900, italic,
tracked caps** for display; IBM Plex Sans for reading. The skill is explicit
that the brief's own words win, including when they ask for one of the looks it
flags — so this plan does not relitigate it. It takes it as the constraint and
asks what has to follow.

Everything below is a consequence of that decision, not a challenge to it.

## What the measurements say

### 1. The voice reaches three headings out of about a hundred and forty

`h1`–`h4` across `components/` and `App.tsx`: **139**. Set in the display voice:
the wordmark, the two workspace card headings, and `.t-section` — used in
**exactly one component**. **37** headings are still set with `.t-label`, which
is the _caption_ token, so a section's heading and the caption inside it are the
same size, weight and case on most screens in the app.

That is not a caps-versus-sentence-case question. It is that there is no stated
rule for what earns the display voice, so it landed wherever it was applied by
hand.

### 2. The product's name is set two different ways

The two screens everyone sees, disagreeing about the brand:

|                     | class                                         | renders as                       |
| ------------------- | --------------------------------------------- | -------------------------------- |
| `LoginPage.tsx:393` | `text-4xl font-bold tracking-tight`           | Plex 700, sentence case, upright |
| `HEADER_WORDMARK`   | `t-display italic uppercase tracking-tighter` | Inter 900, italic caps           |

The hero — the first thing anyone sees — does not use the brand voice at all.
The skill's line about opening on the most characteristic thing in the subject's
world applies, but this is simpler than that: it is the same name, twice, in two
typefaces.

### 3. There is no body size

Sizes in use, counted:

```
text-xs   (12px) 299      text-[10px] 130      text-4xl 11
text-sm   (14px) 291      text-[11px]  73      text-3xl  9
text-xl   (20px)  40      text-[9px]   14      text-[13px] 7
text-2xl  (24px)  33      text-[17px]   2      text-5xl  1
text-lg   (18px)  28      text-base (16px) 6
```

Fourteen sizes, no scale, and **`text-base` appears six times**. The app's
default reading size is 12–14px, with **217 uses below 12px** propped up by a
readability floor in `index.css`. The skill asks for a type scale with
intentional steps; this is drift with a patch under it.

### 4. Meta is stuffed into headings, and the caps amplified it

`ReferenceMaterials.tsx:167` builds its panel title as

```
`What's Assessed · ${n} Outcome${n === 1 ? '' : 's'}`
```

which now renders **WHAT'S ASSESSED · 1 OUTCOME** in tracked italic caps —
the skill's "meta strings joined with middle dots" in the loudest type on the
rail. `AccordionSection` already takes a `subtitle` prop built for exactly this,
and the Marking Guide panel already uses it. **59** middle dots are visible on
screen app-wide (a further 6 sit in hover-only `title` attributes and do not
count).

### 5. Carried, and still true

The writing surface's measure was **114 characters** when the earlier review
took it — a typing surface rather than a reading one, so a different question
from the report column, which was fixed. I did not re-measure it for this plan;
treat the number as the last one taken, not a fresh one.

## Pass one: the token system

### Type

Six steps, named by job rather than by size, so a call site says what a thing
**is**:

```
caption   12px / 500   .t-label      the small print inside a block
ui        14px / 500   default       controls, chips, table cells
body      16px / 400   .t-body       anything anyone READS: question, scenario,
                                     feedback, exemplars, marking guide
title     20px / 600   .t-title      a card or modal's own name
section   12px / 900   .t-section    a section boundary — Inter, italic, caps
display   24-36 / 900  .t-display    the product name and the two card headings
```

The two ends are already built. What is missing is the middle: `body` at 16px,
which is where the reading actually happens and where the app currently has six
call sites.

### The caps rule, stated once

Caps mark a **boundary**, never a caption. One level of heading wears the
display voice; the caption inside it never does. That is the rule that decides
all 37 outstanding headings without another judgement call each time — and it is
also why `.t-label` stays sentence case, which the owner already chose.

### Colour and layout

Unchanged, deliberately. The band ramp is the app's own system and
`DesignSpec.md` §2 is its authority; the radius and elevation tokens were settled
in the first review. The skill's advice to spend boldness in one place says the
type is where this batch spends it — adding a colour move on top would be the
accessory to take off.

## Pass two: reviewing that plan against the brief

The skill asks whether any of this is the generic default I would produce for
any similar app. Two parts were, and are revised:

**A six-step modular scale is what I would propose for anything.** Kept, but the
justification changed: this app is unusually dense — dashboards, rails, chips,
a marking ladder — and a scale that is _too_ coarse would be worse than the
drift. The steps above are drawn from the sizes already carrying real weight
(12, 14, 20, 24), not from a ratio applied on principle. The only genuinely new
step is 16, and it exists because the reading surfaces have nowhere to sit.

**"Fix the hero" was heading somewhere generic.** My first instinct was to
restyle the login page around the brand voice — bigger, louder, more of it. That
is the templated answer. The measured problem is narrower and duller: the same
name is set two ways. The fix is to make the login page use the token the header
already uses, and change nothing else about that screen. The band ladder mark
stays as it is; it earned its place by being the app's own device.

## Order

1. **The name, set once** (finding 2). One class swap. It is the smallest change
   and it is on the first screen.
2. **The caps rule, written into `DesignSpec.md` §4, then applied** to the 37
   headings still wearing the caption token (finding 1). Mechanical once the
   rule exists; a judgement call per site without it.
3. **`.t-body` at 16px, on the reading surfaces only** (finding 3) — question,
   scenario, feedback, exemplars. Not a 217-site migration: stop the bleeding,
   convert what is actually read, leave the chips and dashboards alone.
4. **The panel title's meta into its `subtitle`** (finding 4), where the prop
   already exists.

1 and 4 are small and self-contained. 2 and 3 are the real work, and both need
the rule written before the edit — which is the lesson from the `font-bold`
pass, where a codemod without a rule produced a number nobody could defend.
