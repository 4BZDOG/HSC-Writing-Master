import { z } from 'zod';
import {
  Course,
  Topic,
  SubTopic,
  DotPoint,
  Prompt,
  PromptVerb,
  SampleAnswer,
  CourseOutcome,
  DataValidationResult,
} from '../types';
import { yearOfOutcome, yearOfTopic } from './syllabusYear';
import {
  commandTerms,
  getCommandTermsForMarks,
  getBandForMark,
  getCommandTermInfo,
  extractCommandVerb,
} from '../data/commandTerms';
import { generateId } from './idUtils';

// Deep clone via structuredClone, falling back to a JSON round-trip only if the
// value is not structured-cloneable. (Previously this recursed into itself,
// stack-overflowed on every call, and silently used the JSON path every time.)
export const safeClone = <T>(obj: T): T => {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
};

// --- Helpers ---

/**
 * The lead-ins a syllabus author uses to introduce a list of focus areas.
 * Shared by the item parser and the stem splitter so both agree on where the
 * dot point stops being a statement and starts being a list.
 */
const LIST_LEAD_IN =
  /\b(?:incl(?:uding|udes)|such\s+as|for\s+example|e\.g\.|i\.e\.|namely)\s*:?\s*/i;

/** A line that a syllabus author has written as a bullet: "* x", "- x", "1. x". */
const BULLET_LINE = /^\s*(?:[*\-–—•·]|\(?\d+[.)]|\(?[a-z][.)])\s+/;

/** Leading bullet/number markers stripped from a bullet line's text. */
const stripBulletMarker = (line: string): string => line.replace(BULLET_LINE, '').trim();

/**
 * Focus areas written as their own lines rather than as inline prose.
 *
 * Imported and AI-parsed syllabus text routinely arrives as a stem followed by
 * "Including:" and a bulleted list — the shape NESA prints. Run through the
 * inline heuristics below, `[^.]+` swallowed the whole block and returned it as
 * ONE focus area ("* biophysical * economic * technological …"), which is worse
 * than finding nothing: it put an unusable option in the Active Focus menu.
 */
const parseBulletedSubItems = (description: string): string[] => {
  const lines = description.split(/\r?\n/);
  if (lines.length < 2) return [];

  const bulletItems = lines.filter((line) => BULLET_LINE.test(line)).map(stripBulletMarker);
  if (bulletItems.length >= 2) return bulletItems.filter((item) => item.length > 1);

  // No bullet glyphs, but a bare "Including:" line still marks everything after
  // it as the list — one item per line.
  const leadInIndex = lines.findIndex((line) => /^\s*(?:including|includes)\s*:?\s*$/i.test(line));
  if (leadInIndex === -1) return [];
  return lines
    .slice(leadInIndex + 1)
    .map((line) => stripBulletMarker(line).replace(/[.;,]$/, ''))
    .filter((line) => line.length > 1);
};

/**
 * Heuristic engine to extract sub-items (examples) from NESA syllabus descriptions.
 * Detects patterns like "including X, Y and Z", "including: A; B; C", or "(A, B, C)".
 */
export const parseSubItemsFromDescription = (description: string): string[] => {
  if (!description) return [];

  // A list the author already broke into lines needs no guessing — take it as
  // written before the prose heuristics get a chance to mangle it.
  const bulleted = parseBulletedSubItems(description);
  if (bulleted.length > 0) return Array.from(new Set(bulleted));

  // Normalise string: remove extra spaces and standardise punctuation
  const cleanDesc = description.replace(/\s+/g, ' ').trim();

  let items: string[] = [];

  // Pattern 1: Keywords like "including", "includes", "such as", "e.g."
  // We look for everything after these keywords until the next major stop (period, semicolon if outside the list)
  const listPatterns = [
    /\bincl(?:uding|udes):?\s+([^.]+)/i,
    /\bsuch\s+as:?\s+([^.]+)/i,
    /\bfor\s+example:?\s+([^.]+)/i,
    /\be\.g\.?\s+([^.]+)/i,
    /\bnamely:?\s+([^.]+)/i,
  ];

  listPatterns.forEach((pattern) => {
    const match = cleanDesc.match(pattern);
    if (match && match[1]) {
      const listPart = match[1];
      const splitItems = listPart
        .split(/,|;|\band\b/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);
      items = [...items, ...splitItems];
    }
  });

  // Pattern 2: Content inside brackets
  const bracketMatch = cleanDesc.match(/\(([^)]+)\)/);
  if (bracketMatch && bracketMatch[1]) {
    const bracketContents = bracketMatch[1]
      .split(/,|;|\band\b/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    items = [...items, ...bracketContents];
  }

  // Deduplicate and clean common artifacts
  const uniqueItems = Array.from(
    new Set(
      items.map((item) =>
        item
          .replace(/^(e\.g\.|including|such as|includes)\s+/i, '')
          .replace(/[.:]$/, '')
          .trim()
      )
    )
  );

  // Final filter: remove common non-content words
  return uniqueItems.filter((item) => {
    const lower = item.toLowerCase();
    return !['etc', 'etc.', 'and', 'or'].includes(lower) && item.length > 1;
  });
};

/**
 * Turns a markdown table into "N marks: description" rows.
 *
 * Models asked for a descending rubric sometimes answer with a table instead.
 * Left as pipes, every row failed the accordion's row match and the whole guide
 * collapsed into one undifferentiated block, so unwrap the cells here: the first
 * cell carries the mark (or band) label, the rest are the criteria.
 */
