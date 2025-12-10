
import { z } from 'zod';
import { Course, Topic, SubTopic, DotPoint, Prompt, PromptVerb, SampleAnswer, DataValidationResult } from '../types';
import { commandTerms, getCommandTermsForMarks, getBandForMark, getCommandTermInfo, extractCommandVerb } from '../data/commandTerms';
import { generateId } from './idUtils';

// --- Helpers ---

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

  // 0. Pre-process: Handle HTML-like strings common in AI outputs
  // Often AI returns "<ul><li>5 marks: ...</li></ul>"
  if (text.includes('<') && text.includes('>')) {
      // Replace block/list endings with newlines to preserve structure before stripping tags
      text = text
          .replace(/<\/li>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/div>/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/tr>/gi, '\n'); // Handle table rows if HTML table

      // Strip all remaining HTML tags
      text = text.replace(/<[^>]+>/g, '');

      // Decode common HTML entities
      text = text
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
          
      // Clean up excessive newlines created by the replacements
      text = text.replace(/\n\s*\n/g, '\n').trim();
  }

  // 1. Check if it is valid JSON (Object or Array)
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
          JSON.parse(text);
          return text; 
      } catch (e) { /* ignore */ }
  }

  // 2. Check if it's a Markdown Table (preserve if so)
  // Look for at least two lines starting with |
  if ((text.match(/^\|/m) || []).length >= 2) {
      return text; 
  }

  // 3. Fallback Text Formatting
  
  // Fix broken lines where bullet is separated from number
  // e.g. "-\n3" -> "- 3"
  text = text.replace(/^([\s]*[-•*])\s*\n\s*(\d)/gm, '$1 $2');

  // Fix broken lines where number is separated from "marks" or content
  // e.g. "3\nmarks" -> "3 marks"
  // e.g. "- 3\nmarks" -> "- 3 marks"
  text = text.replace(/^([\s]*[-•*]?\s*\d+(?:\s*[-–]\s*\d+)?)\s*\n\s*(marks?|:)/gim, '$1 $2');

  // Fix split ranges (e.g. "1-\n2 marks")
  text = text.replace(/(\d+)\s*[-–]\s*\n\s*(\d+\s*marks?:)/gi, '$1-$2');

  // Standardize bullets
  text = text.replace(/^[•·*]\s*/gm, '- ');

  return text;
};

// Robust verb validation: handles exact match, case-insensitive match, and whitespace
// Now accepts unknown to safely handle any input type from JSON
const normalizeVerb = (val: unknown): PromptVerb | undefined => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    
    // Check exact match first (fastest)
    if (commandTerms.has(trimmed as PromptVerb)) return trimmed as PromptVerb;

    // Check case-insensitive
    const upper = trimmed.toUpperCase();
    if (commandTerms.has(upper as PromptVerb)) return upper as PromptVerb;

    return undefined;
};

// --- Zod Schemas ---

const SampleAnswerSchema = z.object({
    id: z.string().default(() => generateId('sa')),
    band: z.union([z.string(), z.number()]).transform(val => Number(val) || 1),
    answer: z.string().catch('No answer provided.').default('No answer provided.'),
    mark: z.union([z.string(), z.number()]).transform(val => Number(val) || 0),
    source: z.enum(['AI', 'USER', 'HSC_EXEMPLAR']).catch('AI').default('AI'),
    feedback: z.string().optional(),
}).passthrough();

const PromptSchema = z.object({
    id: z.string().default(() => generateId('prompt')),
    question: z.string().catch('Untitled Question').default('Untitled Question'),
    totalMarks: z.union([z.string(), z.number()]).transform(val => Number(val) || 0),
    // Relaxed validation: accepts unknown, normalizes strings, undefined otherwise
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
    // New Metadata
    isPastHSC: z.boolean().optional().default(false),
    hscYear: z.number().optional(),
    hscQuestionNumber: z.string().optional(),
}).passthrough();

const DotPointSchema = z.object({
    id: z.string().default(() => generateId('dp')),
    description: z.string().catch('No description').default('No description'),
    prompts: z.array(PromptSchema).default([]),
}).passthrough();

const SubTopicSchema = z.object({
    id: z.string().default(() => generateId('subTopic')),
    name: z.string().catch('Untitled Sub-Topic').default('Untitled Sub-Topic'),
    dotPoints: z.array(DotPointSchema).default([]),
}).passthrough();

