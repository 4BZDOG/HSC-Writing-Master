
import { Type } from "@google/genai";
import { Prompt, CourseOutcome, EvaluationResult, SubTopic, CommandTermInfo, SampleAnswer, PromptVerb, QualityCheckResult } from '../types';
import { AICache } from './aiCache';
import { generateId } from "../utils/idUtils";
import { getCommandTermInfo, getBandForMark, getStructureGuide } from "../data/commandTerms";
import { generateContentWithRetry, safeJsonParse } from './aiCore';

// Re-export infrastructure for backward compatibility with existing components
export { apiGuard, apiMonitor, ApiKeyError, QuotaExceededError, ERROR_THRESHOLD } from './aiCore';
export type { ApiStatus, ApiMonitorStatus } from './aiCore';

// --- Configuration ---
const MODELS = {
  FAST: 'gemini-2.5-flash',
  REASONING: 'gemini-3-pro-preview',
} as const;

// --- Prompt Engineering Maps ---
const SCENARIO_INSTRUCTIONS: Record<string, string> = {
    'random': 'Create a realistic, industry-relevant scenario that provides context for the question.',
    'temporal': 'The scenario must involve a critical deadline, time pressure, or scheduling constraint that forces a decision.',
    'financial': 'The scenario must involve budget limitations, cost-benefit analysis, or return on investment considerations.',
    'ethical': 'The scenario must present a moral dilemma, conflict of interest, or social responsibility issue.',
    'stakeholder': 'The scenario must involve conflicting needs or perspectives from different stakeholders (e.g., users vs management).',
    'technical': 'The scenario must involve a specific technical constraint, legacy system limitation, or hardware restriction.',
    'regulatory': 'The scenario must involve compliance with specific laws, standards, or industry regulations.'
};

const SKILL_INSTRUCTIONS: Record<string, string> = {
    'balanced': 'Ensure the question tests a balance of knowledge and application.',
    'application': 'Focus on applying syllabus concepts to solve a specific problem in the scenario. Avoid simple recall.',
    'analysis': 'Focus on deconstructing relationships, causes, and effects within the scenario. Require the student to connect concepts.',
    'evaluation': 'Focus on making a judgement or assessment based on criteria. The student must weigh pros/cons or effectiveness.'
};

// --- Helper for Keyword Calculation ---
const calculateOptimalKeywordCount = (marks: number, verbTier: number = 4): number => {
    // Base count derived from marks
    let count = Math.ceil(marks * 1.5) + 2; 
    
    // Adjust based on Cognitive Tier (Higher tiers require more vocabulary for synthesis)
    if (verbTier >= 5) count += 2;
    if (verbTier <= 2) count = Math.max(4, count - 1);

    // Clamp values to reasonable limits
    return Math.max(4, Math.min(15, count));
};

// --- Business Logic & Prompts ---

export const performQualityCheck = async (content: string, type: 'question' | 'code'): Promise<QualityCheckResult> => {
    const cacheKey = AICache.generateQualityCheckKey(content, type);
    const cached = await AICache.get<QualityCheckResult>(cacheKey);
    if (cached) return cached;

    const systemInstruction = `
        You are a Senior QA Lead and Software Engineering Examiner. Your task is to review educational content (either an exam question or a code snippet) against strict quality standards.
        STRICTLY USE BRITISH/AUSTRALIAN ENGLISH SPELLING AND TERMINOLOGY (e.g. 'analyse', 'colour', 'program' for code/'programme' for TV).
        Return valid JSON matching the schema.
    `;

    const userPrompt = `
        CONTENT TYPE: ${type}
        
        CONTENT TO REVIEW:
        ---
        ${content}
        ---
        
        Perform the quality check now.
    `;

    const request = {
        model: MODELS.REASONING,
        contents: userPrompt,
        config: {
            systemInstruction,
            thinkingConfig: { thinkingBudget: 4096 },
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    status: { type: Type.STRING, enum: ["PASS", "FAIL", "WARN"] },
                    score: { type: Type.NUMBER },
                    summary: { type: Type.STRING },
                    issues: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                severity: { type: Type.STRING, enum: ["critical", "warning", "info"] },
                                message: { type: Type.STRING },
                                suggestion: { type: Type.STRING }
                            },
                            required: ["severity", "message", "suggestion"]
                        }
                    },
                    refinedContent: { type: Type.STRING }
                },
                required: ["status", "score", "summary", "issues"]
            }
        }
    };

    const response = await generateContentWithRetry(request);
    const result = safeJsonParse<QualityCheckResult>(response.text || "");
    if (!result) throw new Error("Failed to perform quality check.");
    
    await AICache.set(cacheKey, result);
    return result;
};