const unwrapMarkdownTableRows = (text: string): string => {
  if (!text.includes('|')) return text;
  return text
    .split('\n')
    .map((line): string | null => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) return line;
      // Separator row (|---|:--:|) carries no criteria.
      if (/^\|[\s|:\-–—]+\|?$/.test(trimmed)) return null;
      const cells = trimmed
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length < 2) return line;
      const [label, ...rest] = cells;
      // A header row ("| Marks | Criteria |") has no mark value to anchor to.
      if (!/\d/.test(label)) return null;
      return `${label}: ${rest.join(' — ')}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
};

/**
 * The focus areas for a dot point: the teacher's hand-set list when there is
 * one, otherwise whatever the heuristic can find in the description.
 *
 * Every surface that offers focus areas — the navigator's "Active Focus", the
 * question generator, the keyword grounding sent to the AI — must agree on this
 * one answer, or a teacher fixes a bad parse in the navigator and the generator
 * carries on using the bad one.
 */
export const getFocusAreas = (dotPoint?: {
  description?: string;
  focusAreas?: string[];
}): string[] => {
  if (!dotPoint) return [];
  if (dotPoint.focusAreas) return dotPoint.focusAreas;
  return parseSubItemsFromDescription(dotPoint.description || '');
};

/**
 * A dot point's statement, with the "including …" list it carries removed.
 *
 * A NESA dot point is a statement followed by the focus areas that narrow it:
 *
 *     Influences on the global economic activity
 *     Including:
 *       * biophysical
 *       * economic
 *
 * The whole block used to be the dot point's label in the navigator, WHILE the
 * same items were also offered in the Active Focus menu beside it — the list
 * read twice, once as an unscannable wall and once as the control that actually
 * does something. This returns the statement alone for display; the description
 * itself is untouched, so the focus-area parser, the question generator and the
 * AI's grounding still see the full wording.
 *
 * The trailing list is dropped only when doing so leaves a statement worth
 * reading and takes away at least two items — a dot point that ends
 * "…, including unit conversions" says something the label would lose.
 */
export const splitDotPointDescription = (
  description?: string
): { stem: string; items: string[] } => {
  const full = (description || '').trim();
  const items = parseSubItemsFromDescription(full);
  const fallback = { stem: full, items };
  if (items.length < 2) return fallback;

  // Where the list begins: the author's own line break wins over the inline
  // lead-in, since a bulleted block can restate "Including:" on its own line.
  const lines = full.split(/\r?\n/);
  const firstListLine = lines.findIndex(
    (line, i) =>
      i > 0 && (BULLET_LINE.test(line) || /^\s*(?:including|includes)\s*:?\s*$/i.test(line))
  );

  let stem: string;
  if (firstListLine > 0) {
    stem = lines.slice(0, firstListLine).join(' ');
  } else {
    const match = LIST_LEAD_IN.exec(full);
    // Only a TRAILING list is furniture. A lead-in mid-sentence is part of the
    // statement, and cutting there would leave a fragment.
    if (!match || match.index === 0) return fallback;
    stem = full.slice(0, match.index);
  }

  // Bracketed lists sit inside the sentence: "…information (including graphs,
  // keys, …)" — drop the whole bracket rather than leaving a dangling "(".
  stem = stem.replace(/[([]\s*$/, '');
  stem = stem
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:—–-]+$/, '')
    .trim();

  // Too little left to name the dot point by — keep the original wording.
  if (stem.split(/\s+/).filter(Boolean).length < 3) return fallback;
  return { stem, items };
};

/**
 * How a dot point should be LABELLED in the UI (navigator, breadcrumbs).
 * Never use this where the full syllabus wording is meant — AI grounding, the
 * rename dialog, or anything written back to the syllabus.
 */
export const getDotPointLabel = (dotPoint?: { description?: string }): string =>
  splitDotPointDescription(dotPoint?.description).stem;

export const formatMarkingCriteria = (criteria: unknown): string => {
  if (!criteria) return '';
  if (typeof criteria !== 'string') {
    try {
      return JSON.stringify(criteria, null, 2);
    } catch {
      return String(criteria);
    }
  }

  let text = criteria.trim();

  // Fenced code blocks: models wrap "structured" output in ``` more often than
  // not, and the fences are the first thing that stops a row from matching.
  text = text.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '');

  // A model shown an escaped newline in its instructions echoes the two literal
  // characters back rather than breaking the line. That single physical line is
  // the "one giant marking guide" a teacher sees instead of the descending
  // ladder — so restore the breaks the rubric was meant to have.
  //
  // Only when there is not a single real line break: that is the failure
  // signature, and this is a computing app, where "uses \n to terminate the
  // line" is a criterion someone will legitimately write inside an otherwise
  // well-formed rubric.
  if (!text.includes('\n') && text.includes('\\n')) {
    text = text.replace(/\\r\\n|\\n/g, '\n');
  }

  if (text.includes('<') && text.includes('>')) {
    text = text
      .replace(new RegExp('</li>', 'gi'), '\n')
      .replace(new RegExp('</p>', 'gi'), '\n')
      .replace(new RegExp('</div>', 'gi'), '\n')
      .replace(new RegExp('<br\\s*/?>', 'gi'), '\n')
      .replace(new RegExp('</tr>', 'gi'), '\n');

    text = text.replace(new RegExp('<[^>]+>', 'g'), '');

    text = text
      .replace(new RegExp('&nbsp;', 'g'), ' ')
      .replace(new RegExp('&amp;', 'g'), '&')
      .replace(new RegExp('&lt;', 'g'), '<')
      .replace(new RegExp('&gt;', 'g'), '>')
      .replace(new RegExp('&quot;', 'g'), '"')
      .replace(new RegExp('&#39;', 'g'), "'");

    text = text.replace(new RegExp('\\n\\s*\\n', 'g'), '\n').trim();
  }

  text = unwrapMarkdownTableRows(text);

  text = text.replace(new RegExp('^([\\s]*[-•*])\\s*\\n\\s*(\\d)', 'gm'), '$1 $2');
  text = text.replace(
    new RegExp('^([\\s]*[-•*]?\\s*\\d+(?:\\s*[-–]\\s*\\d+)?)\\s*\\n\\s*(marks?|:)', 'gim'),
    '$1 $2'
  );
  text = text.replace(new RegExp('(\\d+)\\s*[-–]\\s*\\n\\s*(\\d+\\s*marks?:)', 'gi'), '$1-$2');

  // "Band 5 (6-7 marks): …" leads with the band, so the mark value never lands
  // at the start of the line where the row matcher looks for it. The mark range
  // is the anchor everything else (band colour, ordering) is derived from, so
  // promote it and keep the band label inside the description.
  text = text.replace(
    /^([\s]*[-•*]?\s*)band\s+(\d+)\s*\(\s*(\d+(?:\s*[-–]\s*\d+)?)\s*marks?\s*\)\s*[:.\-–]?\s*/gim,
    '$1$3 marks: (Band $2) '
  );

  // A rubric that arrived as one paragraph — "8 marks: … judgement. 6-7 marks: …"
  // — is a valid ladder with its line breaks stripped. Restore a break before
  // each row, but only after sentence-ending punctuation so a mark value quoted
  // mid-sentence isn't mistaken for a new row.
  text = text.replace(
    /([.;!?])[ \t]+(?=(?:\*\*)?\d+(?:\s*[-–]\s*\d+)?\s*(?:marks?\s*[:—-]|:)\s)/gi,
    '$1\n'
  );

  text = text.replace(new RegExp('^[•·*]\\s*', 'gm'), '- ');

  // Blank lines between rows are harmless to render but make the ladder look
  // sparse and inflate the stored text; collapse runs of them.
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
};

const normalizeVerb = (val: unknown): PromptVerb | undefined => {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  if (commandTerms.has(trimmed as PromptVerb)) return trimmed as PromptVerb;
  const upper = trimmed.toUpperCase();
  if (commandTerms.has(upper as PromptVerb)) return upper as PromptVerb;
  // Composite or decorated verbs ("Critically analyse", "Evaluate:") — find a
  // known verb inside the string rather than dropping it entirely.
  return extractCommandVerb(trimmed)?.term;
};

/**
 * Final integrity pass over one parsed prompt. Every colour, band ceiling and
 * marking surface derives from `verb` + `totalMarks`, and the surfaces fall
 * back DIFFERENTLY when these are missing (the navigator re-extracts a verb
 * from the question text while the prompt/editor default to EXPLAIN), which is
 * how imported questions ended up two different colours at once. Canonicalise
 * once here so every surface reads identical data.
 */
const repairPromptFields = <T extends { verb?: PromptVerb; question: string; totalMarks?: number }>(
  prompt: T
): T & { verb: PromptVerb; totalMarks: number } => {
  const verb =
    normalizeVerb(prompt.verb) ??
    extractCommandVerb(prompt.question)?.term ??
    ('EXPLAIN' as PromptVerb);
  const termInfo = getCommandTermInfo(verb);
  const totalMarks =
    typeof prompt.totalMarks === 'number' &&
    Number.isFinite(prompt.totalMarks) &&
    prompt.totalMarks >= 1
      ? Math.round(prompt.totalMarks)
      : termInfo.markRange[0];
  if (verb === prompt.verb && totalMarks === prompt.totalMarks) {
    return prompt as T & { verb: PromptVerb; totalMarks: number };
  }
  return { ...prompt, verb, totalMarks };
};

/**
 * Deduplicates sample answers based on text content.
 * If multiple answers have the same text, the one with the lowest mark is kept.
 */
/**
 * A verified past-HSC exemplar. `evaluateAnswer` anchors its marking on these
 * and falls back to AI-written samples only when there are none — precisely
 * because marking against AI-marked samples compounds the AI's own error. They
 * are therefore the one thing in a prompt that must never be thrown away to
 * make room for something the AI wrote.
 */
const isVerifiedExemplar = (answer: SampleAnswer) => answer.source === 'HSC_EXEMPLAR';

/** How many sample answers are kept per mark value before pruning starts. */
const MAX_SAMPLES_PER_MARK = 5;

export const deduplicateSampleAnswers = (answers: SampleAnswer[]): SampleAnswer[] => {
  if (!answers || answers.length <= 1) return answers;

  const seen = new Map<string, SampleAnswer>();

  // Using a map to track unique texts.
  // If we encounter a duplicate text, we only update if the new mark is lower —
  // EXCEPT that a verified exemplar always outranks one that is not. The same
  // text saved as a marked HSC exemplar and as an AI sample used to resolve to
  // whichever carried the lower mark, which silently discarded the exemplar
  // and with it the marking anchor.
  answers.forEach((answer) => {
    const textKey = answer.answer.trim();
    const existing = seen.get(textKey);

    if (!existing) {
      seen.set(textKey, answer);
      return;
    }
    if (isVerifiedExemplar(existing) !== isVerifiedExemplar(answer)) {
      if (isVerifiedExemplar(answer)) seen.set(textKey, answer);
      return;
    }
    if (answer.mark < existing.mark) seen.set(textKey, answer);
  });

  return Array.from(seen.values());
};

