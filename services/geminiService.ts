// ... existing imports ...
import { Type } from '@google/genai';
import { AICache } from './aiCache';
import {
  Prompt,
  CourseOutcome,
  CommandTermInfo,
  SampleAnswer,
  EvaluationResult,
  SubTopic,
  QualityCheckResult,
  PromptVerb,
  Topic,
  Course,
} from '../types';
import {
  generateContentWithRetry,
  safeJsonParse,
  apiGuard,
  apiMonitor,
  ApiStatus,
  ApiMonitorStatus,
  ApiKeyError,
  QuotaExceededError,
  ERROR_THRESHOLD,
} from './aiCore';
import { getCommandTermInfo, getCommandTermsForMarks } from '../data/commandTerms';
import { generateId } from '../utils/idUtils';

// Re-export core utilities for consumers
export {
  apiGuard,
  apiMonitor,
  type ApiStatus,
  type ApiMonitorStatus,
  ApiKeyError,
  QuotaExceededError,
  ERROR_THRESHOLD,
};

const MODELS = {
  BASIC: 'gemini-3-flash-preview',
  REASONING: 'gemini-3-pro-preview',
};

// ... (keep existing functions like refineManualPrompt, generateNewPrompt, generateSampleAnswer, parseOutcomesFromText, parseSyllabusStructure, fetchSyllabusContentFromUrl, generateNewTopic, generateDotPointsForSubTopic, generateSubTopicsAndDotPoints, generateRubricForPrompt, explainOutcomeInContext) ...

