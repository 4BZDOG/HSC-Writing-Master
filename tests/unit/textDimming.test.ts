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

/** A real opacity utility — `opacity-0` and `opacity-100` are on/off rather
 *  than dimming, and the arbitrary form is caught by the bracket. */
const OPACITY = /(?:^|[\s'"`{])opacity-(?:[1-9]0|[1-9]5|\[)/;

/**
 * Sites carrying both, as of the pass that added this test. Every one is
 * unmeasured — no e2e state reaches it — which is exactly why none was deleted
 * on sight.
 */
const KNOWN: Record<string, number> = {
  'components/AiErrorNotice.tsx': 1,
  'components/ManifestImportModal.tsx': 1,
  'components/MarkingCriteriaAccordion.tsx': 1,
  'components/OutcomeDetailModal.tsx': 1,
  'components/PromptGeneratorModal.tsx': 2,
  'components/ReferenceMaterials.tsx': 1,
  'components/SelectionTree.tsx': 1,
  'components/SyllabusImportModal.tsx': 1,
  'components/WorkspaceRightPanel.tsx': 1,
  'components/admin/DatabaseDashboard.tsx': 1,
};

const ROOT = resolve(__dirname, '../..');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full);
  }
  return out;
};

const offenders = (): { counts: Record<string, number>; lines: string[] } => {
  const counts: Record<string, number> = {};
  const lines: string[] = [];
  for (const file of [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'utils'))]) {
    const rel = relative(ROOT, file);
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // Prose about the rule is not a breach of it — this file and the
        // comments that explain past fixes both quote the class names.
        const trimmed = line.trimStart();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
        if (!TEXT_COLOUR.test(line) || !OPACITY.test(line)) return;
        counts[rel] = (counts[rel] ?? 0) + 1;
        lines.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
  }
  return { counts, lines };
};

describe('text is de-emphasised with colour, not opacity', () => {
  it('adds no new site where an opacity utility sits on coloured text', () => {
    const { counts, lines } = offenders();

    const added = Object.keys(counts).filter((f) => (counts[f] ?? 0) > (KNOWN[f] ?? 0));
    const removed = Object.keys(KNOWN).filter((f) => (counts[f] ?? 0) < KNOWN[f]);

    expect(
      added,
      'New text-dimming sites. DesignSpec §2 rule 3: opacity composites text ' +
        'towards its background rather than scaling the ratio, so a dimmed ' +
        'label fails contrast at a value that looks harmless. Use a darker ' +
        'tone (and its dark: partner) instead.\n' +
        lines.filter((l) => added.some((f) => l.startsWith(f))).join('\n')
    ).toEqual([]);

    expect(
      removed,
      'Sites were fixed — thank you. Lower their counts in KNOWN so the ' +
        'ratchet holds at the new level:\n' +
        removed.map((f) => `  '${f}': ${counts[f] ?? 0},`).join('\n')
    ).toEqual([]);
  });

  /**
   * The shared class vocabularies are held to the stronger form. Nothing in
   * them dims text today, and they are where a single value reaches dozens of
   * call sites at once — the verb ribbon's `opacity-90` was one constant and
   * 32 buttons' worth of text.
   */
  it('keeps the shared chrome vocabularies clean outright', () => {
    const { lines } = offenders();
    expect(lines.filter((l) => l.startsWith('utils/'))).toEqual([]);
  });
});