/**
 * Intelligent management of sample answers.
 * Rules:
 * 1. Automatic duplicate removal (keeps lower mark version if text is identical).
 * 2. Max 5 answers per Mark/Band group.
 * 3. Preference for Newest answers (LIFO).
 * 4. Preference for diversity (keep at least one Human and one AI if possible).
 */
export const addAndPruneSampleAnswers = (
  existingAnswers: SampleAnswer[],
  newAnswer: SampleAnswer
): SampleAnswer[] => {
  // 1. Combine and Deduplicate (keeping lower mark if text matches across ANY mark level)
  const allAnswers = deduplicateSampleAnswers([...existingAnswers, newAnswer]);

  // 2. Group by mark to apply per-mark-band pruning rules
  const grouped = new Map<number, SampleAnswer[]>();
  allAnswers.forEach((a) => {
    if (!grouped.has(a.mark)) grouped.set(a.mark, []);
    grouped.get(a.mark)!.push(a);
  });

  // 3. Flatten and apply pruning where groups > 5
  const result: SampleAnswer[] = [];
  grouped.forEach((answersForMark) => {
    if (answersForMark.length <= MAX_SAMPLES_PER_MARK) {
      result.push(...answersForMark);
    } else {
      // Pruning Algorithm:
      // a. Verified HSC exemplars are never pruned. They are the marking
      //    anchor, they cannot be regenerated, and there are rarely more than
      //    one or two — so they take their slots before anything else, and if
      //    they alone exceed the cap they all survive it. Without this, adding
      //    a sixth AI sample deleted a real past-paper exemplar to make room.
      const kept: SampleAnswer[] = answersForMark.filter(isVerifiedExemplar);

      // Reverse so we treat the end of the array as newest. With no exemplars
      // present this is exactly the original algorithm.
      const newestFirst = [...answersForMark.filter((a) => !isVerifiedExemplar(a))].reverse();

      if (newestFirst.length > 0) {
        // b. Always keep the absolute newest
        if (kept.length < MAX_SAMPLES_PER_MARK) kept.push(newestFirst[0]);

        // c. Find a "diversity candidate" (opposite source) if available
        const primarySource = newestFirst[0].source;
        const diversityCandidate = newestFirst.find(
          (a) =>
            a !== newestFirst[0] && (primarySource === 'AI' ? a.source !== 'AI' : a.source === 'AI')
        );
        if (diversityCandidate && kept.length < MAX_SAMPLES_PER_MARK) {
          kept.push(diversityCandidate);
        }

        // d. Fill the rest of the slots with the next newest available
        for (const item of newestFirst) {
          if (kept.length >= MAX_SAMPLES_PER_MARK) break;
          if (!kept.includes(item)) {
            kept.push(item);
          }
        }
      }
      result.push(...kept);
    }
  });

  return result;
};

// --- Zod Schemas ---

/** User-raised "content looks off" report; see ContentFlag in types.ts. */
const ContentFlagSchema = z
  .object({
    reason: z.string().catch('').default(''),
    flaggedAt: z.number().catch(0).default(0),
    flaggedBy: z.string().optional(),
    status: z.enum(['open', 'resolved']).catch('open').default('open'),
  })
  .passthrough();

const SampleAnswerSchema = z
  .object({
    id: z.string().default(() => generateId('sa')),
    band: z.union([z.string(), z.number()]).transform((val) => Number(val) || 1),
    answer: z.string().catch('No answer provided.').default('No answer provided.'),
    mark: z.union([z.string(), z.number()]).transform((val) => Number(val) || 0),
    source: z.enum(['AI', 'USER', 'HSC_EXEMPLAR']).catch('AI').default('AI'),
    derivedFromStudent: z.boolean().optional().catch(undefined),
    feedback: z.string().optional(),
    quickTip: z.string().optional(),
    contentFlag: ContentFlagSchema.optional(),
  })
  .passthrough();

const PromptSchema = z
  .object({
    id: z.string().default(() => generateId('prompt')),
    question: z.string().catch('Untitled Question').default('Untitled Question'),
    // Optional, despite being required on the Prompt type. A question with no
    // mark value used to fail validation, and because the whole file is parsed
    // as one array, ONE such question rejected the entire import with "Invalid
    // course list format" — a real problem for hand-written and LLM-authored
    // files. `repairPromptFields` below exists precisely to fill this in from
    // the verb's mark range, so let it.
    totalMarks: z
      .union([z.string(), z.number()])
      .optional()
      .transform((val) => Number(val) || 0),
    verb: z.unknown().transform(normalizeVerb),
    highlightedQuestion: z.string().optional(),
    scenario: z.string().optional().default(''),
    scenarioImage: z
      .object({
        id: z.string(),
        alt: z.string().optional(),
        updatedAt: z.number(),
        storagePath: z.string().optional(),
      })
      .optional(),
    linkedOutcomes: z.array(z.string()).default([]),
    estimatedTime: z.string().optional(),
    relatedTopics: z.array(z.string()).default([]),
    prerequisiteKnowledge: z.array(z.string()).default([]),
    markerNotes: z.array(z.string()).default([]),
    commonStudentErrors: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    markingCriteria: z.unknown().transform(formatMarkingCriteria),
    targetPerformanceBands: z.array(z.number()).default([]),
    sampleAnswers: z.array(SampleAnswerSchema).default([]),
    isPastHSC: z.boolean().optional().default(false),
    hscYear: z.number().optional(),
    hscQuestionNumber: z.string().optional(),
    contentFlag: ContentFlagSchema.optional(),
  })
  .passthrough()
  // Canonicalise verb + marks so imported questions colour consistently on
  // every surface (see repairPromptFields).
  .transform(repairPromptFields);

const DotPointSchema = z
  .object({
    id: z.string().default(() => generateId('dp')),
    description: z.string().catch('No description').default('No description'),
    prompts: z.array(PromptSchema).default([]),
    // Optional by design: absent means "derive from the description".
    // `.optional()` before `.catch()` so a malformed value falls back to
    // undefined (derive) rather than to an empty array (no focus areas).
    focusAreas: z.array(z.string()).optional().catch(undefined),
  })
  .passthrough();

const SubTopicSchema = z
  .object({
    id: z.string().default(() => generateId('subTopic')),
    name: z.string().catch('Untitled Sub-Topic').default('Untitled Sub-Topic'),
    dotPoints: z.array(DotPointSchema).default([]),
  })
  .passthrough();

const PerformanceBandDescriptorSchema = z.object({
  band: z.coerce.number(),
  label: z.string(),
  shortLabel: z.string(),
  description: z.string(),
});

// Year 11 or Year 12. Optional, and an unrecognised value falls back to
// undefined rather than failing the import: `yearOfTopic` reads that as Year 12,
// which is what an older export's topics are.
const SyllabusYearSchema = z.enum(['year11', 'year12']).optional().catch(undefined);

const TopicSchema = z
  .object({
    id: z.string().default(() => generateId('topic')),
    name: z.string().catch('Untitled Topic').default('Untitled Topic'),
    subTopics: z.array(SubTopicSchema).default([]),
    performanceBandDescriptors: z.array(PerformanceBandDescriptorSchema).optional(),
    year: SyllabusYearSchema,
  })
  .passthrough();

const CourseOutcomeSchema = z.object({
  code: z.string(),
  description: z.string(),
  year: SyllabusYearSchema,
});

export const CourseSchema = z
  .object({
    id: z.string().default(() => generateId('course')),
    name: z.string().catch('Untitled Course').default('Untitled Course'),
    outcomes: z.array(CourseOutcomeSchema).default([]),
    topics: z.array(TopicSchema).default([]),
    status: z.enum(['draft', 'published']).optional(),
  })
  .passthrough();

export const CoursesArraySchema = z.array(CourseSchema);

export interface TreeItem {
  id: string;
  label: string;
  type: 'course' | 'topic' | 'subTopic' | 'dotPoint';
  children?: TreeItem[];
  parentId?: string;
}