export const evaluateAnswer = async (
  answer: string,
  prompt: Prompt,
  tierInfo?: CommandTermInfo
): Promise<EvaluationResult> => {
  const termInfo = tierInfo || getCommandTermInfo(prompt.verb);

  // Sort samples by mark to provide a clear scale
  // Copy array before sorting to avoid mutating read-only props from Immer/React
  const sortedSamples = [...(prompt.sampleAnswers || [])].sort((a, b) => a.mark - b.mark);

  const benchmarks =
    sortedSamples.length > 0
      ? sortedSamples
          .map(
            (s) =>
              `[BENCHMARK SAMPLE: ${s.mark}/${prompt.totalMarks} Marks]\n${s.answer}\n[Marker Notes]: ${s.feedback}\n`
          )
          .join('\n')
      : 'No benchmark samples provided. Rely strictly on the rubric.';

  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `
                    Act as a Senior NESA HSC Marker. Your goal is **Precision** and **Consistency**.
                    
                    ### THE TASK
                    Mark the student response for the question below.
                    
                    ### QUESTION DATA
                    **Question:** "${prompt.question}"
                    **Max Marks:** ${prompt.totalMarks}
                    **Command Verb:** ${prompt.verb} (Cognitive Tier ${termInfo.tier} - ${termInfo.definition})
                    **Syllabus Keywords:** ${prompt.keywords?.join(', ') || 'None'}
                    
                    ### MARKING RUBRIC
                    ${prompt.markingCriteria}

                    ### CALIBRATION BENCHMARKS (GROUND TRUTH)
                    Use these samples to anchor your marking. 
                    - If the student's answer is qualitatively similar to a 2-mark sample, give 2 marks.
                    - Do not inflate marks. Be objective.
                    ${benchmarks}

                    ### STUDENT RESPONSE
                    "${answer}"

                    ### EVALUATION LOGIC
                    1. **Identify the Verb**: Does the response meet the cognitive demand of '${prompt.verb}'? (e.g. If it only 'Describes' when asked to 'Analyse', cap the marks).
                    2. **Check Content**: Are the keywords used correctly in context?
                    3. **Compare to Benchmarks**: Is this answer better, worse, or equal to the benchmarks?
                    4. **Determine Mark**: Assign an integer mark.
                    5. **Generate Coach's Tip**: Identify the single most effective action to improve.
                       - **Style**: Short, punchy, imperative (max 15 words). Plain English. No fluff.
                       - **Band-Specific Strategy**:
                         - **Low Band (1-3)**: Focus on volume, basic definitions, or attempting the verb. (e.g. "Too short. Write more to score marks.", "Don't list—explain why.")
                         - **Mid Band (4-5)**: Focus on depth, specific terminology, or linking concepts. (e.g. "Swap generic words for syllabus keywords.", "Link cause and effect clearly.")
                         - **High Band (6)**: Focus on precision, judgement, or sophisticated structuring. (e.g. "Make your judgement explicit.", "Refine wording to match exam language.")
                       - **Focus**: Target the ONE thing that lifts them to the next band.

                    ### OUTPUT FORMAT (JSON)
                    Return valid JSON adhering to the schema.
                `,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      // Enable thinking to allow for comparison and calibration steps
      thinkingConfig: { thinkingBudget: 4096 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallMark: { type: Type.INTEGER },
          overallBand: { type: Type.INTEGER },
          overallFeedback: { type: Type.STRING },
          quickTip: {
            type: Type.STRING,
            description:
              'A catchy, single-sentence coaching tip (max 15 words) in plain English focusing on the #1 impactful fix.',
          },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          criteria: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                criterion: { type: Type.STRING },
                mark: { type: Type.INTEGER },
                maxMark: { type: Type.INTEGER },
                feedback: { type: Type.STRING },
              },
              required: ['criterion', 'mark', 'maxMark', 'feedback'],
            },
          },
          revisedAnswer: { type: Type.STRING },
        },
        required: [
          'overallMark',
          'overallBand',
          'overallFeedback',
          'quickTip',
          'strengths',
          'improvements',
          'criteria',
          'revisedAnswer',
        ],
      },
    },
  };

  const response = await generateContentWithRetry(request);
  const data = safeJsonParse<EvaluationResult>(response.text || '');
  if (!data) throw new Error('Evaluation failed.');

  // Sanity checks - comprehensive bounds validation
  data.overallMark = Math.max(0, Math.min(data.overallMark, prompt.totalMarks));
  data.overallBand = Math.max(1, Math.min(data.overallBand, 6));

  // Validate criteria marks are within bounds
  if (Array.isArray(data.criteria)) {
    for (const c of data.criteria) {
      if (typeof c.maxMark === 'number' && typeof c.mark === 'number') {
        c.mark = Math.max(0, Math.min(c.mark, c.maxMark));
      }
    }
  }

  // Ensure required arrays exist
  if (!Array.isArray(data.strengths)) data.strengths = [];
  if (!Array.isArray(data.improvements)) data.improvements = [];
  if (!Array.isArray(data.criteria)) data.criteria = [];

  return data;
};

// ... (keep remaining functions like improveAnswer, enrichPromptDetails, etc.) ...
export const improveAnswer = async (
  answer: string,
  prompt: Prompt,
  evaluation: EvaluationResult,
  targetBand: number
): Promise<string> => {
  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `Improve this answer to achieve Band ${targetBand} standard.
                       Question: ${prompt.question}
                       Original: "${answer}"
                       Feedback to address: ${evaluation.overallFeedback}
                       
                       Return only the improved answer text.`,
        },
      ],
    },
  };
  const response = await generateContentWithRetry(request);
  return response.text || '';
};

export const enrichPromptDetails = async (
  prompt: Prompt,
  context: { name: string; outcomes: CourseOutcome[] }
): Promise<{ scenario: string; keywords: string[]; linkedOutcomes: string[] }> => {
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `Enrich this exam question with a scenario, keywords, and linked outcomes.
                       Course: ${context.name}
                       Question: "${prompt.question}"
                       Available Outcomes: ${JSON.stringify(context.outcomes.map((o) => o.code))}
                       
                       Return JSON: { "scenario": string, "keywords": string[], "linkedOutcomes": string[] }`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
    },
  };

  const response = await generateContentWithRetry(request);
  const data = safeJsonParse<any>(response.text || '');
  return data || { scenario: '', keywords: [], linkedOutcomes: [] };
};

