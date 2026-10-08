import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { commandTermsList } from '../../data/commandTerms';

/**
 * The prose authoring prompt lists every command verb with its tier and typical
 * marks. That list is copied into briefs for external models, which then write
 * marking guides on the ladder for the tier the document names. The document
 * once placed ASSESS, EXPLAIN, COMPARE and others in tiers the app does not use,
 * so guides written from it failed the app's own ladder check. This keeps the
 * document tied to `commandTermsList`.
 */
describe('docs/dataset-generation-prompt.md verb list', () => {
  const doc = fs.readFileSync(
    path.resolve(__dirname, '../../docs/dataset-generation-prompt.md'),
    'utf8'
  );
  const listed = new Map<string, { tier: number; lo: number; hi: number }>();
  for (const line of doc.split('\n')) {
    const m = line.match(/^- Tier (\d) \([a-z]+\): (.+)$/);
    if (!m) continue;
    for (const item of m[2].split(', ')) {
      const t = item.match(/^([A-Z ]+?) (\d+)-(\d+)$/);
      if (t) listed.set(t[1], { tier: Number(m[1]), lo: Number(t[2]), hi: Number(t[3]) });
    }
  }

  it('lists every command term once, in the tier and mark range the app uses', () => {
    expect(listed.size).toBe(commandTermsList.length);
    for (const term of commandTermsList) {
      const entry = listed.get(term.term);
      expect(entry, `${term.term} missing from the document`).toBeDefined();
      expect(entry).toEqual({ tier: term.tier, lo: term.markRange[0], hi: term.markRange[1] });
    }
  });
});