export const buildTree = (courses: Course[]): TreeItem[] => {
  const build = (
    items: any[],
    type: 'course' | 'topic' | 'subTopic' | 'dotPoint',
    parentId?: string
  ): TreeItem[] => {
    if (!items) return [];
    return items.map((item) => {
      const itemType = type;
      const label = item.name || item.description;
      const newId = item.id;

      let children: TreeItem[] = [];
      if (itemType === 'course' && item.topics) {
        children = build(item.topics, 'topic', newId);
      } else if (itemType === 'topic' && item.subTopics) {
        children = build(item.subTopics, 'subTopic', newId);
      } else if (itemType === 'subTopic' && item.dotPoints) {
        children = build(item.dotPoints, 'dotPoint', newId);
      }

      return {
        id: newId,
        label: label,
        type: itemType,
        parentId: parentId,
        children: children,
      };
    });
  };
  return build(courses, 'course');
};

export const filterDataBySelection = (courses: Course[], selectedIds: Set<string>): Course[] => {
  const filterTopics = (topics: Topic[]): Topic[] => {
    if (!topics) return [];
    return topics
      .map((topic) => {
        const filteredSubTopics = (topic.subTopics || [])
          .map((subTopic) => {
            const filteredDotPoints = (subTopic.dotPoints || []).filter((dp) =>
              selectedIds.has(dp.id)
            );

            if (filteredDotPoints.length > 0 || selectedIds.has(subTopic.id)) {
              const finalDotPoints = selectedIds.has(subTopic.id)
                ? subTopic.dotPoints
                : filteredDotPoints;
              return { ...subTopic, dotPoints: finalDotPoints };
            }
            return null;
          })
          .filter((st) => st !== null) as SubTopic[];

        if (filteredSubTopics.length > 0 || selectedIds.has(topic.id)) {
          const finalSubTopics = selectedIds.has(topic.id) ? topic.subTopics : filteredSubTopics;
          return { ...topic, subTopics: finalSubTopics };
        }
        return null;
      })
      .filter((t) => t !== null) as Topic[];
  };

  return courses
    .map((course) => {
      const filteredTopics = filterTopics(course.topics);
      if (filteredTopics.length > 0 || selectedIds.has(course.id)) {
        const finalTopics = selectedIds.has(course.id) ? course.topics : filteredTopics;
        return { ...course, topics: finalTopics };
      }
      return null;
    })
    .filter((c) => c !== null) as Course[];
};

/**
 * One topic, packaged as an exportable `Course[]` — a course containing only
 * that topic, everything under it (sub-topics, dot points, prompts, sample
 * answers, focus areas) intact. The same shape `filterDataBySelection`
 * produces when a single topic id is the whole selection, but callable
 * directly from a `courseId`/`topicId` pair so the Content Audit Studio's
 * per-topic "Export JSON" action doesn't need to build a selection Set.
 * Unknown course/topic id is a no-op: returns `[]`, mirroring
 * `filterDataBySelection`'s "nothing selected" result rather than throwing.
 */
export const buildTopicExportPayload = (
  courses: Course[],
  courseId: string,
  topicId: string
): Course[] => {
  const course = courses.find((c) => c.id === courseId);
  const topic = course?.topics.find((t) => t.id === topicId);
  if (!course || !topic) return [];
  return [{ ...course, topics: [topic] }];
};

export const findConflicts = (importedCourses: Course[], existingCourses: Course[]): Course[] => {
  const existingIds = new Set(existingCourses.map((c) => c.id));
  return importedCourses.filter((c) => existingIds.has(c.id));
};

export const checkForDuplicateIds = (courses: Course[]): string[] => {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  courses.forEach((c) => {
    if (seen.has(c.id)) {
      duplicates.push(c.id);
    }
    seen.add(c.id);
  });

  return duplicates;
};

export const analyzeAndSanitizeImportData = (
  rawData: any
): { type: 'courses' | 'topic' | 'invalid'; data: any; error?: string } => {
  try {
    if (!Array.isArray(rawData) && rawData !== null && typeof rawData === 'object') {
      if (Array.isArray(rawData.data) && (rawData._instructions_for_llm || rawData.instructions)) {
        rawData = rawData.data;
      } else if (Array.isArray(rawData.courses)) {
        rawData = rawData.courses;
      }
    }

    if (Array.isArray(rawData)) {
      const result = CoursesArraySchema.safeParse(rawData);
      if (result.success) {
        let courses = migrateAnalyseVerb(result.data as Course[]);
        courses = validateAndFixCourses(courses);
        courses = recalculateSampleAnswerBands(courses);
        const duplicates = checkForDuplicateIds(courses);
        if (duplicates.length > 0) {
          return {
            type: 'invalid',
            data: null,
            error: `Import file contains duplicate Course IDs.`,
          };
        }
        return { type: 'courses', data: courses };
      }
      return { type: 'invalid', data: null, error: 'Invalid course list format' };
    }

    if (typeof rawData === 'object' && rawData !== null) {
      // A topic is recognised BEFORE a course, not after. Every field of
      // CourseSchema has a default, so a topic file `{ id, name, subTopics }`
      // parsed happily as a course — with `topics: []`. The topic branch below
      // could never be reached, and importing a topic silently produced an
      // empty course: all of its sub-topics, dot points and questions carried
      // along as a stray key that nothing reads. A topic is the shape with
      // `subTopics` and no `topics`.
      if ('subTopics' in rawData && !('topics' in rawData)) {
        const result = TopicSchema.safeParse(rawData);
        if (result.success) {
          const topic = migrateTopicVerbs(result.data as Topic);
          const tempCourse: Course = { id: 'temp', name: 'temp', outcomes: [], topics: [topic] };
          const recalcCourses = recalculateSampleAnswerBands([tempCourse]);
          const fixedCourses = validateAndFixCourses(recalcCourses);
          return { type: 'topic', data: fixedCourses[0].topics[0] };
        }
      }

      const courseResult = CourseSchema.safeParse(rawData);
      if (courseResult.success) {
        let courses = migrateAnalyseVerb([courseResult.data as Course]);
        courses = validateAndFixCourses(courses);
        courses = recalculateSampleAnswerBands(courses);
        return { type: 'courses', data: courses };
      }
    }
    return { type: 'invalid', data: null, error: 'Unsupported data format.' };
  } catch (error) {
    return {
      type: 'invalid',
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error during parsing.',
    };
  }
};

export const recalculateSampleAnswerBands = (courses: Course[]): Course[] => {
  return courses.map((course) => ({
    ...course,
    topics: course.topics.map((topic) => ({
      ...topic,
      subTopics: topic.subTopics.map((subTopic) => ({
        ...subTopic,
        dotPoints: subTopic.dotPoints.map((dotPoint) => ({
          ...dotPoint,
          prompts: dotPoint.prompts.map((prompt) => {
            const termInfo = getCommandTermInfo(prompt.verb);
            const tier = termInfo.tier;
            return {
              ...prompt,
              sampleAnswers:
                prompt.sampleAnswers?.map((sa) => ({
                  ...sa,
                  band: getBandForMark(sa.mark, prompt.totalMarks, tier),
                })) || [],
            };
          }),
        })),
      })),
    })),
  }));
};

export const migrateAnalyseVerb = (courses: Course[]): Course[] => {
  const analyseInfo = commandTerms.get('ANALYSE');
  if (!analyseInfo) return courses;
  const migratedCourses: Course[] = safeClone(courses);
  migratedCourses.forEach((course) => {
    (course.topics || []).forEach((topic) => {
      (topic.subTopics || []).forEach((subTopic) => {
        (subTopic.dotPoints || []).forEach((dotPoint) => {
          (dotPoint.prompts || []).forEach((prompt) => {
            if (prompt.verb === 'ANALYSE' && prompt.totalMarks < analyseInfo.markRange[0]) {
              const { primaryTerm } = getCommandTermsForMarks(prompt.totalMarks);
              if (primaryTerm.term !== 'ANALYSE' && primaryTerm.tier < 4) {
                prompt.verb = primaryTerm.term;
              }
            }
          });
        });
      });
    });
  });
  return migratedCourses;
};

/**
 * Repairs prompts whose verb is missing/unrecognised or whose totalMarks is
 * zero/invalid — the state imported JSON could land in before the import
 * schema canonicalised these fields, and the cause of mismatched tier colours
 * between the navigator and the prompt/writing surfaces. Run once as the
 * v2.3.0 migration; safe to run repeatedly (no-op on healthy data).
 */