export const generateScenarioForPrompt = async (prompt: Prompt): Promise<string> => {
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `Write a realistic scenario (2-3 sentences) for this exam question: "${prompt.question}".`,
        },
      ],
    },
  };
  const response = await generateContentWithRetry(request);
  return response.text || '';
};

export const generateKeywordsForPrompt = async (
  prompt: Prompt,
  termInfo: CommandTermInfo
): Promise<string[]> => {
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `Extract 5-10 key technical terms for this question: "${prompt.question}". 
                       Verb is ${termInfo.term}. Return JSON string array.`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
    },
  };
  const response = await generateContentWithRetry(request);
  return safeJsonParse<string[]>(response.text || '') || [];
};

export const suggestOutcomesForPrompt = async (
  question: string,
  outcomes: CourseOutcome[],
  marks: number
): Promise<string[]> => {
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `Select the most relevant outcome codes for this question: "${question}".
                       Outcomes: ${JSON.stringify(outcomes)}.
                       Return JSON string array of codes.`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
    },
  };
  const response = await generateContentWithRetry(request);
  return safeJsonParse<string[]>(response.text || '') || [];
};

export const reviseSampleAnswer = async (
  prompt: Prompt,
  sample: SampleAnswer,
  targetMark: number
): Promise<SampleAnswer> => {
  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `Rewrite this answer to score exactly ${targetMark}/${prompt.totalMarks}.
                       Question: ${prompt.question}
                       Original Answer: "${sample.answer}"
                       
                       Return JSON: { "answer": string, "feedback": string }`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
    },
  };

  const response = await generateContentWithRetry(request);
  const data = safeJsonParse<any>(response.text || '');
  if (!data) throw new Error('Revision failed.');

  return {
    id: generateId('sa'),
    answer: data.answer,
    mark: targetMark,
    band: Math.min(6, Math.ceil((targetMark / prompt.totalMarks) * 6)),
    source: 'AI',
    feedback: data.feedback,
  };
};

export const performQualityCheck = async (
  content: string,
  type: 'question' | 'code'
): Promise<QualityCheckResult> => {
  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `Analyze the quality of this ${type}:
                       "${content}"
                       
                       Return JSON:
                       {
                           "status": "PASS" | "WARN" | "FAIL",
                           "score": number (0-100),
                           "summary": string,
                           "issues": [{ "severity": "critical"|"warning"|"info", "message": string, "suggestion": string }],
                           "refinedContent": string (optional improved version)
                       }`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
    },
  };

  const response = await generateContentWithRetry(request);
  const data = safeJsonParse<QualityCheckResult>(response.text || '');
  if (!data) throw new Error('Quality check failed.');
  return data;
};

