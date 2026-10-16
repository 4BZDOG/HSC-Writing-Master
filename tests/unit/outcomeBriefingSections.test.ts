import { describe, it, expect } from 'vitest';
import { parseOutcomeBriefing } from '../../utils/outcomeBriefing';
import { parseGenericMarkRow } from '../../utils/genericMarkRows';

const BRIEFING = `### What this outcome is asking for
You are asked to show that you can use the outcome's own vocabulary.

### What a marker looks for here
- A direct answer to each part of the question.
- Evidence drawn from the scenario.

### How to show it in your answer
- Open by naming the thing being asked about.`;

describe('parseOutcomeBriefing', () => {
  it('splits the briefing at each of its headings, in order', () => {
    const parsed = parseOutcomeBriefing(BRIEFING);
    expect(parsed.lead).toBe('');
    expect(parsed.sections.map((s) => s.heading)).toEqual([
      'What this outcome is asking for',
      'What a marker looks for here',
      'How to show it in your answer',
    ]);
    expect(parsed.sections[1].body).toBe(
      '- A direct answer to each part of the question.\n- Evidence drawn from the scenario.'
    );
  });

  it('keeps anything before the first heading as the lead, and does not drop it', () => {
    const parsed = parseOutcomeBriefing(`Here is the briefing.\n\n${BRIEFING}`);
    expect(parsed.lead).toBe('Here is the briefing.');
    expect(parsed.sections).toHaveLength(3);
  });

  it('keeps a briefing with no headings whole, as the lead', () => {
    const plain = 'You need a direct answer.\nThen the evidence.';
    expect(parseOutcomeBriefing(plain)).toEqual({ lead: plain, sections: [] });
  });

  it('strips bold and a trailing colour from a heading the model decorated', () => {
    const parsed = parseOutcomeBriefing('### **How to show it:**\nOpen with the term.');
    expect(parsed.sections).toEqual([{ heading: 'How to show it', body: 'Open with the term.' }]);
  });

  it('returns an empty briefing for empty text', () => {
    expect(parseOutcomeBriefing('')).toEqual({ lead: '', sections: [] });
  });
});

describe('parseGenericMarkRow', () => {
  it('reads a range, a single mark and an open-ended figure', () => {
    expect(parseGenericMarkRow('2-3 marks: Accurately recounts the key events')).toEqual({
      marks: '2–3',
      criterion: 'Accurately recounts the key events',
    });
    expect(parseGenericMarkRow('1 mark: Lists some of the events')).toEqual({
      marks: '1',
      criterion: 'Lists some of the events',
    });
    expect(parseGenericMarkRow('4+ marks: Identifies similarities and differences')).toEqual({
      marks: '4+',
      criterion: 'Identifies similarities and differences',
    });
  });

  it('sets a range written with an en dash the same way', () => {
    expect(parseGenericMarkRow('3–4 marks: Explains the link')?.marks).toBe('3–4');
  });

  it('returns null for a line that is not written as a mark row', () => {
    expect(parseGenericMarkRow('Use a point-by-point structure')).toBeNull();
    expect(parseGenericMarkRow('3 marks:')).toBeNull();
  });
});