export const evaluateAnswer = async (answer: string, prompt: Prompt): Promise<EvaluationResult> => {
  const cacheKey = AICache.generateEvaluationKey(prompt.id, answer);
  const cached = await AICache.get<EvaluationResult>(cacheKey);
  if (cached) return cached;

  const commandTermInfo = getCommandTermInfo(prompt.verb);
  const structureGuide = getStructureGuide(prompt.totalMarks);
  
  const systemInstruction = `
    You are a ruthless, expert Senior HSC Marker for NESA (NSW Education Standards Authority).
    
    **LANGUAGE SETTING:**
    STRICTLY USE BRITISH/AUSTRALIAN ENGLISH SPELLING AND TERMINOLOGY (e.g. 'analyse', 'behaviour', 'centre').

    **MARKING RULES (STRICT ADHERENCE REQUIRED):**
    1. **No Participation Awards:** If the answer is brief, superficial, lists points without explanation, or fails to address the specific command verb (e.g., "Describe" instead of "Evaluate"), it is a Band 1 or Band 2 response (0-30% marks).
    2. **Rounding:** Do not award half marks. If a student partially meets a criteria but is not perfect, round DOWN.
    3. **Evidence Over Fluff:** Ignore length padding. Look for specific syllabus terminology and causal links.
    4. **Command Verb:** 
       - 'Identify/Outline': Simple recall.
       - 'Explain': Cause and effect.
       - 'Analyse/Evaluate': Deep critical thinking, pros/cons, and judgment.
    
    **EXPECTED STRUCTURE FOR ${prompt.totalMarks} MARKS:**
    ${structureGuide}
    
    Response must be valid JSON adhering to the schema.
  `;
  
  const request = {
    model: MODELS.REASONING,
    contents: `
      QUESTION: "${prompt.question}" (${prompt.totalMarks} marks)
      COMMAND: ${prompt.verb} (${commandTermInfo.definition})
      CRITERIA: ${prompt.markingCriteria || 'Not provided'}
      KEYWORDS: ${(prompt.keywords || []).join(', ')}

      STUDENT ANSWER:
      "${answer}"

      TASK: Evaluate strict adherence to criteria. Determine Mark. Suggest Improvements.
    `,
    config: {
      systemInstruction: systemInstruction,
      thinkingConfig: { thinkingBudget: 8192 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallMark: { type: Type.NUMBER },
          overallFeedback: { type: Type.STRING },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          criteria: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                criterion: { type: Type.STRING },
                mark: { type: Type.NUMBER },
                maxMark: { type: Type.NUMBER },
                feedback: { type: Type.STRING }
              },
              required: ['criterion', 'mark', 'maxMark', 'feedback']
            }
          },
          revisedAnswer: { 
              type: Type.OBJECT,
              properties: {
                  text: { type: Type.STRING },
                  mark: { type: Type.NUMBER },
                  keyChanges: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ['text', 'mark', 'keyChanges']
          }
        },
        required: ['overallMark', 'overallFeedback', 'strengths', 'improvements', 'criteria', 'revisedAnswer']
      }
    }
  };

  const response = await generateContentWithRetry(request);
  let result = safeJsonParse<EvaluationResult>(response.text || "");
  if (!result) throw new Error("AI returned invalid evaluation format.");
  
  // --- Strict Post-Processing Enforcement ---
  let calculatedTotal = 0;
  
  if (result.criteria && Array.isArray(result.criteria)) {
      result.criteria = result.criteria.map(c => {
          const strictMark = Math.floor(c.mark);
          calculatedTotal += strictMark;
          return { ...c, mark: strictMark };
      });
      result.overallMark = Math.min(calculatedTotal, prompt.totalMarks);
  } else {
      result.overallMark = Math.floor(Math.min(result.overallMark, prompt.totalMarks));
  }

  // DETERMINISTIC BAND CALCULATION
  result.overallBand = getBandForMark(result.overallMark, prompt.totalMarks, commandTermInfo.tier);

  if (result.revisedAnswer && typeof result.revisedAnswer !== 'string') {
      result.revisedAnswer.band = getBandForMark(result.revisedAnswer.mark, prompt.totalMarks, commandTermInfo.tier);
  }

  await AICache.set(cacheKey, result);
  return result;
};

