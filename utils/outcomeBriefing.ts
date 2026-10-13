/**
 * The outcome briefing, split at its own "### Heading" lines.
 *
 * `explainOutcomeInContext` asks for three headed sections, and the brief sets
 * each one as a block of its own, so a student can find "How to show it" without
 * reading back through the other two. The model does not always comply, so text
 * before the first heading, or text with no headings at all, is kept whole as
 * `lead` rather than being dropped or guessed at.
 */
export interface BriefingSection {
  heading: string;
  body: string;
}

export interface ParsedBriefing {
  lead: string;
  sections: BriefingSection[];
}

const HEADING_LINE = /^\s*#{1,4}\s+(.+?)\s*$/;

export const parseOutcomeBriefing = (text: string): ParsedBriefing => {
  const lead: string[] = [];
  const sections: BriefingSection[] = [];
  let current: { heading: string; body: string[] } | null = null;

  for (const line of text.split('\n')) {
    const heading = line.match(HEADING_LINE);
    if (heading) {
      if (current)
        sections.push({ heading: current.heading, body: current.body.join('\n').trim() });
      // Models sometimes bold a heading or end it with a colon; the block's own
      // heading is set in bold already, so neither survives into it.
      current = { heading: heading[1].replace(/\*\*/g, '').replace(/:$/, '').trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      lead.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() });

  return { lead: lead.join('\n').trim(), sections };
};