const PerformanceBandDescriptorSchema = z.object({
    band: z.coerce.number(),
    label: z.string(),
    shortLabel: z.string(),
    description: z.string(),
});

const TopicSchema = z.object({
    id: z.string().default(() => generateId('topic')),
    name: z.string().catch('Untitled Topic').default('Untitled Topic'),
    subTopics: z.array(SubTopicSchema).default([]),
    performanceBandDescriptors: z.array(PerformanceBandDescriptorSchema).optional(),
}).passthrough();

const CourseOutcomeSchema = z.object({
    code: z.string(),
    description: z.string(),
});

export const CourseSchema = z.object({
    id: z.string().default(() => generateId('course')),
    name: z.string().catch('Untitled Course').default('Untitled Course'),
    outcomes: z.array(CourseOutcomeSchema).default([]),
    topics: z.array(TopicSchema).default([]),
}).passthrough();

export const CoursesArraySchema = z.array(CourseSchema);

// --- Data Processing Utils ---

export interface TreeItem {
  id: string;
  label: string;
  type: 'course' | 'topic' | 'subTopic' | 'dotPoint';
  children?: TreeItem[];
  parentId?: string;
}

export const buildTree = (courses: Course[]): TreeItem[] => {
  const build = (items: any[], type: 'course' | 'topic' | 'subTopic' | 'dotPoint', parentId?: string): TreeItem[] => {
      if (!items) return [];
      return items.map(item => {
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
        return topics.map(topic => {
            const filteredSubTopics = (topic.subTopics || []).map(subTopic => {
                const filteredDotPoints = (subTopic.dotPoints || []).filter(dp => selectedIds.has(dp.id));
                
                if (filteredDotPoints.length > 0 || selectedIds.has(subTopic.id)) {
                    const finalDotPoints = selectedIds.has(subTopic.id) ? subTopic.dotPoints : filteredDotPoints;
                    return { ...subTopic, dotPoints: finalDotPoints };
                }
                return null;
            }).filter(st => st !== null) as SubTopic[];

            if (filteredSubTopics.length > 0 || selectedIds.has(topic.id)) {
                const finalSubTopics = selectedIds.has(topic.id) ? topic.subTopics : filteredSubTopics;
                return { ...topic, subTopics: finalSubTopics };
            }
            return null;
        }).filter(t => t !== null) as Topic[];
    };
    
    return courses.map(course => {
        const filteredTopics = filterTopics(course.topics);
        if (filteredTopics.length > 0 || selectedIds.has(course.id)) {
            const finalTopics = selectedIds.has(course.id) ? course.topics : filteredTopics;
            return { ...course, topics: finalTopics };
        }
        return null;
    }).filter(c => c !== null) as Course[];
};


export const findConflicts = (importedCourses: Course[], existingCourses: Course[]): Course[] => {
    const existingIds = new Set(existingCourses.map(c => c.id));
    return importedCourses.filter(c => existingIds.has(c.id));
};

export const checkForDuplicateIds = (courses: Course[]): string[] => {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  
  courses.forEach(c => {
    if (seen.has(c.id)) {
      duplicates.push(c.id);
    }
    seen.add(c.id);
  });
  
  return duplicates;
};

export const analyzeAndSanitizeImportData = (rawData: any): { type: 'courses' | 'topic' | 'invalid', data: any, error?: string } => {
    try {
        // Handle LLM Template wrapper
        // If the root object has an '_instructions_for_llm' key and a 'data' key, unwrap it
        if (!Array.isArray(rawData) && rawData !== null && typeof rawData === 'object') {
             if (Array.isArray(rawData.data) && (rawData._instructions_for_llm || rawData.instructions)) {
                 console.log("Unwrapping LLM Template structure...");
                 rawData = rawData.data;
             } else if (Array.isArray(rawData.courses)) {
                 // Handle structure like { courses: [...] }
                 rawData = rawData.courses;
             }
        }

        if (Array.isArray(rawData)) {
            // Attempt to parse as array of courses
            const result = CoursesArraySchema.safeParse(rawData);
            if (result.success) {
                // Apply migrations: Verb Checks + Band Recalculations
                let courses = migrateAnalyseVerb(result.data as Course[]);
                courses = validateAndFixCourses(courses); // New comprehensive fix
                courses = recalculateSampleAnswerBands(courses);
                
                // Check for duplicates
                const duplicates = checkForDuplicateIds(courses);
                if (duplicates.length > 0) {
                   return { type: 'invalid', data: null, error: `Import file contains duplicate Course IDs. Please ensure unique IDs before importing.` };
                }

                return { type: 'courses', data: courses };
            }
            // Provide more specific error detail
            const errorMsg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
            return { type: 'invalid', data: null, error: 'Invalid course list format: ' + errorMsg };
        }
        
        if (typeof rawData === 'object' && rawData !== null) {
            // Try parsing as single Course (though schema expects array, sometimes single obj is exported)
             const courseResult = CourseSchema.safeParse(rawData);
             if (courseResult.success) {
                 let courses = migrateAnalyseVerb([courseResult.data as Course]);
                 courses = validateAndFixCourses(courses); // New comprehensive fix
                 courses = recalculateSampleAnswerBands(courses);
                 return { type: 'courses', data: courses };
             }

            // Try parsing as single Topic
            if ('subTopics' in rawData) {
                const result = TopicSchema.safeParse(rawData);
                if (result.success) {
                    let topic = migrateTopicVerbs(result.data as Topic);
                    // Wrap in temp course structure to reuse recalculate function
                    const tempCourse: Course = { id: 'temp', name: 'temp', outcomes: [], topics: [topic] };
                    const recalcCourses = recalculateSampleAnswerBands([tempCourse]);
                    const fixedCourses = validateAndFixCourses(recalcCourses);
                    return { type: 'topic', data: fixedCourses[0].topics[0] };
                }
                 const errorMsg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
                 return { type: 'invalid', data: null, error: 'Invalid topic format: ' + errorMsg };
            }
        }
        return { type: 'invalid', data: null, error: 'Unsupported data format. Please import a Course or Topic JSON file.' };
    } catch (error) {
        return { type: 'invalid', data: null, error: error instanceof Error ? error.message : 'Unknown error during parsing.' };
    }
}

export const recalculateSampleAnswerBands = (courses: Course[]): Course[] => {
    // Ensure imported sample answers respect the new Tier-based Band Caps
    return courses.map(course => ({
        ...course,
        topics: course.topics.map(topic => ({
            ...topic,
            subTopics: topic.subTopics.map(subTopic => ({
                ...subTopic,
                dotPoints: subTopic.dotPoints.map(dotPoint => ({
                    ...dotPoint,
                    prompts: dotPoint.prompts.map(prompt => {
                        const termInfo = getCommandTermInfo(prompt.verb);
                        const tier = termInfo.tier;
                        
                        return {
                            ...prompt,
                            sampleAnswers: prompt.sampleAnswers?.map(sa => ({
                                ...sa,
                                // Re-calculate band based on mark, total marks, and tier constraint
                                band: getBandForMark(sa.mark, prompt.totalMarks, tier)
                            })) || []
                        };
                    })
                }))
            }))
        }))
    }));
};

export const migrateAnalyseVerb = (courses: Course[]): Course[] => {
    const analyseInfo = commandTerms.get('ANALYSE');
    if (!analyseInfo) return courses; 

    const migratedCourses: Course[] = JSON.parse(JSON.stringify(courses)); 
    
    migratedCourses.forEach(course => {
        (course.topics || []).forEach(topic => {
            (topic.subTopics || []).forEach(subTopic => {
                (subTopic.dotPoints || []).forEach(dotPoint => {
                    (dotPoint.prompts || []).forEach(prompt => {
                        if (prompt.verb === 'ANALYSE' && prompt.totalMarks < analyseInfo.markRange[0]) {
                            const { primaryTerm } = getCommandTermsForMarks(prompt.totalMarks);
                            if (primaryTerm.term !== 'ANALYSE' && primaryTerm.tier < 4) {
                                // console.log(`Migrating ${prompt.totalMarks}-mark 'ANALYSE' question to '${primaryTerm.term}'`);
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

// New function to auto-validate and fix verb inconsistencies
export const validateAndFixCourses = (courses: Course[]): Course[] => {
    return courses.map(course => ({
        ...course,
        topics: course.topics.map(topic => ({
            ...topic,
            subTopics: topic.subTopics.map(subTopic => ({
                ...subTopic,
                dotPoints: subTopic.dotPoints.map(dotPoint => ({
                    ...dotPoint,
                    prompts: dotPoint.prompts.map(prompt => {
                        // 1. Ensure verb is valid
                        let verb = prompt.verb;
                        
                        // 2. Auto-detect from question text if possible
                        // We prioritise the text because it's what the student sees
                        const detected = extractCommandVerb(prompt.question);
                        if (detected) {
                            // If the detected verb is different, update it
                            // This fixes cases where data says "EXPLAIN" (default) but text is "State..."
                            // We trust the question text more than the metadata field which might be outdated or defaulted
                            if (detected.term !== verb) {
                                verb = detected.term;
                            }
                        }
                        
                        return { ...prompt, verb };
                    })
                }))
            }))
        }))
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
    averagePromptsPerDotPoint: 0
  };
  
  courses.forEach((course, ci) => {
    if (!course.id) errors.push(`Course ${ci} missing ID`);
    if (!course.name) errors.push(`Course ${ci} missing name`);
    
    (course.topics || []).forEach((topic, ti) => {
      stats.totalTopics++;
      if (!topic.id) errors.push(`Course "${course.name}" topic ${ti} missing ID`);
      
      (topic.subTopics || []).forEach((st, sti) => {
        stats.totalSubTopics++;
        if (!st.id) errors.push(`Topic "${topic.name}" subTopic ${sti} missing ID`);
        
        (st.dotPoints || []).forEach((dp, dpi) => {
          stats.totalDotPoints++;
          if (!dp.id) errors.push(`SubTopic "${st.name}" dotPoint ${dpi} missing ID`);
          if (!dp.description) errors.push(`SubTopic "${st.name}" dotPoint ${dpi} missing description`);
          
          if (Array.isArray(dp.prompts)) {
            dp.prompts.forEach((prompt, pi) => {
              stats.totalPrompts++;
              if (!prompt.id) errors.push(`DotPoint "${dp.description}" prompt ${pi} missing ID`);
              if (!prompt.question) errors.push(`DotPoint "${dp.description}" prompt ${pi} missing question`);
              
              if (prompt.sampleAnswers && prompt.sampleAnswers.length > 0) {
                stats.promptsWithSampleAnswers++;
              } else {
                warnings.push(`Prompt "${prompt.question.slice(0, 50)}..." has no sample answers`);
              }
              
              if (prompt.keywords && prompt.keywords.length > 0) {
                stats.promptsWithKeywords++;
              } else {
                warnings.push(`Prompt "${prompt.question.slice(0, 50)}..." has no keywords`);
              }

              // Check for logical consistency in Past HSC Metadata
              if (prompt.isPastHSC && !prompt.hscYear) {
                 warnings.push(`Prompt "${prompt.question.slice(0,30)}..." is marked as Past HSC but missing the Year.`);
              }
            });
          }
        });
      });
    });
  });
  
  if (stats.totalDotPoints > 0) {
    stats.averagePromptsPerDotPoint = stats.totalPrompts / stats.totalDotPoints;
  }
  
  if (stats.averagePromptsPerDotPoint < 1 && stats.totalDotPoints > 0) {
    warnings.push(`Low average prompts per dot point: ${stats.averagePromptsPerDotPoint.toFixed(1)}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats
  };
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

export const mergeCourseContents = (existingCourse: Course, importedCourse: Course): Course => {
    const newCourse = JSON.parse(JSON.stringify(existingCourse));

    const mergePrompts = (existingPrompts: Prompt[], importedPrompts: Prompt[]) => {
        const existingPromptIds = new Set(existingPrompts.map(p => p.id));
        // Safeguard: p.question might be undefined/null if data is dirty
        const existingPromptQuestions = new Set(existingPrompts.map(p => (p.question || '').trim().toLowerCase()));
        
        importedPrompts.forEach(importedPrompt => {
            const importedQ = (importedPrompt.question || '').trim().toLowerCase();
            if (!existingPromptIds.has(importedPrompt.id) && !existingPromptQuestions.has(importedQ)) {
                existingPrompts.push(importedPrompt);
            }
        });
    };
    
    const mergeDotPoints = (existingDPs: DotPoint[], importedDPs: DotPoint[]) => {
        importedDPs.forEach(importedDP => {
            let existingDP = existingDPs.find(dp => dp.id === importedDP.id);
            if (!existingDP) {
                // Safeguard description
                const importedDesc = (importedDP.description || '').trim().toLowerCase();
                existingDP = existingDPs.find(dp => (dp.description || '').trim().toLowerCase() === importedDesc);
            }

            if (existingDP) {
                mergePrompts(existingDP.prompts, importedDP.prompts);
            } else {
                existingDPs.push(importedDP);
            }
        });
    };

    const mergeSubTopics = (existingSTs: SubTopic[], importedSTs: SubTopic[]) => {
        importedSTs.forEach(importedST => {
            let existingST = existingSTs.find(st => st.id === importedST.id);
            if (!existingST) {
                // Safeguard name
                const importedName = (importedST.name || '').trim().toLowerCase();
                existingST = existingSTs.find(st => (st.name || '').trim().toLowerCase() === importedName);
            }

            if (existingST) {
                mergeDotPoints(existingST.dotPoints, importedST.dotPoints);
            } else {
                existingSTs.push(importedST);
            }
        });
    };
    
    importedCourse.topics.forEach(importedTopic => {
        let existingTopic = newCourse.topics.find((t: Topic) => t.id === importedTopic.id);
        if (!existingTopic) {
            // Safeguard name
            const importedName = (importedTopic.name || '').trim().toLowerCase();
            existingTopic = newCourse.topics.find((t: Topic) => (t.name || '').trim().toLowerCase() === importedName);
        }

        if (existingTopic) {
            mergeSubTopics(existingTopic.subTopics, importedTopic.subTopics);
        } else {
            newCourse.topics.push(importedTopic);
        }
    });

    const existingCodes = new Set(newCourse.outcomes.map((o: any) => o.code));
    importedCourse.outcomes.forEach(importedOutcome => {
        if (!existingCodes.has(importedOutcome.code)) {
            newCourse.outcomes.push(importedOutcome);
        }
    });

    return newCourse;
};

export const getLLMImportTemplate = () => {
    const template = {
        "_instructions_for_llm": {
            "ROLE": "You are an educational data architect. Your goal is to populate this JSON structure with high-quality syllabus content.",
            "STRUCTURE": {
                "courses": "An array of Course objects. Each course has outcomes and topics.",
                "topics": "Topics contain subTopics.",
                "subTopics": "SubTopics contain dotPoints (specific syllabus learning objectives).",
                "dotPoints": "DotPoints contain prompts (exam-style questions).",
                "prompts": "The most important unit. Must include a question, valid verb, marks, criteria, and sample answers."
            },
            "CRITICAL_RULES": [
                "Generate UNIQUE IDs for every object (e.g., 'course-1', 'topic-A'). Do not leave IDs empty.",
                "VERBS: You MUST use NESA standard verbs for prompts (e.g., 'Explain', 'Describe', 'Evaluate', 'Analyse', 'Compare').",
                "MARKING_CRITERIA: Must be a string. Use markdown bullet points to separate mark ranges (e.g., '- 1-2 marks: ...').",
                "SAMPLE_ANSWERS: Provide at least one Band 6 (perfect) answer for every prompt.",
                "PAST HSC: If a question is from a past paper, set isPastHSC to true and provide hscYear and hscQuestionNumber.",
                "OUTPUT: Return ONLY valid JSON. Do not include markdown code blocks around the JSON."
            ]
        },
        "data": [
            {
                "id": "generate-unique-course-id",
                "name": "Course Name (e.g. HSC Physics)",
                "outcomes": [
                    {
                        "code": "OUTCOME-01",
                        "description": "Description of the outcome..."
                    }
                ],
                "topics": [
                    {
                        "id": "generate-unique-topic-id",
                        "name": "Topic Name",
                        "subTopics": [
                            {
                                "id": "generate-unique-subtopic-id",
                                "name": "Sub-Topic Name",
                                "dotPoints": [
                                    {
                                        "id": "generate-unique-dp-id",
                                        "description": "Syllabus Dot Point Description",
                                        "prompts": [
                                            {
                                                "id": "generate-unique-prompt-id",
                                                "question": "Evaluate the impact of...",
                                                "totalMarks": 5,
                                                "verb": "EVALUATE",
                                                "scenario": "Optional context scenario...",
                                                "markingCriteria": "- 1-2 marks: Basic description\n- 3-4 marks: Sound evaluation\n- 5 marks: Comprehensive evaluation",
                                                "keywords": ["Key term 1", "Key term 2"],
                                                "isPastHSC": true,
                                                "hscYear": 2023,
                                                "hscQuestionNumber": "21a",
                                                "sampleAnswers": [
                                                    {
                                                        "id": "generate-unique-sa-id",
                                                        "band": 6,
                                                        "mark": 5,
                                                        "answer": "Comprehensive sample answer text...",
                                                        "source": "AI"
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    };
    return JSON.stringify(template, null, 2);
};
