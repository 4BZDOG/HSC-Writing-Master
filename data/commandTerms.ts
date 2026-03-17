import { CommandTermInfo, PromptVerb } from '../types';

const TIER_COLORS = [
  {
    color: 'text-red-300 light:text-red-700 print:text-red-700',
    bg: 'bg-red-900/30 light:bg-red-100 print:bg-red-100',
  }, // Tier 0 (fallback)
  {
    color: 'text-red-300 light:text-red-700 print:text-red-700',
    bg: 'bg-red-900/30 light:bg-red-100 print:bg-red-100',
  }, // Tier 1
  {
    color: 'text-orange-300 light:text-orange-700 print:text-orange-700',
    bg: 'bg-orange-900/30 light:bg-orange-100 print:bg-orange-100',
  }, // Tier 2
  {
    color: 'text-yellow-300 light:text-yellow-700 print:text-yellow-700',
    bg: 'bg-yellow-900/30 light:bg-yellow-100 print:bg-yellow-100',
  }, // Tier 3
  {
    color: 'text-green-300 light:text-green-700 print:text-green-700',
    bg: 'bg-green-900/30 light:bg-green-100 print:bg-green-100',
  }, // Tier 4
  {
    color: 'text-sky-300 light:text-sky-700 print:text-sky-700',
    bg: 'bg-sky-900/30 light:bg-sky-100 print:bg-sky-100',
  }, // Tier 5
  {
    color: 'text-purple-300 light:text-purple-700 print:text-purple-700',
    bg: 'bg-purple-900/30 light:bg-purple-100 print:bg-purple-100',
  }, // Tier 6
];

export const TIER_GROUPS = [
  {
    level: 1,
    title: 'Retrieving & Recalling',
    subtitle: 'Remember facts or locate information without changing it.',
    emoji: '🧠',
    tier: 1,
    maxBand: 2,
  },
  {
    level: 2,
    title: 'Comprehending & Describing',
    subtitle: 'Show understanding by organizing or describing.',
    emoji: '📝',
    tier: 2,
    maxBand: 3,
  },
  {
    level: 3,
    title: 'Applying & Demonstrating',
    subtitle: 'Use knowledge to solve a problem or build an answer.',
    emoji: '🔧',
    tier: 3,
    maxBand: 4,
  },
  {
    level: 4,
    title: 'Analysing & Connecting',
    subtitle: 'Break down info, find relationships, and explain why.',
    emoji: '🔍',
    tier: 4,
    maxBand: 5,
  },
  {
    level: 5,
    title: 'Synthesising & Arguing',
    subtitle: 'Bring ideas together or provide a supported point of view.',
    emoji: '⚖️',
    tier: 5,
    maxBand: 6,
  },
  {
    level: 6,
    title: 'Evaluating & Judging',
    subtitle: 'Determine value, quality, or validity using criteria.',
    emoji: '🏆',
    tier: 6,
    maxBand: 6,
  },
];

