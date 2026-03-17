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

  // Normalize string: remove extra spaces and standardize punctuation
  const cleanDesc = description.replace(/\s+/g, ' ').trim();

  let items: string[] = [];

  // Pattern 1: Keywords like "including", "includes", "such as", "e.g."
  // We look for everything after these keywords until the next major stop (period, semicolon if outside the list)
  const listPatterns = [
    /\bincl(?:uding|udes|uding:)\s+([^.]+)/i,
    /\bsuch\s+as\s+([^.]+)/i,
    /\be\.g\.\s+([^.]+)/i,
  ];

  listPatterns.forEach((pattern) => {
    const match = cleanDesc.match(pattern);
    if (match && match[1]) {
      const listPart = match[1];
      // Split by common delimiters
      const splitItems = listPart
        .split(/,|;|and|\band\b/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);
      items = [...items, ...splitItems];
    }
  });

  // Pattern 2: Content inside brackets
  const bracketMatch = cleanDesc.match(/\(([^)]+)\)/);
  if (bracketMatch && bracketMatch[1]) {
    const bracketContents = bracketMatch[1]
      .split(/,|;|and|\band\b/)
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
  return undefined;
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

const SampleAnswerSchema = z
  .object({
    id: z.string().default(() => generateId('sa')),
    band: z.union([z.string(), z.number()]).transform((val) => Number(val) || 1),
    answer: z.string().catch('No answer provided.').default('No answer provided.'),
    mark: z.union([z.string(), z.number()]).transform((val) => Number(val) || 0),
    source: z.enum(['AI', 'USER', 'HSC_EXEMPLAR']).catch('AI').default('AI'),
    feedback: z.string().optional(),
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
  })
  .passthrough();

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

export const mergeCourseContents = (existingCourse: Course, importedCourse: Course): Course => {
  const newCourse = JSON.parse(JSON.stringify(existingCourse));
  const mergePrompts = (existingPrompts: Prompt[], importedPrompts: Prompt[]) => {
    const existingPromptIds = new Set(existingPrompts.map((p) => p.id));
    const existingPromptQuestions = new Set(
      existingPrompts.map((p) => (p.question || '').trim().toLowerCase())
    );
    importedPrompts.forEach((importedPrompt) => {
      const importedQ = (importedPrompt.question || '').trim().toLowerCase();
      if (!existingPromptIds.has(importedPrompt.id) && !existingPromptQuestions.has(importedQ)) {
        existingPrompts.push(importedPrompt);
      }
    });
  };
  const mergeDotPoints = (existingDPs: DotPoint[], importedDPs: DotPoint[]) => {
    importedDPs.forEach((importedDP) => {
      let existingDP = existingDPs.find((dp) => dp.id === importedDP.id);
      if (!existingDP) {
        const importedDesc = (importedDP.description || '').trim().toLowerCase();
        existingDP = existingDPs.find(
          (dp) => (dp.description || '').trim().toLowerCase() === importedDesc
        );
      }
      if (existingDP) mergePrompts(existingDP.prompts, importedDP.prompts);
      else existingDPs.push(importedDP);
    });
  };
  const mergeSubTopics = (existingSTs: SubTopic[], importedSTs: SubTopic[]) => {
    importedSTs.forEach((importedST) => {
      let existingST = existingSTs.find((st) => st.id === importedST.id);
      if (!existingST) {
        const importedName = (importedST.name || '').trim().toLowerCase();
        existingST = existingSTs.find(
          (st) => (st.name || '').trim().toLowerCase() === importedName
        );
      }
      if (existingST) mergeDotPoints(existingST.dotPoints, importedST.dotPoints);
      else existingSTs.push(importedST);
    });
  };
  importedCourse.topics.forEach((importedTopic) => {
    let existingTopic = newCourse.topics.find((t: Topic) => t.id === importedTopic.id);
    if (!existingTopic) {
      const importedName = (importedTopic.name || '').trim().toLowerCase();
      existingTopic = newCourse.topics.find(
        (t: Topic) => (t.name || '').trim().toLowerCase() === importedName
      );
    }
    if (existingTopic) mergeSubTopics(existingTopic.subTopics, importedTopic.subTopics);
    else newCourse.topics.push(importedTopic);
  });
  const existingCodes = new Set(newCourse.outcomes.map((o: any) => o.code));
  importedCourse.outcomes.forEach((importedOutcome) => {
    if (!existingCodes.has(importedOutcome.code)) newCourse.outcomes.push(importedOutcome);
  });
  return newCourse;
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