export const improveAnswer = async (
  originalAnswer: string,
  prompt: Prompt,
  evaluation: EvaluationResult,
  targetBand: number
): Promise<string> => {
  const cacheKey = AICache.generateImproveKey(prompt.id, originalAnswer, targetBand);
  const cached = await AICache.get<string>(cacheKey);
  if (cached) return cached;

  const systemInstruction = `
    You are an expert HSC teacher. Revise the student's answer to achieve Band ${targetBand}.
    STRICTLY USE BRITISH/AUSTRALIAN ENGLISH SPELLING AND TERMINOLOGY.
  `;

  const request = {
    model: MODELS.REASONING,
    contents: `
      QUESTION: "${prompt.question}"
      ORIGINAL ANSWER: "${originalAnswer}"
      IMPROVEMENTS NEEDED: ${evaluation.improvements.join('\n')}
      
      TASK: Rewrite the answer to address improvements and meet Band ${targetBand} standards. Return ONLY the text.
    `,
    config: { 
        systemInstruction,
        thinkingConfig: { thinkingBudget: 8192 }
    }
  };

  const response = await generateContentWithRetry(request);
  const text = response.text || "";
  if (text) await AICache.set(cacheKey, text);
  return text;
};

export const enrichPromptDetails = async (prompt: Prompt, course: { name: string; outcomes: CourseOutcome[] }): Promise<Partial<Prompt>> => {
    const cacheKey = AICache.generateEnrichKey(prompt.id);
    const cached = await AICache.get<Partial<Prompt>>(cacheKey);
    if (cached) return cached;

    // Smart Keyword Calculation based on Mark + Tier
    const verbInfo = getCommandTermInfo(prompt.verb);
    const targetKeywordCount = calculateOptimalKeywordCount(prompt.totalMarks, verbInfo.tier);

    const systemInstruction = `
        You are an AI assistant that enriches exam questions with syllabus context. 
        STRICTLY USE BRITISH/AUSTRALIAN ENGLISH SPELLING AND TERMINOLOGY.
        Your response must be a single, valid JSON object.
    `;
    
    const request = {
        model: MODELS.FAST,
        contents: `
            Analyze this question: "${prompt.question}"
            Context: Course "${course.name}"
            Marks: ${prompt.totalMarks}
            
            Tasks:
            1. Create a realistic scenario/context if missing.
            2. Extract exactly ${targetKeywordCount} key syllabus terms.
            3. Identify relevant syllabus outcomes from this list: ${course.outcomes.map(o => o.code + ": " + o.description).join('; ')}
        `,
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    scenario: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    linkedOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["keywords"]
            }
        }
    };

    const response = await generateContentWithRetry(request);
    const result = safeJsonParse<Partial<Prompt>>(response.text || "");
    if (result) {
        await AICache.set(cacheKey, result);
    }
    return result || {};
};