export const commandTermsList: Omit<CommandTermInfo, 'tailwind'>[] = [
  // --- Level 1: Retrieving & Recalling ---
  {
    term: 'IDENTIFY',
    definition: 'Recognise and name.',
    tier: 1,
    markRange: [1, 2],
    targetBands: '1-2',
    bandDiscrimination: 'Accuracy of identification.',
    genericMarkingGuide: ['1 mark: Correctly identifies the item/concept.'],
    structuralKeywords: ['is', 'are', 'named'],
    exampleQuestion: 'Identify three renewable energy sources from the text provided.',
  },
  {
    term: 'STATE',
    definition: 'Provide information without elaboration.',
    tier: 1,
    markRange: [1, 2],
    targetBands: '1-2',
    bandDiscrimination: 'Accuracy of the stated fact.',
    genericMarkingGuide: ['1 mark: Correctly states the information.'],
    structuralKeywords: ['state', 'give', 'name'],
    exampleQuestion: 'State the boiling point of water.',
  },
  {
    term: 'RECALL',
    definition: 'Present remembered ideas, facts or experiences.',
    tier: 1,
    markRange: [1, 2],
    targetBands: '1-2',
    bandDiscrimination: 'Accuracy of recalled facts.',
    genericMarkingGuide: ['1 mark: Correctly recalls the specific fact or idea.'],
    structuralKeywords: ['state', 'list'],
    exampleQuestion: 'Recall the formula for calculating the area of a circle.',
  },
  {
    term: 'DEFINE',
    definition: 'State meaning and identify essential qualities.',
    tier: 1,
    markRange: [1, 3],
    targetBands: '1-3',
    bandDiscrimination: 'Precision of definition and essential qualities.',
    genericMarkingGuide: [
      '1 mark: Basic definition.',
      '2 marks: Comprehensive definition with essential qualities.',
    ],
    structuralKeywords: ['means', 'refers to', 'is defined as'],
    exampleQuestion: "Define the term 'osmosis'.",
  },
  {
    term: 'EXTRACT',
    definition: 'Choose relevant and/or appropriate details.',
    tier: 1,
    markRange: [1, 2],
    targetBands: '1-2',
    bandDiscrimination: 'Relevance of extracted details.',
    genericMarkingGuide: ['1 mark: Extracts the correct information.'],
    structuralKeywords: ['from', 'data', 'source'],
    exampleQuestion: 'Extract the population data for 1990 from the table.',
  },
  {
    term: 'RECOUNT',
    definition: 'Retell a series of events.',
    tier: 1,
    markRange: [2, 4],
    targetBands: '1-3',
    bandDiscrimination: 'Sequence and accuracy of events.',
    genericMarkingGuide: [
      '1 mark: Basic list of events.',
      '2-3 marks: Accurate sequence of key events.',
    ],
    structuralKeywords: ['then', 'after', 'following', 'next'],
    exampleQuestion: 'Recount the events leading up to the signing of the treaty.',
  },

  // --- Level 2: Comprehending & Describing ---
  {
    term: 'OUTLINE',
    definition: 'Sketch in general terms; indicate the main features of.',
    tier: 2,
    markRange: [2, 4],
    targetBands: '2-4',
    bandDiscrimination: 'Coverage of main features.',
    genericMarkingGuide: ['1 mark per main feature outlined.'],
    structuralKeywords: ['mainly', 'features', 'overview', 'briefly'],
    exampleQuestion: 'Outline the main stages of the water cycle.',
  },
  {
    term: 'DESCRIBE',
    definition: 'Provide characteristics and features.',
    tier: 2,
    markRange: [3, 5],
    targetBands: '2-5',
    bandDiscrimination: 'Detail and accuracy of characteristics.',
    genericMarkingGuide: [
      '1-2 marks: Identifies characteristics.',
      '3+ marks: Provides detailed description of features.',
    ],
    structuralKeywords: ['characteristics', 'features', 'consists of', 'looks like'],
    exampleQuestion: 'Describe the appearance and properties of sedimentary rock.',
  },
  {
    term: 'CLARIFY',
    definition: 'Make clear or plain.',
    tier: 2,
    markRange: [2, 4],
    targetBands: '2-4',
    bandDiscrimination: 'Clarity and removal of ambiguity.',
    genericMarkingGuide: [
      '1 mark: Identifies the ambiguity.',
      '2+ marks: Clearly explains to resolve confusion.',
    ],
    structuralKeywords: ['specifically', 'meaning', 'clarification', 'in other words'],
    exampleQuestion: 'Clarify the difference between a bill and an act of parliament.',
  },
  {
    term: 'SUMMARISE',
    definition: 'Express, concisely, the relevant details.',
    tier: 2,
    markRange: [3, 5],
    targetBands: '2-5',
    bandDiscrimination: 'Conciseness and relevance of details.',
    genericMarkingGuide: [
      '1 mark: Identifies main points.',
      '2+ marks: Concisely links main points without unnecessary detail.',
    ],
    structuralKeywords: ['in summary', 'briefly', 'overall', 'key points'],
    exampleQuestion: 'Summarise the author’s main argument in the first chapter.',
  },
  {
    term: 'CLASSIFY',
    definition: 'Arrange or include in classes/categories.',
    tier: 2,
    markRange: [2, 4],
    targetBands: '2-4',
    bandDiscrimination: 'Accuracy of categorisation.',
    genericMarkingGuide: [
      '1 mark: Correct classification.',
      '2 marks: Justification for classification if required.',
    ],
    structuralKeywords: ['category', 'class', 'group', 'type'],
    exampleQuestion: 'Classify the following animals as either mammals, reptiles, or amphibians.',
  },

  // --- Level 3: Applying & Demonstrating ---
  {
    term: 'CALCULATE',
    definition: 'Ascertain/determine from given facts, figures or information.',
    tier: 3,
    markRange: [2, 4],
    targetBands: '3-5',
    bandDiscrimination: 'Accuracy of calculation and showing working.',
    genericMarkingGuide: [
      '1 mark: Correct method/formula.',
      '1 mark: Correct working.',
      '1 mark: Correct answer with units.',
    ],
    structuralKeywords: ['equals', 'result', 'sum', 'formula'],
    exampleQuestion: 'Calculate the velocity of the car based on the distance and time provided.',
  },
  {
    term: 'APPLY',
    definition: 'Use in a different, new or unfamiliar situation.',
    tier: 3,
    markRange: [3, 6],
    targetBands: '3-6',
    bandDiscrimination: 'Appropriateness of application to the new context.',
    genericMarkingGuide: [
      '1-2 marks: Identifies relevant principle.',
      '3+ marks: Correctly applies principle to the specific scenario.',
    ],
    structuralKeywords: ['using', 'applying', 'in this case', 'scenario'],
    exampleQuestion:
      'Apply the principle of supply and demand to explain the recent rise in coffee prices.',
  },
  {
    term: 'DEMONSTRATE',
    definition: 'Show by example.',
    tier: 3,
    markRange: [3, 6],
    targetBands: '3-6',
    bandDiscrimination: 'Clarity and relevance of the example.',
    genericMarkingGuide: [
      '1 mark: States the concept.',
      '2+ marks: Provides a clear, relevant example showing the concept in action.',
    ],
    structuralKeywords: ['for example', 'such as', 'shown by', 'illustrates'],
    exampleQuestion: 'Demonstrate how to safely handle chemicals in the laboratory.',
  },
  {
    term: 'CONSTRUCT',
    definition: 'Make; build; put together items or arguments.',
    tier: 3,
    markRange: [3, 6],
    targetBands: '3-6',
    bandDiscrimination: 'Logical assembly and completeness.',
    genericMarkingGuide: [
      '1 mark: Basic elements present.',
      '2+ marks: Logical, coherent structure or build.',
    ],
    structuralKeywords: ['build', 'create', 'develop', 'timeline', 'plan'],
    exampleQuestion: 'Construct a timeline showing the major battles of World War II.',
  },

  // --- Level 4: Analysing & Connecting ---
  {
    term: 'COMPARE',
    definition: 'Show how things are similar or different.',
    tier: 4,
    markRange: [4, 8],
    targetBands: '4-6',
    bandDiscrimination: 'Breadth of comparison (both similarities and differences).',
    genericMarkingGuide: [
      '1-2 marks: Similarities.',
      '1-2 marks: Differences.',
      '1 mark: Synthesis/Conclusion.',
    ],
    structuralKeywords: ['similarly', 'likewise', 'however', 'whereas', 'both'],
    exampleQuestion: 'Compare the themes of love in Romeo and Juliet and The Great Gatsby.',
  },
  {
    term: 'CONTRAST',
    definition: 'Show how things are different or opposite.',
    tier: 4,
    markRange: [4, 6],
    targetBands: '4-6',
    bandDiscrimination: 'Depth of difference analysis.',
    genericMarkingGuide: ['1 mark per valid point of contrast explained.'],
    structuralKeywords: ['unlike', 'on the other hand', 'conversely', 'differs'],
    exampleQuestion: 'Contrast the political systems of a democracy and a dictatorship.',
  },
  {
    term: 'DISTINGUISH',
    definition:
      'Recognise or note/indicate as being distinct or different from; to note differences between.',
    tier: 4,
    markRange: [3, 5],
    targetBands: '3-6',
    bandDiscrimination: 'Precision of distinction.',
    genericMarkingGuide: [
      '1 mark: Identifies the entities.',
      '2+ marks: Clearly explains the distinguishing factor(s).',
    ],
    structuralKeywords: ['distinct', 'difference', 'unique', 'separates'],
    exampleQuestion: 'Distinguish between viral and bacterial infections.',
  },
  {
    term: 'EXPLAIN',
    definition:
      'Relate cause and effect; make the relationships between things evident; provide why and/or how.',
    tier: 4,
    markRange: [3, 6],
    targetBands: '3-6',
    bandDiscrimination: 'Clarity of cause-effect relationship.',
    genericMarkingGuide: [
      '1 mark: Identifies cause.',
      '1 mark: Identifies effect.',
      '1-2 marks: Explains the link/relationship.',
    ],
    structuralKeywords: ['because', 'therefore', 'consequently', 'due to', 'leads to'],
    exampleQuestion: 'Explain why the Industrial Revolution began in Britain.',
  },
  {
    term: 'INTERPRET',
    definition: 'Draw meaning from.',
    tier: 4,
    markRange: [3, 6],
    targetBands: '4-6',
    bandDiscrimination: 'Insightfulness of meaning drawn.',
    genericMarkingGuide: [
      '1 mark: Basic reading of data.',
      '2+ marks: Infers meaning or trends from the data/text.',
    ],
    structuralKeywords: ['suggests', 'indicates', 'implies', 'means'],
    exampleQuestion: 'Interpret the trend shown in the graph regarding global temperatures.',
  },
  {
    term: 'DEDUCE',
    definition: 'Draw conclusions.',
    tier: 4,
    markRange: [3, 5],
    targetBands: '4-6',
    bandDiscrimination: 'Logical flow from evidence to conclusion.',
    genericMarkingGuide: [
      '1 mark: Uses evidence.',
      '2 marks: Draws logical conclusion based on evidence.',
    ],
    structuralKeywords: ['conclude', 'it follows that', 'therefore', 'derived from'],
    exampleQuestion: "Deduce the genotype of the parents based on the offspring's characteristics.",
  },
  {
    term: 'EXTRAPOLATE',
    definition: 'Infer from what is known.',
    tier: 4,
    markRange: [3, 6],
    targetBands: '4-6',
    bandDiscrimination: 'Reasonableness of inference beyond known data.',
    genericMarkingGuide: [
      '1 mark: Uses known data.',
      '2 marks: Logically extends data to new territory.',
    ],
    structuralKeywords: ['extend', 'project', 'future', 'predict'],
    exampleQuestion:
      'Extrapolate the future growth of the bacteria colony based on the current data.',
  },
  {
    term: 'PREDICT',
    definition: 'Suggest what may happen based on available information.',
    tier: 4,
    markRange: [3, 5],
    targetBands: '3-6',
    bandDiscrimination: 'Justification of prediction based on data.',
    genericMarkingGuide: [
      '1 mark: States prediction.',
      '2 marks: Justifies prediction with available info.',
    ],
    structuralKeywords: ['likely', 'will', 'expect', 'outcome'],
    exampleQuestion: 'Predict the outcome of the reaction if the temperature is doubled.',
  },
  {
    term: 'ANALYSE',
    definition:
      'Identify components and the relationship between them; draw out and relate implications.',
    tier: 4,
    markRange: [5, 8],
    targetBands: '4-6',
    bandDiscrimination: 'Depth of relationship analysis and implications.',
    genericMarkingGuide: [
      '2 marks: Identifies components.',
      '2 marks: Explains relationships.',
      '1-2 marks: Discusses implications.',
    ],
    structuralKeywords: ['relationship', 'component', 'implication', 'connection', 'impact'],
    exampleQuestion: 'Analyse the impact of social media on teenage self-esteem.',
  },
  {
    term: 'EXAMINE',
    definition: 'Inquire into.',
    tier: 4,
    markRange: [4, 7],
    targetBands: '4-6',
    bandDiscrimination: 'Depth of inquiry.',
    genericMarkingGuide: [
      '1-2 marks: Identifies key issues.',
      '2+ marks: Probes details and context.',
    ],
    structuralKeywords: ['explore', 'inspect', 'look into', 'scrutinise'],
    exampleQuestion: 'Examine the role of technology in modern healthcare.',
  },
  {
    term: 'ACCOUNT',
    definition: 'State reasons for, report on.',
    tier: 4,
    markRange: [4, 7],
    targetBands: '4-6',
    bandDiscrimination: 'Comprehensiveness of reasons.',
    genericMarkingGuide: [
      '1 mark: Identifies event/phenomenon.',
      '2+ marks: Provides detailed reasons for its occurrence.',
    ],
    structuralKeywords: ['reasons for', 'caused by', 'resulted from', 'explanation'],
    exampleQuestion: 'Account for the rapid urbanization in the 20th century.',
  },

  // --- Level 5: Synthesising & Arguing ---
  {
    term: 'DISCUSS',
    definition: 'Identify issues and provide points for and/or against.',
    tier: 5,
    markRange: [5, 8],
    targetBands: '4-6',
    bandDiscrimination: 'Balance of argument and breadth of issues.',
    genericMarkingGuide: [
      '2 marks: Points for.',
      '2 marks: Points against.',
      '1 mark: Conclusion/Synthesis.',
    ],
    structuralKeywords: ['on one hand', 'conversely', 'however', 'argument', 'perspective'],
    exampleQuestion: 'Discuss the advantages and disadvantages of nuclear power.',
  },
  {
    term: 'PROPOSE',
    definition:
      'Put forward (for example a point of view, idea, argument, suggestion) for consideration or action.',
    tier: 5,
    markRange: [4, 7],
    targetBands: '4-6',
    bandDiscrimination: 'Feasibility and justification of proposal.',
    genericMarkingGuide: [
      '1 mark: Clear proposal.',
      '2+ marks: Justification or supporting argument.',
    ],
    structuralKeywords: ['suggest', 'recommendation', 'plan', 'strategy'],
    exampleQuestion: 'Propose a strategy to reduce plastic waste in the school canteen.',
  },
  {
    term: 'INVESTIGATE',
    definition: 'Plan, inquire into and draw conclusions about.',
    tier: 5,
    markRange: [5, 10],
    targetBands: '5-6',
    bandDiscrimination: 'Depth of inquiry and validity of conclusions.',
    genericMarkingGuide: [
      '2 marks: Planning/Method.',
      '2 marks: Inquiry/Analysis.',
      '1 mark: Conclusion.',
    ],
    structuralKeywords: ['research', 'findings', 'conclusion', 'evidence'],
    exampleQuestion: 'Investigate the effect of sunlight on plant growth.',
  },
  {
    term: 'SYNTHESISE',
    definition: 'Putting together various elements to make a whole.',
    tier: 5,
    markRange: [6, 10],
    targetBands: '5-6',
    bandDiscrimination: 'Coherence of the whole created from parts.',
    genericMarkingGuide: [
      '2 marks: Identifies separate elements.',
      '2+ marks: Combines them into a new, coherent conclusion or whole.',
    ],
    structuralKeywords: ['combine', 'integrate', 'overall', 'holistic'],
    exampleQuestion:
      'Synthesise the information from the three sources to form a conclusion about the health of the river system.',
  },

  // --- Level 6: Evaluating & Judging ---
  {
    term: 'ASSESS',
    definition: 'Make a judgement of value, quality, outcomes, results or size.',
    tier: 6,
    markRange: [6, 10],
    targetBands: '5-6',
    bandDiscrimination: 'Quality of judgement and criteria used.',
    genericMarkingGuide: ['1 mark: Clear judgement.', '2+ marks: Support with criteria/evidence.'],
    structuralKeywords: ['judgement', 'value', 'extent', 'quality', 'outcome'],
    exampleQuestion: 'Assess the effectiveness of the government’s fiscal policy.',
  },
  {
    term: 'EVALUATE',
    definition: 'Make a judgement based on criteria; determine the value of.',
    tier: 6,
    markRange: [6, 12],
    targetBands: '5-6',
    bandDiscrimination: 'Use of explicit criteria to form judgement.',
    genericMarkingGuide: [
      '1 mark: Judgement.',
      '2 marks: Criteria used.',
      '2+ marks: Evidence weighing.',
    ],
    structuralKeywords: ['criteria', 'evaluate', 'weigh', 'determine'],
    exampleQuestion: 'Evaluate the success of the marketing campaign based on the sales data.',
  },
  {
    term: 'APPRECIATE',
    definition: 'Make a judgement about the value of.',
    tier: 6,
    markRange: [5, 8],
    targetBands: '5-6',
    bandDiscrimination: 'Sensitivity and depth of value judgement.',
    genericMarkingGuide: [
      '1 mark: States value.',
      '2+ marks: Explains/justifies the value/quality.',
    ],
    structuralKeywords: ['value', 'significance', 'quality', 'worth'],
    exampleQuestion: "Appreciate the aesthetic qualities of the artist's use of light and shadow.",
  },
  {
    term: 'JUSTIFY',
    definition: 'Support an argument or conclusion.',
    tier: 6,
    markRange: [6, 10],
    targetBands: '5-6',
    bandDiscrimination: 'Strength of logic and evidence supporting the argument.',
    genericMarkingGuide: [
      '1 mark: States argument/conclusion.',
      '3+ marks: robust support with evidence/logic.',
    ],
    structuralKeywords: ['because', 'reason', 'support', 'evidence'],
    exampleQuestion:
      'Select one energy solution and justify your choice with environmental and economic evidence.',
  },
  {
    term: 'RECOMMEND',
    definition: 'Provide reasons in favour.',
    tier: 6,
    markRange: [5, 8],
    targetBands: '4-6',
    bandDiscrimination: 'Strength of reasons provided.',
    genericMarkingGuide: ['1 mark: Recommendation.', '2+ marks: Valid reasons supporting it.'],
    structuralKeywords: ['suggest', 'favour', 'reason', 'should'],
    exampleQuestion: 'Recommend a course of action for the business to improve employee retention.',
  },
  {
    term: 'CRITICALLY ANALYSE',
    definition:
      'Use interpretation and reasoning to assess a range of evidence; add a degree of accuracy, logic, questioning, reflection and quality.',
    tier: 6,
    markRange: [8, 20],
    targetBands: '6',
    bandDiscrimination: 'Depth of questioning and reflection.',
    genericMarkingGuide: [
      '2 marks: Analysis of evidence.',
      '2 marks: Assessment/Judgement.',
      '2+ marks: Critical reflection/questioning.',
    ],
    structuralKeywords: ['critique', 'question', 'validity', 'logic', 'reflection'],
    exampleQuestion: 'Critically analyse the claim that history is written by the victors.',
  },
  {
    term: 'CRITICALLY EVALUATE',
    definition:
      'Use interpretation and reasoning to assess a range of evidence; add a degree of accuracy, logic, questioning, reflection and quality.',
    tier: 6,
    markRange: [8, 20],
    targetBands: '6',
    bandDiscrimination: 'Depth of questioning and reflection.',
    genericMarkingGuide: [
      '2 marks: Evaluation against criteria.',
      '2 marks: Assessment/Judgement.',
      '2+ marks: Critical reflection/questioning.',
    ],
    structuralKeywords: ['critique', 'question', 'validity', 'logic', 'reflection'],
    exampleQuestion: 'Critically evaluate the claim that history is written by the victors.',
  },
  // Legacy support
  {
    term: 'DIFFERENTIATE',
    definition:
      'Recognise or note/indicate as being distinct or different from; to note differences between.',
    tier: 4,
    markRange: [3, 5],
    targetBands: '3-6',
    bandDiscrimination: 'Precision of distinction.',
    genericMarkingGuide: ['1 mark: Identifies entities.', '2+ marks: Explains differences.'],
    structuralKeywords: ['distinct', 'difference'],
    exampleQuestion: 'Differentiate between the two types of cells.',
  },
];

