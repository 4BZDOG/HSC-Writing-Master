/**
 * Generates projectDocs/commandVerbs.md from data/commandTerms.ts.
 *
 * Run:  npx tsx scripts/generate-command-verbs-doc.ts
 *
 * This keeps the documentation in sync with the source of truth — if a verb's
 * definition or tip changes, re-running the script updates the doc.
 */
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { commandTermsList, TIER_GROUPS } from '../data/commandTerms';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tierByNumber = new Map(TIER_GROUPS.map((g) => [g.tier, g]));

const grouped = new Map<number, typeof commandTermsList>();
for (const verb of commandTermsList) {
  const list = grouped.get(verb.tier) || [];
  list.push(verb);
  grouped.set(verb.tier, list);
}

const lines: string[] = [];

lines.push('# HSC Command Verbs Reference');
lines.push('');
lines.push(
  'All NESA command verbs used in the HSC Writing Coach, ordered by band. Each verb entry shows the **ribbon text** displayed in the prompt header and the **strategy tip** shown in the writing area.'
);
lines.push('');
lines.push('> This file is auto-generated from `data/commandTerms.ts`.');
lines.push('> Run `npx tsx scripts/generate-command-verbs-doc.ts` to regenerate.');
lines.push('');
lines.push('---');

for (let band = 1; band <= 6; band++) {
  const tier = tierByNumber.get(band);
  const verbs = grouped.get(band) || [];
  if (verbs.length === 0) continue;

  lines.push('');
  lines.push(`## Band ${band} — ${tier?.title ?? `Tier ${band}`}`);
  lines.push('');
  if (tier) lines.push(`> ${tier.subtitle}`);
  lines.push('');
  lines.push('---');

  for (const verb of verbs) {
    const tipLines = verb.tip
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');

    lines.push('');
    lines.push(`### ${verb.term}`);
    lines.push('');
    lines.push('**Ribbon**');
    lines.push('');
    lines.push(`> **${verb.term}**`);
    lines.push(`> Band ${band}`);
    lines.push(`> ${verb.definition}`);
    lines.push('>');
    lines.push(tipLines);
    lines.push('>');
    lines.push(
      `> Marks: ${verb.markRange[0]}–${verb.markRange[1]} | Band Cap: ${band} | Time: ${verb.timeRange[0]}–${verb.timeRange[1]}m | Terms: ${verb.syllabusTerms[0]}–${verb.syllabusTerms[1]}`
    );
    lines.push('');
    lines.push('**Strategy Tip**');
    lines.push('');
    lines.push(`> **${verb.term} Strategy**`);
    lines.push(`> ${verb.definition}`);
    lines.push(tipLines);
    lines.push('');
    lines.push('---');
  }
}

const outPath = resolve(__dirname, '..', 'projectDocs', 'commandVerbs.md');
writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');

const count = commandTermsList.length;
console.log(`Generated ${outPath} with ${count} command verbs.`);