export const generateNewPrompt = async (
  courseName: string,
  topicName: string,
  dotPoint: string,
  marks: number,
  verbs: CommandTermInfo[],
  outcomes: CourseOutcome[],
  scenarioConstraint: string = 'Random',
  skillFocus: string = 'Balanced',
  targetBand: number = 6
): Promise<Prompt> => {
    const verb = verbs[0]?.term || 'EXPLAIN';
    const verbInfo = getCommandTermInfo(verb);
    const structureGuide = getStructureGuide(marks);
    
    // Dynamic Keyword Quantity Strategy
    const keywordTarget = calculateOptimalKeywordCount(marks, verbInfo.tier);

    const bandInstruction = targetBand === 6 
        ? "Write a 'Band 6' (perfect) exemplar response." 
        : `Write a 'Band ${targetBand}' response. It should be good but contain minor flaws or lack the sophistication of a top-tier answer to simulate a student at this level.`;

    const specificScenarioInstruction = SCENARIO_INSTRUCTIONS[scenarioConstraint.toLowerCase()] || SCENARIO_INSTRUCTIONS['random'];
    const specificSkillInstruction = SKILL_INSTRUCTIONS[skillFocus.toLowerCase()] || SKILL_INSTRUCTIONS['balanced'];

    const request = {
        model: MODELS.REASONING,
        contents: `
            Act as a Senior HSC Exam Committee writer. Create a high-quality exam question based on the following specifications.
            
            **LANGUAGE SETTING:**
            STRICTLY USE BRITISH/AUSTRALIAN ENGLISH SPELLING AND TERMINOLOGY (e.g. 'analyse', 'colour', 'programme', 'behaviour').
            
            **CONTEXT:**
            Course: ${courseName}
            Topic: ${topicName}
            Syllabus Dot Point: "${dotPoint}"
            Marks: ${marks}
            Command Verb: ${verb} (Tier ${verbInfo.tier})
            
            **PARAMETERS:**
            - Scenario Type: ${scenarioConstraint} -> ${specificScenarioInstruction}
            - Skill Focus: ${skillFocus} -> ${specificSkillInstruction}
            
            **GOLD STANDARD REQUIREMENTS:**
            1. **Scenario:** Must follow the formula WHO (Specific Role) + WHAT (Constraint/Challenge) + WHY (Consequence). The scenario must be functional, meaning the question cannot be fully answered without referencing specific details from the scenario.
            2. **Keywords:** Provide exactly ${keywordTarget} keywords. You must think in three tiers (Tier 1: Syllabus Basics, Tier 2: Academic, Tier 3: Scenario Specific) but output them as a SINGLE flat list.
            3. **Marking Criteria:** Create a detailed marking rubric. Use the descending linguistic pattern (e.g., "Analyses effectively..." -> "Analyses..." -> "Explains..."). Ensure it addresses Skill, Content, Evidence, and Integration.
            4. **Sample Answer:** ${bandInstruction} It must:
               - Use PEEL structure (Point, Evidence, Explanation, Link).
               - Integrate specific scenario details explicitly.
               - Use appropriate terminology from the keywords list.
               - Meet the word count guideline for ${marks} marks.
               - Structure Guide: ${structureGuide}

            **OUTPUT FORMAT:**
            Return valid JSON matching the schema.
        `,
        config: {
            thinkingConfig: { thinkingBudget: 8192 },
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    question: { type: Type.STRING },
                    scenario: { type: Type.STRING },
                    markingCriteria: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    sampleAnswer: { type: Type.STRING }
                },
                required: ["question", "markingCriteria", "sampleAnswer", "keywords"]
            }
        }
    };

    const response = await generateContentWithRetry(request);
    const data = safeJsonParse<any>(response.text || "");
    if (!data) throw new Error("Failed to generate prompt.");

    const sampleBand = getBandForMark(marks, marks, verbInfo.tier);

    const newPrompt: Prompt = {
        id: generateId('prompt'),
        question: data.question,
        totalMarks: marks,
        verb: verb as PromptVerb,
        scenario: data.scenario,
        markingCriteria: data.markingCriteria,
        keywords: data.keywords || [],
        sampleAnswers: [{
            id: generateId('sa'),
            answer: data.sampleAnswer,
            mark: marks,
            band: sampleBand,
            source: 'AI'
        }],
        isPastHSC: false
    };
    return newPrompt;
};

