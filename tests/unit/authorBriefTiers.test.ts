import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { commandTermsList } from '../../data/commandTerms';

/**
 * The authoring brief that course-data agents read prints the canonical verbs
 * with their tier and typical marks. That line was written by hand and drifted
 * from data/commandTerms.ts (EXPLAIN printed as tier 4, APPLY as tier 3, ASSESS
 * as tier 6, and so on), so an agent could be told a verb sits in a tier the app
 * does not give it. These tests parse the line and hold it to the code.
 */

const BRIEF = join(process.cwd(), '.claude/skills/build-course-data/author_brief.md');

interface BriefVerb {
  tier: number;
  verb: string;
  min: number;
  max: number;
}

/** The "Canonical verbs" line, parsed. Format: `Tier1 VERB 1-2, VERB 2-4; Tier2 ...`. */
const parseCanonicalVerbs = (markdown: string): BriefVerb[] => {
  const match = markdown.match(
    /^- Canonical verbs \(UPPERCASE; typical marks\): (.*?)\. The verb must/m
  );
  if (!match) throw new Error('author_brief.md has no "Canonical verbs" line in the expected form');
  return match[1].split('; ').flatMap((group) => {
    const tierMatch = group.match(/^Tier(\d+) (.*)$/);
    if (!tierMatch) throw new Error(`Not a tier group: "${group}"`);
    const tier = Number(tierMatch[1]);
    return tierMatch[2].split(', ').map((entry) => {
      // "COMPOSE (English writing only) 5-20" keeps its note out of the verb name.
      const entryMatch = entry.match(/^(.+?)(?: \([^)]*\))? (\d+)-(\d+)$/);
      if (!entryMatch) throw new Error(`Not a verb with marks: "${entry}"`);
      return {
        tier,
        verb: entryMatch[1],
        min: Number(entryMatch[2]),
        max: Number(entryMatch[3]),
      };
    });
  });
};

const briefVerbs = parseCanonicalVerbs(readFileSync(BRIEF, 'utf8'));
const codeVerbs = new Map(commandTermsList.map((term) => [term.term as string, term]));

describe('author_brief.md canonical verbs', () => {
  it('names every canonical verb the code defines, once each', () => {
    const names = briefVerbs.map((v) => v.verb);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...codeVerbs.keys()].sort());
  });

  it('gives each verb the tier that data/commandTerms.ts gives it', () => {
    const mismatches = briefVerbs
      .filter((v) => codeVerbs.get(v.verb)?.tier !== v.tier)
      .map((v) => `${v.verb}: brief Tier${v.tier}, code Tier${codeVerbs.get(v.verb)?.tier}`);
    expect(mismatches).toEqual([]);
  });

  it('gives each verb the typical marks that data/commandTerms.ts gives it', () => {
    const mismatches = briefVerbs
      .filter((v) => {
        const code = codeVerbs.get(v.verb);
        return !code || code.markRange[0] !== v.min || code.markRange[1] !== v.max;
      })
      .map((v) => {
        const code = codeVerbs.get(v.verb);
        return `${v.verb}: brief ${v.min}-${v.max}, code ${code?.markRange.join('-')}`;
      });
    expect(mismatches).toEqual([]);
  });
});