export const repairPromptIntegrity = (courses: Course[]): Course[] => {
  return courses.map((course) => ({
    ...course,
    topics: (course.topics || []).map((topic) => ({
      ...topic,
      subTopics: (topic.subTopics || []).map((subTopic) => ({
        ...subTopic,
        dotPoints: (subTopic.dotPoints || []).map((dotPoint) => ({
          ...dotPoint,
          prompts: (dotPoint.prompts || []).map((prompt) => repairPromptFields(prompt)),
        })),
      })),
    })),
  }));
};

export const validateAndFixCourses = (courses: Course[]): Course[] => {
  return courses.map((course) => ({
    ...course,
    topics: course.topics.map((topic) => ({
      ...topic,
      subTopics: topic.subTopics.map((subTopic) => ({
        ...subTopic,
        dotPoints: subTopic.dotPoints.map((dotPoint) => ({
          ...dotPoint,
          prompts: dotPoint.prompts.map((prompt) => {
            let verb = prompt.verb;
            const detected = extractCommandVerb(prompt.question);
            if (detected && detected.term !== verb) {
              verb = detected.term;
            }
            return { ...prompt, verb };
          }),
        })),
      })),
    })),
  }));
};

export const migrateTopicVerbs = (topic: Topic): Topic => {
  const analyseInfo = commandTerms.get('ANALYSE');
  if (!analyseInfo) return topic;
  const newTopic: Topic = safeClone(topic);
  (newTopic.subTopics || []).forEach((subTopic: SubTopic) => {
    (subTopic.dotPoints || []).forEach((dotPoint: DotPoint) => {
      (dotPoint.prompts || []).forEach((prompt: Prompt) => {
        if (prompt.verb === 'ANALYSE' && prompt.totalMarks < analyseInfo.markRange[0]) {
          const { primaryTerm } = getCommandTermsForMarks(prompt.totalMarks);
          if (primaryTerm.term !== 'ANALYSE' && primaryTerm.tier < 4) {
            prompt.verb = primaryTerm.term;
          }
        }
      });
    });
  });
  return newTopic;
};

export const normalizeText = (value?: string) => (value || '').trim().toLowerCase();

const dedupeStringArray = (values: string[] = []) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const mergeScalarText = (existing?: string, imported?: string) => {
  if (!existing?.trim()) return imported;
  if (!imported?.trim()) return existing;
  return imported.length > existing.length ? imported : existing;
};

const mergeSampleAnswerCollections = (
  existingAnswers: SampleAnswer[] = [],
  importedAnswers: SampleAnswer[] = []
) => {
  const merged = [...existingAnswers];
  const seenIds = new Set(existingAnswers.map((answer) => answer.id));
  const seenAnswerText = new Set(existingAnswers.map((answer) => normalizeText(answer.answer)));

  importedAnswers.forEach((importedAnswer) => {
    const normalizedAnswer = normalizeText(importedAnswer.answer);
    if (seenIds.has(importedAnswer.id) || seenAnswerText.has(normalizedAnswer)) return;
    merged.push(importedAnswer);
    seenIds.add(importedAnswer.id);
    seenAnswerText.add(normalizedAnswer);
  });

  return deduplicateSampleAnswers(merged);
};

const mergePromptContent = (existingPrompt: Prompt, importedPrompt: Prompt): Prompt => ({
  ...existingPrompt,
  ...importedPrompt,
  id: existingPrompt.id,
  question:
    mergeScalarText(existingPrompt.question, importedPrompt.question) || existingPrompt.question,
  highlightedQuestion: mergeScalarText(
    existingPrompt.highlightedQuestion,
    importedPrompt.highlightedQuestion
  ),
  scenario: mergeScalarText(existingPrompt.scenario, importedPrompt.scenario),
  scenarioImage: importedPrompt.scenarioImage ?? existingPrompt.scenarioImage,
  estimatedTime: mergeScalarText(existingPrompt.estimatedTime, importedPrompt.estimatedTime),
  markingCriteria: mergeScalarText(existingPrompt.markingCriteria, importedPrompt.markingCriteria),
  hscQuestionNumber: mergeScalarText(
    existingPrompt.hscQuestionNumber,
    importedPrompt.hscQuestionNumber
  ),
  linkedOutcomes: dedupeStringArray([
    ...(existingPrompt.linkedOutcomes || []),
    ...(importedPrompt.linkedOutcomes || []),
  ]),
  relatedTopics: dedupeStringArray([
    ...(existingPrompt.relatedTopics || []),
    ...(importedPrompt.relatedTopics || []),
  ]),
  prerequisiteKnowledge: dedupeStringArray([
    ...(existingPrompt.prerequisiteKnowledge || []),
    ...(importedPrompt.prerequisiteKnowledge || []),
  ]),
  markerNotes: dedupeStringArray([
    ...(existingPrompt.markerNotes || []),
    ...(importedPrompt.markerNotes || []),
  ]),
  commonStudentErrors: dedupeStringArray([
    ...(existingPrompt.commonStudentErrors || []),
    ...(importedPrompt.commonStudentErrors || []),
  ]),
  keywords: dedupeStringArray([
    ...(existingPrompt.keywords || []),
    ...(importedPrompt.keywords || []),
  ]),
  targetPerformanceBands: Array.from(
    new Set([
      ...(existingPrompt.targetPerformanceBands || []),
      ...(importedPrompt.targetPerformanceBands || []),
    ])
  ),
  sampleAnswers: mergeSampleAnswerCollections(
    existingPrompt.sampleAnswers || [],
    importedPrompt.sampleAnswers || []
  ),
});

const mergePromptCollections = (existingPrompts: Prompt[], importedPrompts: Prompt[]) => {
  const promptMatches = new Map<string, Prompt>();

  existingPrompts.forEach((prompt) => {
    promptMatches.set(`id:${prompt.id}`, prompt);
    promptMatches.set(`question:${normalizeText(prompt.question)}`, prompt);
  });

  importedPrompts.forEach((importedPrompt) => {
    const matchedPrompt =
      promptMatches.get(`id:${importedPrompt.id}`) ||
      promptMatches.get(`question:${normalizeText(importedPrompt.question)}`);

    if (matchedPrompt) {
      const mergedPrompt = mergePromptContent(matchedPrompt, importedPrompt);
      const promptIndex = existingPrompts.findIndex((prompt) => prompt.id === matchedPrompt.id);
      existingPrompts[promptIndex] = mergedPrompt;
      promptMatches.set(`id:${mergedPrompt.id}`, mergedPrompt);
      promptMatches.set(`question:${normalizeText(mergedPrompt.question)}`, mergedPrompt);
      return;
    }

    existingPrompts.push(importedPrompt);
    promptMatches.set(`id:${importedPrompt.id}`, importedPrompt);
    promptMatches.set(`question:${normalizeText(importedPrompt.question)}`, importedPrompt);
  });
};

const mergeDotPointCollections = (existingDPs: DotPoint[], importedDPs: DotPoint[]) => {
  importedDPs.forEach((importedDP) => {
    let existingDP = existingDPs.find((dp) => dp.id === importedDP.id);
    if (!existingDP) {
      existingDP = existingDPs.find(
        (dp) => normalizeText(dp.description) === normalizeText(importedDP.description)
      );
    }

    if (existingDP) {
      existingDP.description =
        mergeScalarText(existingDP.description, importedDP.description) || existingDP.description;
      // `undefined` vs `[]` is meaningful here (see DotPoint.focusAreas): an
      // imported dot point with no `focusAreas` key at all means "the
      // external tool didn't touch this", so the existing value survives.
      // An imported `[]` is a real, explicit "no focus areas" and must win,
      // the same way it wins in handleUpdateFocusAreas — otherwise a
      // reimported file that cleared focus areas silently failed to.
      if (importedDP.focusAreas !== undefined) {
        existingDP.focusAreas = importedDP.focusAreas;
      }
      mergePromptCollections(existingDP.prompts, importedDP.prompts);
    } else {
      existingDPs.push(importedDP);
    }
  });
};

const mergeSubTopicCollections = (existingSTs: SubTopic[], importedSTs: SubTopic[]) => {
  importedSTs.forEach((importedST) => {
    let existingST = existingSTs.find((st) => st.id === importedST.id);
    if (!existingST) {
      existingST = existingSTs.find(
        (st) => normalizeText(st.name) === normalizeText(importedST.name)
      );
    }

    if (existingST) {
      existingST.name = mergeScalarText(existingST.name, importedST.name) || existingST.name;
      mergeDotPointCollections(existingST.dotPoints, importedST.dotPoints);
    } else {
      existingSTs.push(importedST);
    }
  });
};