// ... (keep existing exports) ...
export const refineManualPrompt = async (
  rawInput: string,
  courseName: string,
  topicName: string,
  outcomes: CourseOutcome[],
  targetMarks: number = 5
): Promise<Prompt> => {
  const cacheKey = AICache.generatePromptKey(`manual-${Date.now()}`, rawInput + targetMarks);

  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `
                    You are an expert NESA Exam Writer. 
                    A teacher has provided a rough draft or concept for a question. 
                    Your task is to refine it into a Gold Standard HSC Question worth exactly ${targetMarks} marks.

                    **LANGUAGE SETTING:**
                    STRICTLY USE BRITISH/AUSTRALIAN ENGLISH SPELLING AND TERMINOLOGY (e.g. 'analyse', 'colour', 'programme', 'behaviour').

                    **CONTEXT:**
                    Course: ${courseName}
                    Topic: ${topicName}
                    Raw Input: "${rawInput}"
                    Target Marks: ${targetMarks}
                    Available Outcomes: ${JSON.stringify(outcomes.map((o) => ({ code: o.code, desc: o.description })))}

                    **REQUIREMENTS:**
                    1. **Select Verb**: You MUST select a NESA Command Verb that is appropriate for a ${targetMarks}-mark question. 
                       - 1-3 marks: Identify, Outline, Describe, Define, Calculate.
                       - 4-6 marks: Explain, Compare, Contrast, Analyse, Distinguish.
                       - 7+ marks: Evaluate, Assess, Justify, Discuss, Critically Analyse.
                    2. **Refine the Question**: Rewrite the raw input to use formal academic language and your selected verb.
                    3. **Create a Scenario**: Write a realistic, industry-relevant scenario (Who/What/Why) that gives context to the question.
                    4. **Select Outcomes**: Pick 1-3 outcome codes from the provided list that best match the question.
                    5. **Marking Criteria**: Create a descending marking rubric (e.g., "[Mark] marks: [Descriptor]").
                    6. **Keywords**: Extract 5-10 key technical terms.

                    **OUTPUT:**
                    Return valid JSON matching the schema.
                `,
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingBudget: 4096 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          verb: { type: Type.STRING },
          totalMarks: { type: Type.NUMBER },
          scenario: { type: Type.STRING },
          markingCriteria: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          linkedOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'question',
          'verb',
          'totalMarks',
          'scenario',
          'markingCriteria',
          'linkedOutcomes',
        ],
      },
    },
  };

  const response = await generateContentWithRetry(request);
  const data = safeJsonParse<any>(response.text || '');
  if (!data) throw new Error('Failed to refine prompt.');

  let verb = data.verb.toUpperCase();
  const verbInfo = getCommandTermInfo(verb as PromptVerb);
  if (verbInfo.term === 'EXPLAIN' && verb !== 'EXPLAIN') {
    const extracted = getCommandTermInfo(data.question.split(' ')[0].toUpperCase() as PromptVerb);
    verb = extracted.term;
  }

  const newPrompt: Prompt = {
    id: generateId('prompt'),
    question: data.question,
    totalMarks: data.totalMarks,
    verb: verb as PromptVerb,
    scenario: data.scenario,
    markingCriteria: data.markingCriteria,
    keywords: data.keywords || [],
    linkedOutcomes: data.linkedOutcomes || [],
    sampleAnswers: [],
    isPastHSC: false,
  };

  return newPrompt;
};

export const generateNewPrompt = async (
  courseName: string,
  topicName: string,
  dotPoint: string,
  marks: number,
  verbs: CommandTermInfo[],
  outcomes: CourseOutcome[],
  scenarioType?: string,
  skillFocus?: string,
  targetBand?: number
): Promise<Prompt> => {
  const verbList = verbs.map((v) => v.term).join(', ');

  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `
                    Create a high-quality HSC exam question for ${courseName} - ${topicName}.
                    Syllabus Dot Point: "${dotPoint}"
                    Target Marks: ${marks}
                    Allowed Verbs: ${verbList}
                    ${scenarioType ? `Scenario Type: ${scenarioType}` : ''}
                    ${skillFocus ? `Skill Focus: ${skillFocus}` : ''}
                    ${targetBand ? `Target Band Difficulty: ${targetBand}` : ''}
                    
                    Generate a JSON object with:
                    - question (The exam question text)
                    - verb (One of the allowed verbs)
                    - scenario (A realistic context paragraph)
                    - markingCriteria (A detailed marking rubric text)
                    - keywords (List of 5-10 technical terms)
                    - linkedOutcomes (Array of outcome codes relevant to this question from: ${JSON.stringify(outcomes.map((o) => o.code))})
                `,
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingBudget: 4096 },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          verb: { type: Type.STRING },
          scenario: { type: Type.STRING },
          markingCriteria: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          linkedOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['question', 'verb', 'scenario', 'markingCriteria', 'linkedOutcomes'],
      },
    },
  };

  const response = await generateContentWithRetry(request);
  const data = safeJsonParse<any>(response.text || '');
  if (!data) throw new Error('Failed to generate prompt.');

  return {
    id: generateId('prompt'),
    question: data.question,
    totalMarks: marks,
    verb: data.verb as PromptVerb,
    scenario: data.scenario,
    markingCriteria: data.markingCriteria,
    keywords: data.keywords || [],
    linkedOutcomes: data.linkedOutcomes || [],
    sampleAnswers: [],
    isPastHSC: false,
  };
};