export const generateSampleAnswer = async (
  prompt: Prompt,
  mark: number,
  existingAnswers: SampleAnswer[]
): Promise<SampleAnswer> => {
    const cacheKey = AICache.generateSampleAnswerKey(prompt.id, mark);
    const cached = await AICache.get<SampleAnswer>(cacheKey);
    if (cached) return { ...cached, id: generateId('sa') };

    const commandTermInfo = getCommandTermInfo(prompt.verb);
    const targetBand = getBandForMark(mark, prompt.totalMarks, commandTermInfo.tier);
    const structureGuide = getStructureGuide(mark);
    
    const keywordsList = prompt.keywords?.join(', ') || '';

    let instructions = "";
    if (mark === prompt.totalMarks) {
        instructions = `Write a perfect, full-mark response that addresses all criteria comprehensively.
        REQUIRED STRUCTURE: ${structureGuide}`;
    } else if (mark <= prompt.totalMarks / 2) {
        instructions = `Write a response that achieves EXACTLY ${mark}/${prompt.totalMarks} marks. 
        It must be INCOMPLETE or FLAWED. 
        - Omit key details.
        - Use vague terminology.
        - Fail to fully address the command verb '${prompt.verb}'.
        - DO NOT write a perfect answer. Simulate a student who has partial understanding.
        REQUIRED STRUCTURE: ${structureGuide}`;
    } else {
        instructions = `Write a response that achieves EXACTLY ${mark}/${prompt.totalMarks} marks.
        It should be good but NOT perfect.
        - Include most key points but miss a nuanced detail.
        - Minor terminology errors or lack of depth in one area.
        REQUIRED STRUCTURE: ${structureGuide}`;
    }

    const request = {
        model: MODELS.REASONING,
        contents: `
            You are an expert HSC teacher.
            STRICTLY USE BRITISH/AUSTRALIAN ENGLISH SPELLING AND TERMINOLOGY (e.g. 'analyse', 'colour', 'program' for code).
            
            Write a sample answer for this question: "${prompt.question}"
            Total Marks Available: ${prompt.totalMarks}
            TARGET MARK: ${mark}
            KEYWORDS TO INCORPORATE: ${keywordsList}
            
            ${instructions}
            
            Return only the answer text.
        `,
        config: {
            thinkingConfig: { thinkingBudget: 4096 }
        }
    };
    const response = await generateContentWithRetry(request);
    
    const answer: SampleAnswer = {
        id: generateId('sa'),
        answer: response.text || "No answer generated.",
        mark: mark,
        band: targetBand,
        source: 'AI'
    };

    await AICache.set(cacheKey, answer);
    return answer;
};

export const reviseSampleAnswer = async (
  prompt: Prompt,
  originalSample: SampleAnswer,
  targetMark: number
): Promise<SampleAnswer> => {
    const cacheKey = AICache.generateReviseKey(prompt.id, originalSample.answer, targetMark);
    const cached = await AICache.get<SampleAnswer>(cacheKey);
    if (cached) return { ...cached, id: generateId('sa') };

    const commandTermInfo = getCommandTermInfo(prompt.verb);
    const targetBand = getBandForMark(targetMark, prompt.totalMarks, commandTermInfo.tier);
    const structureGuide = getStructureGuide(targetMark);

    let instructions = "";
    if (targetMark > originalSample.mark) {
        instructions = `Improve this answer to achieve ${targetMark}/${prompt.totalMarks}. Add missing detail, use more precise terminology, and better address the command verb '${prompt.verb}'.
        NEW STRUCTURE: ${structureGuide}`;
    } else {
        instructions = `Downgrade this answer to achieve ${targetMark}/${prompt.totalMarks}. Remove specific details, make the language vaguer, or fail to fully address the command verb to simulate a lower-quality response.
        NEW STRUCTURE: ${structureGuide}`;
    }

    const request = {
        model: MODELS.REASONING,
        contents: `
            You are an expert HSC teacher.
            STRICTLY USE BRITISH/AUSTRALIAN ENGLISH SPELLING AND TERMINOLOGY.
            
            Rewrite this student answer.
            Question: "${prompt.question}"
            Original Answer (${originalSample.mark}/${prompt.totalMarks}): "${originalSample.answer}"
            
            NEW TARGET MARK: ${targetMark}/${prompt.totalMarks}
            
            ${instructions}
            
            Return only the new answer text.
        `,
        config: {
            thinkingConfig: { thinkingBudget: 4096 }
        }
    };
    const response = await generateContentWithRetry(request);
    
    const answer: SampleAnswer = {
        id: generateId('sa'),
        answer: response.text || "",
        mark: targetMark,
        band: targetBand,
        source: 'AI'
    };

    await AICache.set(cacheKey, answer);
    return answer;
};