export const mergeTopicContents = (existingTopic: Topic, importedTopic: Topic): Topic => {
  const mergedTopic: Topic = safeClone(existingTopic);
  mergedTopic.name = mergeScalarText(existingTopic.name, importedTopic.name) || existingTopic.name;
  mergedTopic.performanceBandDescriptors = importedTopic.performanceBandDescriptors?.length
    ? importedTopic.performanceBandDescriptors
    : existingTopic.performanceBandDescriptors;
  mergeSubTopicCollections(mergedTopic.subTopics, importedTopic.subTopics);
  return mergedTopic;
};

/**
 * Merges `topic` into `topics` in place, matching an existing entry by id
 * or by normalized name — the same id-then-text rule every other import
 * path in this file uses. A match runs through `mergeTopicContents` and
 * replaces the existing slot; no match pushes `topic` on as new. Returns
 * whichever Topic actually landed (the merged one, or `topic` itself), so
 * callers that toast/navigate off the result don't have to re-derive it.
 *
 * Shared by the two call sites that apply an imported topic after
 * `regenerateTopicIds`: the main navigator's `handleImportTopic`
 * (hooks/useSyllabusData.ts) and the Content Audit Studio's local import
 * (components/admin/ContentAuditModal.tsx), which only has `updateCourses`,
 * not `syllabusHandlers`.
 */
export const mergeOrAddTopic = (topics: Topic[], topic: Topic): Topic => {
  const existingIndex = topics.findIndex(
    (t) => t.id === topic.id || normalizeText(t.name) === normalizeText(topic.name)
  );
  if (existingIndex !== -1) {
    const merged = mergeTopicContents(topics[existingIndex], topic);
    topics[existingIndex] = merged;
    return merged;
  }
  topics.push(topic);
  return topic;
};

export interface TopicMergePlan {
  /**
   * The existing topic the import would land on — matched by id first, then
   * by normalized name, exactly the rule `handleImportTopic`
   * (`hooks/useSyllabusData.ts`) uses when it actually applies the merge.
   * `null` means nothing in `existingTopics` matches, so the import would
   * create a brand-new topic instead.
   */
  matchedTopic: Topic | null;
  newSubTopics: number;
  matchedSubTopics: number;
  newDotPoints: number;
  matchedDotPoints: number;
  newPrompts: number;
  matchedPrompts: number;
}

/**
 * A read-only preview of what `mergeTopicContents` (via `mergeSubTopicCollections`
 * / `mergeDotPointCollections` / `mergePromptCollections`) WOULD do for this
 * imported topic against a course's existing topics — same id-then-normalized-text
 * matching rules those functions use, but counting instead of mutating, so an
 * import preview can tell a teacher what a click will do before it does it.
 * Never mutates `existingTopics` or `importedTopic`.
 */
export const previewTopicMergePlan = (
  existingTopics: Topic[],
  importedTopic: Topic
): TopicMergePlan => {
  const matchedTopic =
    existingTopics.find((topic) => topic.id === importedTopic.id) ??
    existingTopics.find(
      (topic) => normalizeText(topic.name) === normalizeText(importedTopic.name)
    ) ??
    null;

  const plan: TopicMergePlan = {
    matchedTopic,
    newSubTopics: 0,
    matchedSubTopics: 0,
    newDotPoints: 0,
    matchedDotPoints: 0,
    newPrompts: 0,
    matchedPrompts: 0,
  };

  importedTopic.subTopics.forEach((importedST) => {
    const matchedST = matchedTopic
      ? (matchedTopic.subTopics.find((st) => st.id === importedST.id) ??
        matchedTopic.subTopics.find(
          (st) => normalizeText(st.name) === normalizeText(importedST.name)
        ))
      : undefined;

    if (!matchedST) {
      plan.newSubTopics++;
      importedST.dotPoints.forEach((dp) => {
        plan.newDotPoints++;
        plan.newPrompts += dp.prompts.length;
      });
      return;
    }

    plan.matchedSubTopics++;
    importedST.dotPoints.forEach((importedDP) => {
      const matchedDP =
        matchedST.dotPoints.find((dp) => dp.id === importedDP.id) ??
        matchedST.dotPoints.find(
          (dp) => normalizeText(dp.description) === normalizeText(importedDP.description)
        );

      if (!matchedDP) {
        plan.newDotPoints++;
        plan.newPrompts += importedDP.prompts.length;
        return;
      }

      plan.matchedDotPoints++;
      importedDP.prompts.forEach((importedPrompt) => {
        const matchedPrompt =
          matchedDP.prompts.find((p) => p.id === importedPrompt.id) ??
          matchedDP.prompts.find(
            (p) => normalizeText(p.question) === normalizeText(importedPrompt.question)
          );
        if (matchedPrompt) plan.matchedPrompts++;
        else plan.newPrompts++;
      });
    });
  });

  return plan;
};

export const mergeCourseContents = (existingCourse: Course, importedCourse: Course): Course => {
  const newCourse: Course = safeClone(existingCourse);
  newCourse.name = mergeScalarText(existingCourse.name, importedCourse.name) || existingCourse.name;
  newCourse.subject = mergeScalarText(existingCourse.subject, importedCourse.subject);
  importedCourse.topics.forEach((importedTopic) => {
    let existingTopic = newCourse.topics.find((t: Topic) => t.id === importedTopic.id);
    if (!existingTopic) {
      // Matching on name is a guess, so it may only guess within one year.
      // NSW syllabuses reuse topic names across the two — "Working
      // Scientifically" is both a Year 11 and a Year 12 module — and merging on
      // the name alone would fold a Year 11 import into the HSC topic that
      // happens to share it, moving content into the wrong year with no trace.
      const importedName = normalizeText(importedTopic.name);
      const importedYear = yearOfTopic(importedTopic);
      existingTopic = newCourse.topics.find(
        (t: Topic) => normalizeText(t.name) === importedName && yearOfTopic(t) === importedYear
      );
    }
    if (existingTopic) {
      const mergedTopic = mergeTopicContents(existingTopic, importedTopic);
      const topicIndex = newCourse.topics.findIndex(
        (topic: Topic) => topic.id === existingTopic!.id
      );
      newCourse.topics[topicIndex] = mergedTopic;
    } else newCourse.topics.push(importedTopic);
  });
  // Keyed by code AND year: an outcome is only a duplicate of one in the same
  // year. NESA does put the year inside the code (BI-11-01 / BI-12-01), so this
  // rarely bites — but a course whose codes do not follow that convention would
  // otherwise lose its whole imported Year 11 outcome set to the HSC one.
  const seenOutcomes = new Set(
    newCourse.outcomes.map((o: CourseOutcome) => `${yearOfOutcome(o)}:${o.code}`)
  );
  importedCourse.outcomes.forEach((importedOutcome) => {
    if (!seenOutcomes.has(`${yearOfOutcome(importedOutcome)}:${importedOutcome.code}`))
      newCourse.outcomes.push(importedOutcome);
  });
  return newCourse;
};

export interface OrphanedGroup {
  id: string;
  targetCourseId: string;
  targetCourseName: string;
  importedCourseId: string;
  sourceTopicName: string;
  sourceSubTopicName: string;
  sourceDotPointDescription: string;
  prompts: Prompt[];
}

export type PlacementMap = Map<
  string,
  { topicId: string; subTopicId: string; dotPointId: string } | 'skip'
>;