export const generateSampleAnswer = async (
  prompt: Prompt,
  mark: number,
  existingAnswers: SampleAnswer[]
): Promise<SampleAnswer> => {
  // Generate tailored instructions based on the mark relative to total marks
  const targetPercentage = mark / prompt.totalMarks;
  let qualityInstruction = '';

  if (targetPercentage >= 0.9) {
    qualityInstruction = `Write a **perfect Band 6 exemplar**. It must be sophisticated, using high-modality language, specific industry terminology, and fully addressing the implications of the verb '${prompt.verb}'.`;
  } else if (targetPercentage >= 0.7) {
    qualityInstruction = `Write a **Band 5 response**. It should be detailed and accurate but might miss a subtle nuance or a final synthesis link that a Band 6 would have.`;
  } else if (targetPercentage >= 0.5) {
    qualityInstruction = `Write a **Band 3/4 response**. It should be sound but generic. Use 'Describe' logic even if the verb is 'Explain'. Use general terms instead of specific syllabus keywords.`;
  } else {
    qualityInstruction = `Write a **Band 2 response**. It should be superficial, fragmented, or merely define terms without relating them to the scenario.`;
  }

  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `
                    Write a sample answer for the following HSC question.
                    
                    **Context:**
                    - Question: "${prompt.question}"
                    - Verb: ${prompt.verb}
                    - Scenario: ${prompt.scenario || 'None'}
                    - Target Mark: ${mark}/${prompt.totalMarks}
                    
                    **Directives:**
                    ${qualityInstruction}
                    - Do NOT include the mark at the start of the text.
                    - Provide marker's feedback explaining EXACTLY why this answer gets ${mark}/${prompt.totalMarks}.
                    
                    Return JSON:
                    { "answer": string, "feedback": string }
                `,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          feedback: { type: Type.STRING },
        },
        required: ['answer', 'feedback'],
      },
    },
  };

  const response = await generateContentWithRetry(request);
  const data = safeJsonParse<any>(response.text || '');
  if (!data) throw new Error('Failed to generate sample answer.');

  return {
    id: generateId('sa'),
    answer: data.answer,
    mark: mark,
    band: Math.min(6, Math.ceil((mark / prompt.totalMarks) * 6)), // Approximate band
    source: 'AI',
    feedback: data.feedback,
  };
};

export const parseOutcomesFromText = async (text: string): Promise<CourseOutcome[]> => {
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `
                    Extract syllabus outcomes from the following text.
                    Text: "${text}"
                    
                    Return a JSON array of objects with 'code' and 'description'.
                `,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            code: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ['code', 'description'],
        },
      },
    },
  };

  const response = await generateContentWithRetry(request);
  return safeJsonParse<CourseOutcome[]>(response.text || '') || [];
};

export const parseSyllabusStructure = async (content: string): Promise<any> => {
  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `
                    Analyze the following syllabus text and extract the structure.
                    Identify Topics, Sub-Topics, and Dot Points.
                    
                    Text: "${content.slice(0, 30000)}" 
                    
                    Return JSON structure:
                    [
                        {
                            "name": "Topic Name",
                            "subTopics": [
                                {
                                    "name": "Sub-Topic Name",
                                    "dotPoints": ["Dot Point 1", "Dot Point 2"]
                                }
                            ]
                        }
                    ]
                `,
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingBudget: 4096 },
      responseMimeType: 'application/json',
    },
  };

  const response = await generateContentWithRetry(request);
  return safeJsonParse(response.text || '');
};