export const commandTerms = new Map<PromptVerb, CommandTermInfo>(
  commandTermsList.map((term) => [
    term.term,
    { ...term, tailwind: TIER_COLORS[term.tier] } as CommandTermInfo,
  ])
);

const fallbackTerm: CommandTermInfo = {
  term: 'EXPLAIN',
  definition:
    'Relate cause and effect; make the relationships between things evident; provide why and/or how.',
  tier: 2, // Default to Level 2/Tier 2 color for generic explanations
  markRange: [1, 20] as [number, number],
  targetBands: 'All',
  bandDiscrimination: 'Varies',
  genericMarkingGuide: ['Provide a clear answer'],
  tailwind: TIER_COLORS[2],
  structuralKeywords: ['because', 'therefore'],
  exampleQuestion: 'Explain the concept.',
};

export const getCommandTermInfo = (verb?: PromptVerb): CommandTermInfo => {
  if (!verb) return fallbackTerm;
  return commandTerms.get(verb) || fallbackTerm;
};

/**
 * Robustly extracts the most significant command verb from a string.
 * Finds all known verbs in the text and returns the one with the highest cognitive Tier.
 * If tiers are equal, prefers the longer/more specific verb.
 */
export const extractCommandVerb = (text: string): CommandTermInfo | undefined => {
  const normalized = text.trim().toLowerCase();
  const allVerbs = Array.from(commandTerms.values());

  // Find all verbs present in the text as whole words
  const matches = allVerbs.filter((verbInfo) => {
    const verbLower = verbInfo.term.toLowerCase();
    // Escape special regex characters just in case
    const escapedVerb = verbLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedVerb}\\b`, 'i');
    return regex.test(normalized);
  });

  if (matches.length === 0) return undefined;

  // Sort matches:
  // 1. Tier Descending (Highest cognitive level first)
  // 2. Length Descending (Specificity)
  matches.sort((a, b) => {
    if (b.tier !== a.tier) {
      return b.tier - a.tier;
    }
    return b.term.length - a.term.length;
  });

  return matches[0];
};

export const getCommandTermsForMarks = (
  marks: number
): { terms: CommandTermInfo[]; primaryTerm: CommandTermInfo } => {
  // Target Tier Heuristic for smooth UI progression
  // 1-2: Tier 1
  // 3-4: Tier 2
  // 5-6: Tier 3
  // 7-8: Tier 4
  // 9-10: Tier 5
  // 11-12+: Tier 6
  const targetTier = Math.min(6, Math.ceil(marks / 2));

  const idealMatches = commandTermsList
    .filter((term) => marks >= term.markRange[0] && marks <= term.markRange[1])
    .map((term) => ({ ...term, tailwind: TIER_COLORS[term.tier] }) as CommandTermInfo);

  if (idealMatches.length > 0) {
    const sortedMatches = idealMatches.sort((a, b) => {
      const distA = Math.abs(a.tier - targetTier);
      const distB = Math.abs(b.tier - targetTier);

      // Prioritize closest tier to target for UI consistency
      if (distA !== distB) {
        return distA - distB;
      }

      // Secondary sort: alphabetical for stability
      return a.term.localeCompare(b.term);
    });
    return { terms: sortedMatches, primaryTerm: sortedMatches[0] };
  }

  // Fallback logic if no direct matches
  let closestTerm = commandTermsList[0];
  let smallestDiff = Infinity;

  commandTermsList.forEach((term) => {
    const diff = Math.min(Math.abs(marks - term.markRange[0]), Math.abs(marks - term.markRange[1]));
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestTerm = term;
    } else if (diff === smallestDiff) {
      // If mark diff is same, pick the one closer to target tier
      if (Math.abs(term.tier - targetTier) < Math.abs(closestTerm.tier - targetTier)) {
        closestTerm = term;
      }
    }
  });

  const primaryTerm = {
    ...closestTerm,
    tailwind: TIER_COLORS[closestTerm.tier],
  } as CommandTermInfo;
  return { terms: [primaryTerm], primaryTerm: primaryTerm };
};

/**
 * Calculates the Performance Band (1-6) based on the mark achieved,
 * strictly constrained by the Tier Level (Cognitive complexity) of the question.
 *
 * Uses a Tier-specific ratio lookup table to ensure marks like 4/5 and 9/10
 * map to the correct bands according to NESA standards.
 *
 * @param mark The mark achieved or target mark.
 * @param totalMarks The total marks available for the question.
 * @param tier The cognitive tier of the question (1-6). Defaults to 4 if unknown.
 */
export const getBandForMark = (mark: number, totalMarks: number, tier: number = 4): number => {
  if (totalMarks <= 0) return 1;
  if (mark <= 0) return 1;

  const ratio = Math.min(mark, totalMarks) / totalMarks;

  // Explicit Tier Thresholds based on strict User Specification
  // Updated to allow lower tier questions (Tier 2/3) to achieve slightly higher bands when marks are perfect
  const thresholds: Record<number, { min: number; band: number }[]> = {
    6: [
      // Evaluate (Tier 6) - Max Band 6
      { min: 0.9, band: 6 },
      { min: 0.75, band: 5 },
      { min: 0.55, band: 4 },
      { min: 0.35, band: 3 },
      { min: 0.15, band: 2 },
      { min: 0, band: 1 },
    ],
    5: [
      // Synthesise (Tier 5) - Max Band 6
      { min: 0.9, band: 6 },
      { min: 0.75, band: 5 },
      { min: 0.55, band: 4 },
      { min: 0.35, band: 3 },
      { min: 0.15, band: 2 },
      { min: 0, band: 1 },
    ],
    4: [
      // Analyse (Tier 4) - Max Band 5
      { min: 0.9, band: 5 }, // 5/5 or 9/10 required for Band 5. 4/5 (0.8) should be Band 4.
      { min: 0.7, band: 4 }, // 4/5 (0.8) -> Band 4. 3/4 (0.75) -> Band 4.
      { min: 0.4, band: 3 }, // 2/5 (0.4) -> Band 3
      { min: 0.2, band: 2 },
      { min: 0, band: 1 },
    ],
    3: [
      // Apply (Tier 3) - Max Band 4
      { min: 0.85, band: 4 }, // 3/3, 4/4 -> Band 4
      { min: 0.6, band: 3 }, // 2/3, 3/4 -> Band 3
      { min: 0.35, band: 2 }, // 1/3, 2/4 -> Band 2 (low)
      { min: 0, band: 1 },
    ],
    2: [
      // Describe (Tier 2) - Max Band 3
      { min: 0.85, band: 3 }, // 3/3 -> Band 3
      { min: 0.5, band: 2 }, // 2/3 -> Band 2
      { min: 0, band: 1 },
    ],
    1: [
      // Identify (Tier 1) - Max Band 2
      { min: 0.5, band: 2 },
      { min: 0, band: 1 },
    ],
  };

  // Use specific tier config or fallback to Tier 4 logic if unknown
  const tierConfig = thresholds[tier] || thresholds[4];

  for (const t of tierConfig) {
    if (ratio >= t.min) return t.band;
  }

  return 1;
};

export const TIER_WORD_COUNT_MULTIPLIERS: { [key: number]: number } = {
  1: 0.8,
  2: 1.0,
  3: 1.2,
  4: 1.5,
  5: 1.8,
  6: 2.0,
};

// Refined metrics based on NESA data:
// 1 mark = 1-10 words.
// 3 marks = 40-80 words. (~20 words/mark)
// 5 marks = 110-160 words. (~27 words/mark)
// 8 marks = 220-350 words. (~35 words/mark)
// 10 marks = 320-450+ words. (~38 words/mark)
export const BAND_METRICS = [
  { band: 6, wordCountMultiplier: { min: 32, max: 45 } }, // Target: 10 marks -> 320 words min
  { band: 5, wordCountMultiplier: { min: 27, max: 35 } }, // Target: 8 marks -> 216 words min
  { band: 4, wordCountMultiplier: { min: 20, max: 30 } }, // Target: 5 marks -> 100 words min
  { band: 3, wordCountMultiplier: { min: 13, max: 20 } }, // Target: 3 marks -> 40 words min
  { band: 2, wordCountMultiplier: { min: 8, max: 15 } }, // Target: 2 marks -> 16 words min
  { band: 1, wordCountMultiplier: { min: 2, max: 10 } }, // Target: 1 mark -> 2 words min
];

export const getBandForWordCount = (wordCount: number, totalMarks: number): number => {
  for (const metric of BAND_METRICS) {
    if (wordCount >= Math.round(totalMarks * metric.wordCountMultiplier.min)) {
      return metric.band;
    }
  }
  return 1;
};

/**
 * Returns the explicit structural requirements for a given mark based on NESA guidelines.
 * Used by the AI to generate accurately structured sample answers.
 */
export const getStructureGuide = (mark: number): string => {
  if (mark <= 1) return 'Recall a single fact, term, or feature. (Approx 1-10 words)';
  if (mark === 2)
    return 'Recall two distinct points OR one point + a brief example. (Approx 15-40 words)';
  if (mark === 3)
    return 'Three clear points OR two points + one relevant example OR a simple cause-effect link. (Approx 40-80 words)';
  if (mark === 4)
    return 'Clear explanation with at least two linked points and one specific example/quote. Logical connections shown. (Approx 80-120 words)';
  if (mark === 5)
    return 'Detailed explanation OR beginning of analysis: breaks concept into parts, shows relationships, uses specific evidence. (Approx 110-160 words)';
  if (mark === 6)
    return 'Sophisticated breakdown of components, clear patterns/relationships identified, multiple pieces of evidence integrated. (Approx 140-220 words)';
  if (mark === 7)
    return 'Analysis + explicit judgement or assessment of significance/effectiveness/limitations. Weighs evidence. (Approx 180-280 words)';
  if (mark === 8)
    return 'Sustained judgement supported by detailed, integrated evidence. Consider alternatives or implications. (Approx 220-350 words)';
  if (mark === 9)
    return 'Perceptive, nuanced judgement. Addresses counter-arguments or limitations. Original insight. (Approx 280-400 words)';
  return 'Seamless synthesis of ideas, highly original or perceptive conclusion, exceptional depth and fluency. (Approx 320-450+ words)';
};
