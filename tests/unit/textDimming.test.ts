import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * DesignSpec §2, Light Theme Parity, rule 3: text is never de-emphasised with
 * `opacity`.
 *
 * Opacity does not scale a contrast ratio — it composites the text TOWARDS its
 * background, and the loss is far from linear, which is why every fix that
 * tried to keep the dimming and merely soften it has come back. Measured in
 * Chromium on this app's own surfaces: `slate-500` reads 4.81:1 undimmed,
 * 3.91:1 under `opacity-90`, and 2.66:1 under `opacity-70`; the live-insights
 * summary read 3.22:1 under `opacity-80` and the editor's spent-strategy row
 * 2.30:1 under an ancestor's `opacity-60`.
 *
 * The verb ribbon alone has had this exact defect fixed three times, each with
 * a long comment re-deriving the same arithmetic from scratch, because nothing
 * stopped the fourth. This is that stop.
 *
 * WHY A RATCHET AND NOT A BAN. The e2e contrast sweep is the real check, and it
 * measures rather than guesses — but it only sees states it is driven into, and
 * most of the sites below sit in modals no spec opens yet. Deleting them by eye
 * would be the same guesswork the sweep exists to replace, and several are
 * probably fine (an icon that repeats its label, a deliberately blurred
 * teaser). So they are RECORDED, not endorsed: the count may fall, and it may
 * not rise.
 *
 * When you reduce one, drop the number here — a failure saying the count went
 * DOWN is the good kind, and the right response is to record the win.
 */

/** Where a text colour is being set. */
const TEXT_COLOUR =
  /(?:^|[\s'"`{])(?:light:|dark:)?text-(?:slate|gray|zinc|neutral|stone|white|black|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-?/;

/**
 * An opacity utility that actually dims something.
 *
 * `opacity-0` and `opacity-100` are a visibility toggle, not a dimming — a
 * chevron that appears only when a row has children is either drawn or it is
 * not, and neither state is hard to read. The first version of this check
 * matched `opacity-100` by accident (`[1-9]0` matches the "10" inside it) and
 * flagged exactly that case in `SelectionTree`, which is how the distinction
 * got noticed. An arbitrary value is assumed to dim, because it usually does.
 */
const OPACITY_TOKEN = /(?:^|[\s'"`{])opacity-(\[[^\]]+\]|\d+)/g;

const dimsSomething = (line: string): boolean => {
  for (const m of line.matchAll(OPACITY_TOKEN)) {
    const value = m[1];
    if (value.startsWith('[')) return true;
    const n = Number(value);
    if (n !== 0 && n !== 100) return true;
  }
  return false;
};

/**
 * The exceptions, each with the reason it is one.
 *
 * This replaced a per-file COUNT. A count records how much debt a file has and
 * nothing about whether any of it is a defect, so it cannot tell a genuine
 * exemption from an unexamined one — and it fails on the fix as loudly as on
 * the regression. Matching on a snippet of the line says what is allowed and
 * why, holds at zero everywhere else, and fails usefully when the exempted
 * code changes: an exemption that stops matching is one nobody has re-read.
 *
 * All three are cases WCAG or the sweep already excludes, so none of them is
 * debt being deferred.
 */
const EXEMPT: { match: string; why: string }[] = [
  {
    match: "cursor-not-allowed border-white/10 light:border-slate-400 opacity-50",
    why:
      'the evaluate button while the draft is empty — a DISABLED control, which ' +
      'WCAG 1.4.3 exempts and `contrast.ts` already skips.',
  },
  {
    match: "isSyncing ? 'opacity-50 cursor-not-allowed' : ''",
    why: 'the force-sync button while a sync is running — disabled, as above.',
  },
  {
    match: 'blur-[1.5px] opacity-70',
    why:
      'the locked-outcome teaser, which is `aria-hidden` and BLURRED on purpose: ' +
      'it shows the shape of content the reader has not unlocked. Legible is the ' +
      'one thing it must not be.',
  },
];

const ROOT = resolve(__dirname, '../..');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full);
  }
  return out;
};

const offenders = (): string[] => {
  const lines: string[] = [];
  for (const file of [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'utils'))]) {
    const rel = relative(ROOT, file);
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // Prose about the rule is not a breach of it — this file and the
        // comments recording past fixes both quote the class names.
        const trimmed = line.trimStart();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
        if (!TEXT_COLOUR.test(line) || !dimsSomething(line)) return;
        if (EXEMPT.some((e) => line.includes(e.match))) return;
        lines.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
  }
  return lines;
};

describe('text is de-emphasised with colour, not opacity', () => {
  it('dims no text anywhere outside the three documented exceptions', () => {
    expect(
      offenders(),
      'DesignSpec §2 rule 3: opacity composites text towards its background ' +
        'rather than scaling the ratio, so a dimmed label fails contrast at a ' +
        'value that looks harmless — `slate-500` reads 4.81:1 undimmed, 3.91:1 ' +
        'under `opacity-90` and 2.66:1 under `opacity-70`. Use a darker tone and ' +
        'its `dark:` partner instead. If the site genuinely should not be read ' +
        '(disabled, aria-hidden, deliberately blurred), add it to EXEMPT above ' +
        'with the reason.'
    ).toEqual([]);
  });

  /**
   * An exemption nobody can find is an exemption nobody has re-read. If the
   * code it points at is edited or deleted, this says so rather than letting
   * the list rot into a set of strings that exempt nothing.
   */
  it('keeps every exemption pointing at code that still exists', () => {
    const all = [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'utils'))]
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(EXEMPT.filter((e) => !all.includes(e.match)).map((e) => e.match)).toEqual([]);
  });
});