export const findOrphanedGroups = (
  importedCourses: Course[],
  existingCourses: Course[],
  courseMapping: Map<string, string>
): OrphanedGroup[] => {
  const orphaned: OrphanedGroup[] = [];
  let counter = 0;

  importedCourses.forEach((importedCourse) => {
    const targetCourseId = courseMapping.get(importedCourse.id);
    if (!targetCourseId) return;

    const existingCourse = existingCourses.find((c) => c.id === targetCourseId);
    if (!existingCourse) return;

    importedCourse.topics.forEach((importedTopic) => {
      const matchedTopic =
        existingCourse.topics.find((t) => t.id === importedTopic.id) ||
        existingCourse.topics.find(
          (t) => normalizeText(t.name) === normalizeText(importedTopic.name)
        );

      if (!matchedTopic) {
        importedTopic.subTopics.forEach((st) => {
          st.dotPoints.forEach((dp) => {
            if (dp.prompts.length > 0) {
              orphaned.push({
                id: `orphan-${counter++}`,
                targetCourseId,
                targetCourseName: existingCourse.name,
                importedCourseId: importedCourse.id,
                sourceTopicName: importedTopic.name,
                sourceSubTopicName: st.name,
                sourceDotPointDescription: dp.description,
                prompts: dp.prompts,
              });
            }
          });
        });
        return;
      }

      importedTopic.subTopics.forEach((importedST) => {
        const matchedST =
          matchedTopic.subTopics.find((st) => st.id === importedST.id) ||
          matchedTopic.subTopics.find(
            (st) => normalizeText(st.name) === normalizeText(importedST.name)
          );

        if (!matchedST) {
          importedST.dotPoints.forEach((dp) => {
            if (dp.prompts.length > 0) {
              orphaned.push({
                id: `orphan-${counter++}`,
                targetCourseId,
                targetCourseName: existingCourse.name,
                importedCourseId: importedCourse.id,
                sourceTopicName: importedTopic.name,
                sourceSubTopicName: importedST.name,
                sourceDotPointDescription: dp.description,
                prompts: dp.prompts,
              });
            }
          });
          return;
        }

        importedST.dotPoints.forEach((importedDP) => {
          const matchedDP =
            matchedST.dotPoints.find((dp) => dp.id === importedDP.id) ||
            matchedST.dotPoints.find(
              (dp) => normalizeText(dp.description) === normalizeText(importedDP.description)
            );

          if (!matchedDP && importedDP.prompts.length > 0) {
            orphaned.push({
              id: `orphan-${counter++}`,
              targetCourseId,
              targetCourseName: existingCourse.name,
              importedCourseId: importedCourse.id,
              sourceTopicName: importedTopic.name,
              sourceSubTopicName: importedST.name,
              sourceDotPointDescription: importedDP.description,
              prompts: importedDP.prompts,
            });
          }
        });
      });
    });
  });

  return orphaned;
};

export const buildReconciledImportData = (
  importedCourses: Course[],
  existingCourses: Course[],
  courseMapping: Map<string, string>,
  placements: PlacementMap,
  orphanedGroups: OrphanedGroup[]
): Course[] => {
  const result: Course[] = safeClone(importedCourses);

  result.forEach((course) => {
    const targetCourseId = courseMapping.get(course.id);
    if (!targetCourseId) return;

    const existingCourse = existingCourses.find((c) => c.id === targetCourseId);
    if (!existingCourse) return;

    course.topics = course.topics.filter((topic) => {
      const matchedTopic =
        existingCourse.topics.find((t) => t.id === topic.id) ||
        existingCourse.topics.find((t) => normalizeText(t.name) === normalizeText(topic.name));
      if (!matchedTopic) return false;

      topic.subTopics = topic.subTopics.filter((st) => {
        const matchedST =
          matchedTopic.subTopics.find((s) => s.id === st.id) ||
          matchedTopic.subTopics.find((s) => normalizeText(s.name) === normalizeText(st.name));
        if (!matchedST) return false;

        st.dotPoints = st.dotPoints.filter((dp) => {
          const matchedDP =
            matchedST.dotPoints.find((d) => d.id === dp.id) ||
            matchedST.dotPoints.find(
              (d) => normalizeText(d.description) === normalizeText(dp.description)
            );
          return !!matchedDP;
        });

        return true;
      });

      return true;
    });
  });

  const orphanMap = new Map<string, OrphanedGroup>();
  orphanedGroups.forEach((g) => orphanMap.set(g.id, g));

  placements.forEach((placement, groupId) => {
    if (placement === 'skip') return;

    const group = orphanMap.get(groupId);
    if (!group) return;

    const courseIdx = importedCourses.findIndex((c) => c.id === group.importedCourseId);
    if (courseIdx < 0) return;

    const targetCourse = result[courseIdx];
    const existingCourse = existingCourses.find(
      (c) => c.id === courseMapping.get(group.importedCourseId)
    );
    if (!targetCourse || !existingCourse) return;

    const destTopic = existingCourse.topics.find((t) => t.id === placement.topicId);
    if (!destTopic) return;
    const destST = destTopic.subTopics.find((s) => s.id === placement.subTopicId);
    if (!destST) return;
    const destDP = destST.dotPoints.find((d) => d.id === placement.dotPointId);
    if (!destDP) return;

    let topic = targetCourse.topics.find(
      (t) => t.id === destTopic.id || normalizeText(t.name) === normalizeText(destTopic.name)
    );
    if (!topic) {
      topic = { id: destTopic.id, name: destTopic.name, subTopics: [] };
      targetCourse.topics.push(topic);
    }

    let st = topic.subTopics.find(
      (s) => s.id === destST.id || normalizeText(s.name) === normalizeText(destST.name)
    );
    if (!st) {
      st = { id: destST.id, name: destST.name, dotPoints: [] };
      topic.subTopics.push(st);
    }

    let dp = st.dotPoints.find(
      (d) =>
        d.id === destDP.id || normalizeText(d.description) === normalizeText(destDP.description)
    );
    if (!dp) {
      dp = { id: destDP.id, description: destDP.description, prompts: [] };
      st.dotPoints.push(dp);
    }

    dp.prompts.push(...safeClone(group.prompts));
  });

  return result;
};

export const getLLMImportTemplate = () => {
  return JSON.stringify(
    {
      _instructions_for_llm: { ROLE: '...' },
      data: [],
    },
    null,
    2
  );
};

/**
 * The clean, structured shape produced by AI syllabus analysis and consumed by
 * the import preview/handler. Kept here as the single source of truth so the
 * modal and the import hook don't drift.
 */
export interface SyllabusPreviewNode {
  name: string;
  subTopics: { name: string; dotPoints: string[] }[];
}

/** Coerce a single dot-point of unknown shape (string or { description|text|... }) to text. */
const coerceDotPoint = (dp: unknown): string | null => {
  if (typeof dp === 'string') return dp.trim() || null;
  if (dp && typeof dp === 'object') {
    const o = dp as Record<string, unknown>;
    const text = o.description ?? o.text ?? o.name ?? o.point ?? o.value;
    if (typeof text === 'string') return text.trim() || null;
  }
  return null;
};

const coerceDotPoints = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const flat = raw.map(coerceDotPoint).filter((x): x is string => !!x);
  return recombineSplitDotPoints(flat);
};

const recombineSplitDotPoints = (points: string[]): string[] => {
  if (points.length <= 1) return points;
  const result: string[] = [];
  const parentSuffixes = /\s*(?:including|such as|for example|e\.g\.|namely|like):?\s*$/i;

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    if (parentSuffixes.test(current)) {
      const children: string[] = [];
      let j = i + 1;
      while (j < points.length && isLikelyChildItem(points[j])) {
        children.push(points[j]);
        j++;
      }
      if (children.length > 0) {
        const parentBase = current.replace(parentSuffixes, '');
        result.push(`${parentBase} including ${children.join(', ')}`);
        i = j - 1;
      } else {
        result.push(current);
      }
    } else {
      result.push(current);
    }
  }
  return result;
};

const isLikelyChildItem = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed.length > 120) return false;
  if (/^[a-z]/.test(trimmed)) return true;
  if (/^[-–•]/.test(trimmed)) return true;
  return false;
};

/**
 * Defensively normalises whatever the AI returns for a syllabus analysis into a
 * clean `SyllabusPreviewNode[]`. The model can return the topics array directly,
 * wrapped under `topics`/`data`, a single topic object, dot points at the topic
 * level (no sub-topic), bare-string sub-topics, or renamed/missing fields — and
 * occasionally junk. This unwraps the common shapes, trims, drops empties, and
 * NEVER throws, so a malformed response degrades to "fewer/zero nodes" instead
 * of crashing the import.
 */