export const generateScenarioForPrompt = async (prompt: Prompt): Promise<string> => {
    const cacheKey = AICache.generateScenarioKey(prompt.id);
    const cached = await AICache.get<string>(cacheKey);
    if (cached) return cached;

    const request = {
        model: MODELS.FAST,
        contents: `Create a concise, realistic scenario (2-3 sentences) for this exam question to give it context: "${prompt.question}". Return only the scenario text. Use British/Australian English.`
    };
    const response = await generateContentWithRetry(request);
    const text = response.text || "";
    if (text) await AICache.set(cacheKey, text);
    return text;
};

export const generateKeywordsForPrompt = async (prompt: Prompt, verbInfo: CommandTermInfo): Promise<string[]> => {
    const cacheKey = AICache.generateKeywordsKey(prompt.id);
    const cached = await AICache.get<string[]>(cacheKey);
    if (cached) return cached;

    // Dynamic keyword count calculation
    const keywordTarget = calculateOptimalKeywordCount(prompt.totalMarks, verbInfo.tier);

    const request = {
        model: MODELS.FAST,
        contents: `Extract exactly ${keywordTarget} key syllabus terms and concepts for this question: "${prompt.question}". Use British/Australian English spelling. Return valid JSON string array.`
    };
    const response = await generateContentWithRetry({ ...request, config: { responseMimeType: "application/json" }});
    const result = safeJsonParse<string[]>(response.text || "") || [];
    if (result.length > 0) await AICache.set(cacheKey, result);
    return result;
};

export const generateNewTopic = async (courseName: string, existingTopics: string[]): Promise<string> => {
    const cacheKey = AICache.generateTopicKey(courseName, existingTopics);
    const cached = await AICache.get<string>(cacheKey);
    if (cached) return cached;

    const request = {
        model: MODELS.FAST,
        contents: `Suggest a new, relevant topic name for the course "${courseName}". Existing topics: ${existingTopics.join(', ')}. Return only the topic name (British English).`
    };
    const response = await generateContentWithRetry(request);
    const text = (response.text || "").replace(/['"]/g, "").trim();
    if (text) await AICache.set(cacheKey, text);
    return text;
};

export const generateDotPointsForSubTopic = async (courseName: string, topicName: string, subTopicName: string): Promise<string[]> => {
    const cacheKey = AICache.generateDotPointsKey(courseName, topicName, subTopicName);
    const cached = await AICache.get<string[]>(cacheKey);
    if (cached) return cached;

    const request = {
        model: MODELS.FAST,
        contents: `Generate 3-5 syllabus dot points for "${subTopicName}" in the topic "${topicName}" of course "${courseName}". Use British/Australian English. Return valid JSON string array.`,
        config: { responseMimeType: "application/json" }
    };
    const response = await generateContentWithRetry(request);
    const result = safeJsonParse<string[]>(response.text || "") || [];
    if (result.length > 0) await AICache.set(cacheKey, result);
    return result;
};

export const generateSubTopicsAndDotPoints = async (courseName: string, topicName: string, syllabusText: string): Promise<SubTopic[]> => {
    const cacheKey = AICache.generateParsingKey(syllabusText, 'structure');
    const cachedRaw = await AICache.get<any[]>(cacheKey);
    
    const processParsedData = (data: any[]): SubTopic[] => {
        return data.map(st => ({
            id: generateId('subTopic'),
            name: st.name,
            dotPoints: (st.dotPoints || []).map((dp: string) => ({
                id: generateId('dp'),
                description: dp,
                prompts: []
            }))
        }));
    };

    if (cachedRaw) return processParsedData(cachedRaw);

    const request = {
        model: MODELS.REASONING,
        contents: `
            Parse this text into sub-topics and dot points for "${topicName}" in "${courseName}".
            Text: "${syllabusText}"
            Use British English spelling in output.
            Return valid JSON matching the schema.
        `,
        config: {
            thinkingConfig: { thinkingBudget: 4096 },
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        dotPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["name", "dotPoints"]
                }
            }
        }
    };
    
    const response = await generateContentWithRetry(request);
    const parsed = safeJsonParse<any[]>(response.text || "");
    if (!parsed) return [];

    await AICache.set(cacheKey, parsed);
    return processParsedData(parsed);
};