export const fetchSyllabusContentFromUrl = async (url: string): Promise<string> => {
  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `Retrieve the main syllabus content from this URL: ${url}. 
                       Focus on course outcomes, topics, and dot points. 
                       Ignore navigation menus and footers.
                       Return the content as plain text.`,
        },
      ],
    },
    config: {
      tools: [{ googleSearch: {} }],
    },
  };

  const response = await generateContentWithRetry(request);
  return response.text || '';
};

export const generateNewTopic = async (
  courseName: string,
  existingTopics: string[]
): Promise<string> => {
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `Suggest a new, distinct syllabus topic name for the course "${courseName}".
                       Existing topics are: ${existingTopics.join(', ')}.
                       Return only the topic name.`,
        },
      ],
    },
  };
  const response = await generateContentWithRetry(request);
  return (response.text || '').trim();
};

export const generateDotPointsForSubTopic = async (
  courseName: string,
  topicName: string,
  subTopicName: string
): Promise<string[]> => {
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `Generate 3-5 standard syllabus dot points for:
                       Course: ${courseName}
                       Topic: ${topicName}
                       Sub-Topic: ${subTopicName}
                       
                       Return as a JSON array of strings.`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  };
  const response = await generateContentWithRetry(request);
  return safeJsonParse<string[]>(response.text || '') || [];
};

export const generateSubTopicsAndDotPoints = async (
  courseName: string,
  topicName: string,
  content: string
): Promise<SubTopic[]> => {
  const request = {
    model: MODELS.REASONING,
    contents: {
      parts: [
        {
          text: `Based on the following content, generate sub-topics and dot points for ${courseName} - ${topicName}.
                       Content: "${content.slice(0, 10000)}"
                       
                       Return JSON array of SubTopic objects (name, dotPoints array of strings).`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
    },
  };

  const response = await generateContentWithRetry(request);
  const rawData = safeJsonParse<any[]>(response.text || '');
  if (!rawData) return [];

  return rawData.map((st) => ({
    id: generateId('subTopic'),
    name: st.name,
    dotPoints: (st.dotPoints || []).map((dp: string) => ({
      id: generateId('dp'),
      description: dp,
      prompts: [],
    })),
  }));
};

export const generateRubricForPrompt = async (
  prompt: Prompt,
  outcomes: CourseOutcome[]
): Promise<string> => {
  const termInfo = getCommandTermInfo(prompt.verb);
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `Create a marking rubric for this question: "${prompt.question}" (${prompt.totalMarks} marks).
                       Verb: ${prompt.verb} (Cognitive Tier: ${termInfo.tier}).
                       
                       **Requirements:**
                       - Create a distinct criteria row for EACH mark range (e.g. 5 marks, 3-4 marks, etc.).
                       - Format in descending order (highest marks first).
                       - For full marks, criteria MUST demand the full cognitive depth of '${prompt.verb}' (e.g. if Analyse, must require 'relationship/implication', not just 'description').
                       - Lower marks should reflect a drop in cognitive skill (e.g. 'Describes' instead of 'Explains').
                       - Return PLAIN TEXT in format: "X marks: Criteria..."`,
        },
      ],
    },
  };
  const response = await generateContentWithRetry(request);
  return response.text || '';
};

export const explainOutcomeInContext = async (
  question: string,
  outcome: CourseOutcome
): Promise<string> => {
  const request = {
    model: MODELS.BASIC,
    contents: {
      parts: [
        {
          text: `Explain how the question "${question}" relates to the syllabus outcome "${outcome.code}: ${outcome.description}".`,
        },
      ],
    },
  };
  const response = await generateContentWithRetry(request);
  return response.text || '';
};
