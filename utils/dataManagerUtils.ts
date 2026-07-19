import { z } from 'zod';
import {
  Course,
  Topic,
  SubTopic,
  DotPoint,
  Prompt,
  PromptVerb,
  SampleAnswer,
  DataValidationResult,
} from '../types';
import {
  commandTerms,
  getCommandTermsForMarks,
  getBandForMark,
  getCommandTermInfo,
  extractCommandVerb,
} from '../data/commandTerms';
import { generateId } from './idUtils';

// --- Helpers ---

/**
 * Heuristic engine to extract sub-items (examples) from NESA syllabus descriptions.
 * Detects patterns like "including X, Y and Z", "including: A; B; C", or "(A, B, C)".
 */
export const parseSubItemsFromDescription = (description: string): string[] => {
  if (!description) return [];

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

  text = text.replace(new RegExp('^([\\s]*[-•*])\\s*\\n\\s*(\\d)', 'gm'), '$1 $2');
  text = text.replace(
    new RegExp('^([\\s]*[-•*]?\\s*\\d+(?:\\s*[-–]\\s*\\d+)?)\\s*\\n\\s*(marks?|:)', 'gim'),
    '$1 $2'
  );
  text = text.replace(new RegExp('(\\d+)\\s*[-–]\\s*\\n\\s*(\\d+\\s*marks?:)', 'gi'), '$1-$2');
  text = text.replace(new RegExp('^[•·*]\\s*', 'gm'), '- ');

  return text;
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
export const deduplicateSampleAnswers = (answers: SampleAnswer[]): SampleAnswer[] => {
  if (!answers || answers.length <= 1) return answers;

  const seen = new Map<string, SampleAnswer>();

  // Using a map to track unique texts.
  // If we encounter a duplicate text, we only update if the new mark is lower.
  answers.forEach((answer) => {
    const textKey = answer.answer.trim();
    const existing = seen.get(textKey);

    if (!existing || answer.mark < existing.mark) {
      seen.set(textKey, answer);
    }
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
    if (answersForMark.length <= 5) {
      result.push(...answersForMark);
    } else {
      // Pruning Algorithm:
      // Reverse so we treat the end of the array as newest.
      const newestFirst = [...answersForMark].reverse();
      const kept: SampleAnswer[] = [];

      // a. Always keep the absolute newest
      kept.push(newestFirst[0]);

      // b. Find a "diversity candidate" (opposite source) if available
      const primarySource = newestFirst[0].source;
      const diversityCandidate = newestFirst.find(
        (a) =>
          a !== newestFirst[0] && (primarySource === 'AI' ? a.source !== 'AI' : a.source === 'AI')
      );
      if (diversityCandidate) {
        kept.push(diversityCandidate);
      }

      // c. Fill the rest of the 5 slots with the next newest available
      for (const item of newestFirst) {
        if (kept.length >= 5) break;
        if (!kept.includes(item)) {
          kept.push(item);
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
    feedback: z.string().optional(),
    contentFlag: ContentFlagSchema.optional(),
  })
  .passthrough();

const PromptSchema = z
  .object({
    id: z.string().default(() => generateId('prompt')),
    question: z.string().catch('Untitled Question').default('Untitled Question'),
    totalMarks: z.union([z.string(), z.number()]).transform((val) => Number(val) || 0),
    verb: z.unknown().transform(normalizeVerb),
    highlightedQuestion: z.string().optional(),
    scenario: z.string().optional().default(''),
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

const TopicSchema = z
  .object({
    id: z.string().default(() => generateId('topic')),
    name: z.string().catch('Untitled Topic').default('Untitled Topic'),
    subTopics: z.array(SubTopicSchema).default([]),
    performanceBandDescriptors: z.array(PerformanceBandDescriptorSchema).optional(),
  })
  .passthrough();

const CourseOutcomeSchema = z.object({
  code: z.string(),
  description: z.string(),
});

export const CourseSchema = z
  .object({
    id: z.string().default(() => generateId('course')),
    name: z.string().catch('Untitled Course').default('Untitled Course'),
    outcomes: z.array(CourseOutcomeSchema).default([]),
    topics: z.array(TopicSchema).default([]),
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
      const courseResult = CourseSchema.safeParse(rawData);
      if (courseResult.success) {
        let courses = migrateAnalyseVerb([courseResult.data as Course]);
        courses = validateAndFixCourses(courses);
        courses = recalculateSampleAnswerBands(courses);
        return { type: 'courses', data: courses };
      }

      if ('subTopics' in rawData) {
        const result = TopicSchema.safeParse(rawData);
        if (result.success) {
          const topic = migrateTopicVerbs(result.data as Topic);
          const tempCourse: Course = { id: 'temp', name: 'temp', outcomes: [], topics: [topic] };
          const recalcCourses = recalculateSampleAnswerBands([tempCourse]);
          const fixedCourses = validateAndFixCourses(recalcCourses);
          return { type: 'topic', data: fixedCourses[0].topics[0] };
        }
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
  const migratedCourses: Course[] = JSON.parse(JSON.stringify(courses));
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
  const newTopic = JSON.parse(JSON.stringify(topic));
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

const normalizeText = (value?: string) => (value || '').trim().toLowerCase();

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
  const mergedTopic = JSON.parse(JSON.stringify(existingTopic)) as Topic;
  mergedTopic.name = mergeScalarText(existingTopic.name, importedTopic.name) || existingTopic.name;
  mergedTopic.performanceBandDescriptors = importedTopic.performanceBandDescriptors?.length
    ? importedTopic.performanceBandDescriptors
    : existingTopic.performanceBandDescriptors;
  mergeSubTopicCollections(mergedTopic.subTopics, importedTopic.subTopics);
  return mergedTopic;
};

export const mergeCourseContents = (existingCourse: Course, importedCourse: Course): Course => {
  const newCourse = JSON.parse(JSON.stringify(existingCourse));
  newCourse.name = mergeScalarText(existingCourse.name, importedCourse.name) || existingCourse.name;
  newCourse.subject = mergeScalarText(existingCourse.subject, importedCourse.subject);
  importedCourse.topics.forEach((importedTopic) => {
    let existingTopic = newCourse.topics.find((t: Topic) => t.id === importedTopic.id);
    if (!existingTopic) {
      const importedName = normalizeText(importedTopic.name);
      existingTopic = newCourse.topics.find((t: Topic) => normalizeText(t.name) === importedName);
    }
    if (existingTopic) {
      const mergedTopic = mergeTopicContents(existingTopic, importedTopic);
      const topicIndex = newCourse.topics.findIndex(
        (topic: Topic) => topic.id === existingTopic!.id
      );
      newCourse.topics[topicIndex] = mergedTopic;
    } else newCourse.topics.push(importedTopic);
  });
  const existingCodes = new Set(newCourse.outcomes.map((o: any) => o.code));
  importedCourse.outcomes.forEach((importedOutcome) => {
    if (!existingCodes.has(importedOutcome.code)) newCourse.outcomes.push(importedOutcome);
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
  const result = JSON.parse(JSON.stringify(importedCourses)) as Course[];

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

    dp.prompts.push(...JSON.parse(JSON.stringify(group.prompts)));
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
  const newTopic = JSON.parse(JSON.stringify(topic));
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