export const parseOutcomesFromText = async (text: string): Promise<CourseOutcome[]> => {
    const cacheKey = AICache.generateParsingKey(text, 'outcomes');
    const cached = await AICache.get<CourseOutcome[]>(cacheKey);
    if (cached) return cached;

    const request = {
        model: MODELS.FAST,
        contents: `Parse syllabus outcomes from this text. Return JSON array of objects with 'code' and 'description'. Use British English. Text: "${text}"`,
        config: { responseMimeType: "application/json" }
    };
    const response = await generateContentWithRetry(request);
    const result = safeJsonParse<CourseOutcome[]>(response.text || "") || [];
    if (result.length > 0) await AICache.set(cacheKey, result);
    return result;
};

export const parseSyllabusStructure = async (text: string): Promise<any[]> => {
    const cacheKey = AICache.generateParsingKey(text, 'structure');
    const cached = await AICache.get<any[]>(cacheKey);
    if (cached) return cached;

    const request = {
        model: MODELS.REASONING,
        contents: `
            Analyze this text and structure it into topics, sub-topics and dot points.
            Text: "${text}"
            Use British English spelling.
            Return a JSON array of Topic objects (name, subTopics array).
        `,
        config: {
            thinkingConfig: { thinkingBudget: 8192 },
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        subTopics: { 
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    dotPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
                                },
                                required: ["name", "dotPoints"]
                            }
                        }
                    },
                    required: ["name", "subTopics"]
                }
            }
        }
    };
    const response = await generateContentWithRetry(request);
    const result = safeJsonParse<any[]>(response.text || "") || [];
    if (result.length > 0) await AICache.set(cacheKey, result);
    return result;
};

export const fetchSyllabusContentFromUrl = async (url: string): Promise<string> => {
    const cacheKey = AICache.generateFetchUrlKey(url);
    const cached = await AICache.get<string>(cacheKey);
    if (cached) return cached;

    const request = {
        model: MODELS.REASONING,
        contents: `Retrieve and summarize the syllabus content found at this URL: ${url}. Focus on outcomes, topics, and dot points. Use British English.`,
        config: {
            thinkingConfig: { thinkingBudget: 4096 },
            tools: [{ googleSearch: {} }]
        }
    };
    const response = await generateContentWithRetry(request);
    const text = response.text || "";
    if (text) await AICache.set(cacheKey, text);
    return text;
};

export const explainOutcomeInContext = async (question: string, outcome: CourseOutcome): Promise<string> => {
    const cacheKey = AICache.generateExplanationKey(question, outcome.code);
    const cached = await AICache.get<string>(cacheKey);
    if (cached) return cached;

    const request = {
        model: MODELS.FAST,
        contents: `Explain how the syllabus outcome "${outcome.code}: ${outcome.description}" relates to the question "${question}" in 2 sentences. Use British English.`
    };
    const response = await generateContentWithRetry(request);
    const text = response.text || "";
    if (text) await AICache.set(cacheKey, text);
    return text;
};

export const suggestOutcomesForPrompt = async (question: string, outcomes: CourseOutcome[], marks: number): Promise<string[]> => {
    const cacheKey = AICache.generateOutcomeSuggestionKey(question);
    const cached = await AICache.get<string[]>(cacheKey);
    if (cached) return cached;

    const request = {
        model: MODELS.FAST,
        contents: `
            Select the most relevant syllabus outcome codes for this question from the provided list.
            Question: "${question}"
            Outcomes: ${outcomes.map(o => `${o.code}: ${o.description}`).join('\n')}
            Return JSON string array of codes.
        `,
        config: { responseMimeType: "application/json" }
    };
    const response = await generateContentWithRetry(request);
    const result = safeJsonParse<string[]>(response.text || "") || [];
    if (result.length > 0) await AICache.set(cacheKey, result);
    return result;
};