export const normalizeSyllabusStructure = (raw: unknown): SyllabusPreviewNode[] => {
  let topics: unknown[] = [];
  if (Array.isArray(raw)) {
    topics = raw;
  } else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.topics)) topics = o.topics;
    else if (Array.isArray(o.data)) topics = o.data;
    else if (typeof o.name === 'string') topics = [o]; // a single topic object
  }

  const result: SyllabusPreviewNode[] = [];

  for (const t of topics) {
    if (!t || typeof t !== 'object') continue;
    const topic = t as Record<string, unknown>;
    const name = typeof topic.name === 'string' ? topic.name.trim() : '';

    const rawSubs = Array.isArray(topic.subTopics)
      ? topic.subTopics
      : Array.isArray(topic.subtopics)
        ? topic.subtopics
        : [];

    const subTopics: { name: string; dotPoints: string[] }[] = [];
    for (const s of rawSubs) {
      if (typeof s === 'string') {
        const stName = s.trim();
        if (stName) subTopics.push({ name: stName, dotPoints: [] });
        continue;
      }
      if (!s || typeof s !== 'object') continue;
      const sub = s as Record<string, unknown>;
      const subName = typeof sub.name === 'string' ? sub.name.trim() : '';
      const dotPoints = coerceDotPoints(sub.dotPoints ?? sub.dotpoints ?? sub.points);
      if (!subName && dotPoints.length === 0) continue;
      subTopics.push({ name: subName || 'General', dotPoints });
    }

    // Some syllabi list dot points directly under a topic, with no sub-topic.
    if (subTopics.length === 0) {
      const topLevel = coerceDotPoints(topic.dotPoints ?? topic.dotpoints ?? topic.points);
      if (topLevel.length > 0) subTopics.push({ name: 'General', dotPoints: topLevel });
    }

    if (!name && subTopics.length === 0) continue;
    result.push({ name: name || 'Untitled Topic', subTopics });
  }

  return result;
};

export const regenerateTopicIds = (topic: Topic): Topic => {
  const newTopic: Topic = safeClone(topic);
  newTopic.id = generateId('topic');
  (newTopic.subTopics || []).forEach((st: SubTopic) => {
    st.id = generateId('subTopic');
    (st.dotPoints || []).forEach((dp: DotPoint) => {
      dp.id = generateId('dp');
      (dp.prompts || []).forEach((p: Prompt) => {
        p.id = generateId('prompt');
        (p.sampleAnswers || []).forEach((sa: SampleAnswer) => {
          sa.id = generateId('sa');
        });
      });
    });
  });
  return newTopic;
};

const regenerateSampleAnswerId = (sa: SampleAnswer): void => {
  sa.id = generateId('sa');
};

const regeneratePromptIds = (prompt: Prompt): void => {
  prompt.id = generateId('prompt');
  (prompt.sampleAnswers || []).forEach(regenerateSampleAnswerId);
};

const regenerateDotPointIds = (dp: DotPoint): void => {
  dp.id = generateId('dp');
  (dp.prompts || []).forEach(regeneratePromptIds);
};

const regenerateSubTopicIds = (st: SubTopic): void => {
  st.id = generateId('subTopic');
  (st.dotPoints || []).forEach(regenerateDotPointIds);
};

/**
 * Reconciles an imported topic's ids against a course's existing topics
 * BEFORE the topic is merged, so the merge's own id-first matching (see
 * `mergeSubTopicCollections` / `mergeDotPointCollections` /
 * `mergePromptCollections`) actually finds what `previewTopicMergePlan`
 * already told the user it would find.
 *
 * The bug this fixes: `regenerateTopicIds` used to run on every reimport,
 * unconditionally minting fresh random ids for the topic and everything
 * inside it. That made the real merge fall back to text matching
 * (normalized name/description/question) for every node — which breaks the
 * instant an external edit touches exactly the field the text match keys
 * on, e.g. "improve the wording" on a dot point's `description`. The
 * preview (computed on the RAW imported topic, original ids intact) still
 * found the match via id; the real merge, working on the id-wiped topic, no
 * longer could — so the edited node landed as a brand-new duplicate sibling
 * instead of updating the existing one in place.
 *
 * The fix walks the imported topic top-down, matching each level against
 * `existingTopics` with the exact same id-then-normalized-text rule
 * `previewTopicMergePlan` and the `mergeXxxCollections` functions use. A
 * matched node gets the existing node's id (so the merge's id check finds
 * it directly, no text fallback needed — an edited field can no longer
 * break the match). An unmatched node — and everything under it — gets a
 * brand-new id, exactly like `regenerateTopicIds` did, preserving the "an
 * import cannot collide with what's already there" guarantee for content
 * that is genuinely new.
 *
 * Never mutates `existingTopics` or `importedTopic` — works on a deep clone.
 */
export const reconcileImportedTopicIds = (importedTopic: Topic, existingTopics: Topic[]): Topic => {
  const newTopic: Topic = safeClone(importedTopic);

  const matchedTopic =
    existingTopics.find((t) => t.id === newTopic.id) ??
    existingTopics.find((t) => normalizeText(t.name) === normalizeText(newTopic.name));

  if (!matchedTopic) {
    // Genuinely new topic: behave exactly like regenerateTopicIds.
    newTopic.id = generateId('topic');
    (newTopic.subTopics || []).forEach(regenerateSubTopicIds);
    return newTopic;
  }

  newTopic.id = matchedTopic.id;

  (newTopic.subTopics || []).forEach((st) => {
    const matchedST =
      matchedTopic.subTopics.find((s) => s.id === st.id) ??
      matchedTopic.subTopics.find((s) => normalizeText(s.name) === normalizeText(st.name));

    if (!matchedST) {
      regenerateSubTopicIds(st);
      return;
    }

    st.id = matchedST.id;

    (st.dotPoints || []).forEach((dp) => {
      const matchedDP =
        matchedST.dotPoints.find((d) => d.id === dp.id) ??
        matchedST.dotPoints.find(
          (d) => normalizeText(d.description) === normalizeText(dp.description)
        );

      if (!matchedDP) {
        regenerateDotPointIds(dp);
        return;
      }

      dp.id = matchedDP.id;

      (dp.prompts || []).forEach((p) => {
        const matchedPrompt =
          matchedDP.prompts.find((mp) => mp.id === p.id) ??
          matchedDP.prompts.find((mp) => normalizeText(mp.question) === normalizeText(p.question));

        if (!matchedPrompt) {
          regeneratePromptIds(p);
          return;
        }

        p.id = matchedPrompt.id;

        // Sample answers are merged additively by id-or-text (see
        // `mergeSampleAnswerCollections`), never replaced in place, so an
        // unmatched one just needs a fresh, collision-safe id. A matched
        // one (by id, or by identical answer text) takes the existing id so
        // the dedupe check that runs at merge time recognises it as the
        // same answer rather than a coincidental text match under a new id.
        (p.sampleAnswers || []).forEach((sa) => {
          const matchedSA =
            matchedPrompt.sampleAnswers?.find((ms) => ms.id === sa.id) ??
            matchedPrompt.sampleAnswers?.find(
              (ms) => normalizeText(ms.answer) === normalizeText(sa.answer)
            );

          sa.id = matchedSA ? matchedSA.id : generateId('sa');
        });
      });
    });
  });

  return newTopic;
};

export const generateValidationReport = (courses: Course[]): DataValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = {
    totalCourses: courses.length,
    totalTopics: 0,
    totalSubTopics: 0,
    totalDotPoints: 0,
    totalPrompts: 0,
    promptsWithSampleAnswers: 0,
    promptsWithKeywords: 0,
    averagePromptsPerDotPoint: 0,
  };
  courses.forEach((course, ci) => {
    (course.topics || []).forEach((topic, ti) => {
      stats.totalTopics++;
      (topic.subTopics || []).forEach((st, sti) => {
        stats.totalSubTopics++;
        (st.dotPoints || []).forEach((dp, dpi) => {
          stats.totalDotPoints++;
          if (Array.isArray(dp.prompts)) {
            dp.prompts.forEach((prompt, pi) => {
              stats.totalPrompts++;
              if (prompt.sampleAnswers && prompt.sampleAnswers.length > 0)
                stats.promptsWithSampleAnswers++;
              if (prompt.keywords && prompt.keywords.length > 0) stats.promptsWithKeywords++;
            });
          }
        });
      });
    });
  });
  if (stats.totalDotPoints > 0)
    stats.averagePromptsPerDotPoint = stats.totalPrompts / stats.totalDotPoints;
  return { isValid: errors.length === 0, errors, warnings, stats };
};
