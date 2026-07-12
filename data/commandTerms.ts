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
    subtitle: 'Just remember and write it down — short, direct answers, often 1–2 marks.',
    emoji: '🧠',
    tier: 1,
    maxBand: 1,
  },
  {
    level: 2,
    title: 'Comprehending & Describing',
    subtitle: "Show what it's like in your own words — describe, retell or sum up.",
    emoji: '📝',
    tier: 2,
    maxBand: 2,
  },
  {
    level: 3,
    title: 'Applying & Demonstrating',
    subtitle: 'Use what you know — work it out, show how, or build an answer.',
    emoji: '🔧',
    tier: 3,
    maxBand: 3,
  },
  {
    level: 4,
    title: 'Analysing & Connecting',
    subtitle: 'Break it into parts and connect them — show the how and why.',
    emoji: '🔍',
    tier: 4,
    maxBand: 4,
  },
  {
    level: 5,
    title: 'Synthesising & Arguing',
    subtitle: 'Bring ideas together and argue a supported point of view.',
    emoji: '⚖️',
    tier: 5,
    maxBand: 5,
  },
  {
    level: 6,
    title: 'Evaluating & Judging',
    subtitle: 'Weigh it up and judge against criteria — deep, balanced thinking, often 8+ marks.',
    emoji: '🏆',
    tier: 6,
    maxBand: 6,
  },
];

export const commandTermsList: Omit<CommandTermInfo, 'tailwind'>[] = [
  // --- Level 1: Retrieving & Recalling ---
  {
    term: 'IDENTIFY',
    definition:
      'Recognise and name the key thing(s) — point it out clearly, often just a word or short phrase.',
    tier: 1,
    markRange: [1, 2],
    bandDiscrimination: 'Accuracy of identification.',
    genericMarkingGuide: ['1 mark: Correctly identifies the item/concept.'],
    structuralKeywords: ['is', 'are', 'named'],
    exampleQuestion: 'Identify three renewable energy sources from the text provided.',
  },
  {
    term: 'STATE',
    definition: 'Give the fact or answer plainly — no explanation needed.',
    tier: 1,
    markRange: [1, 2],
    bandDiscrimination: 'Accuracy of the stated fact.',
    genericMarkingGuide: ['1 mark: Correctly states the information.'],
    structuralKeywords: ['state', 'give', 'name'],
    exampleQuestion: 'State the boiling point of water.',
  },
  {
    term: 'RECALL',
    definition:
      "Just remember and write down facts, ideas or experiences you've learned — keep it straightforward.",
    tier: 1,
    markRange: [1, 2],
    bandDiscrimination: 'Accuracy of recalled facts.',
    genericMarkingGuide: ['1 mark: Correctly recalls the specific fact or idea.'],
    structuralKeywords: ['state', 'list'],
    exampleQuestion: 'Recall the formula for calculating the area of a circle.',
  },
  {
    term: 'DEFINE',
    definition:
      'State the exact meaning and the essential qualities or features — be precise with subject terms.',
    tier: 1,
    markRange: [1, 3],
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
    definition: 'Pull out and list the relevant details from a source or text.',
    tier: 1,
    markRange: [1, 2],
    bandDiscrimination: 'Relevance of extracted details.',
    genericMarkingGuide: ['1 mark: Extracts the correct information.'],
    structuralKeywords: ['from', 'data', 'source'],
    exampleQuestion: 'Extract the population data for 1990 from the table.',
  },
  {
    term: 'RECOUNT',
    definition: 'Retell a series of events in order, like a story summary.',
    tier: 1,
    markRange: [2, 4],
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
    definition: 'Sketch the main features in general terms — main points only, no deep detail.',
    tier: 2,
    markRange: [2, 4],
    bandDiscrimination: 'Coverage of main features.',
    genericMarkingGuide: ['1 mark per main feature outlined.'],
    structuralKeywords: ['mainly', 'features', 'overview', 'briefly'],
    exampleQuestion: 'Outline the main stages of the water cycle.',
  },
  {
    term: 'DESCRIBE',
    definition:
      'Provide the main characteristics and features — paint a clear picture of what it is like or what happened.',
    tier: 2,
    markRange: [3, 5],
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
    definition: "Make it clear or plain — explain simply so it's easy to understand.",
    tier: 2,
    markRange: [2, 4],
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
    definition: 'Express the relevant details concisely — shorten it while keeping the key points.',
    tier: 2,
    markRange: [3, 5],
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
    definition: 'Arrange or group things into categories, and explain your groupings.',
    tier: 2,
    markRange: [2, 4],
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
    definition:
      'Work out the answer using the given numbers, facts or formulas — show your working if required.',
    tier: 3,
    markRange: [2, 4],
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
    definition: 'Use your knowledge in a new, different or unfamiliar situation.',
    tier: 3,
    markRange: [3, 6],
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
    definition: 'Show by giving a clear example — often including how it works.',
    tier: 3,
    markRange: [3, 6],
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
    definition: 'Make, build or put together items or arguments.',
    tier: 3,
    markRange: [3, 6],
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
    definition: 'Show how things are similar or different, linking the points as you go.',
    tier: 4,
    markRange: [4, 8],
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
    definition: 'Show how things are different or opposite — highlight the differences clearly.',
    tier: 4,
    markRange: [4, 6],
    bandDiscrimination: 'Depth of difference analysis.',
    genericMarkingGuide: ['1 mark per valid point of contrast explained.'],
    structuralKeywords: ['unlike', 'on the other hand', 'conversely', 'differs'],
    exampleQuestion: 'Contrast the political systems of a democracy and a dictatorship.',
  },
  {
    term: 'DISTINGUISH',
    definition: 'Note the differences between things — show how they are distinct.',
    tier: 4,
    markRange: [3, 5],
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
      'Relate cause and effect — make the relationships clear and give the why and/or how, linking ideas logically.',
    tier: 4,
    markRange: [3, 6],
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
    definition: 'Draw meaning from something (data, text or an event) and explain what it shows.',
    tier: 4,
    markRange: [3, 6],
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
    definition: 'Draw logical conclusions from the information given.',
    tier: 4,
    markRange: [3, 5],
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
    definition: 'Infer or extend what may happen based on what is already known.',
    tier: 4,
    markRange: [3, 6],
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
    definition: 'Suggest what may happen based on the available information.',
    tier: 4,
    markRange: [3, 5],
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
      'Break it into its parts and show how the parts connect or affect each other, drawing out the implications.',
    tier: 4,
    markRange: [5, 8],
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
    definition: 'Inquire into it carefully — look closely at the details and different aspects.',
    tier: 4,
    markRange: [4, 7],
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
    definition:
      'State the reasons for something — report on why it happened (or narrate the events step by step).',
    tier: 4,
    markRange: [4, 7],
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
    definition:
      'Identify the issues and give points for and/or against — explore it from multiple angles.',
    tier: 5,
    markRange: [5, 8],
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
    definition: 'Put forward a point of view, idea, argument or suggestion for consideration.',
    tier: 5,
    markRange: [4, 7],
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
    definition: 'Plan, inquire into and draw conclusions about something.',
    tier: 5,
    markRange: [5, 10],
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
    definition:
      'Put together elements from different sources to form a coherent whole — combine ideas creatively.',
    tier: 5,
    markRange: [6, 10],
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
    definition:
      'Make a judgement of value, quality, outcomes, results or size — usually against criteria.',
    tier: 6,
    markRange: [6, 10],
    bandDiscrimination: 'Quality of judgement and criteria used.',
    genericMarkingGuide: ['1 mark: Clear judgement.', '2+ marks: Support with criteria/evidence.'],
    structuralKeywords: ['judgement', 'value', 'extent', 'quality', 'outcome'],
    exampleQuestion: 'Assess the effectiveness of the government’s fiscal policy.',
  },
  {
    term: 'EVALUATE',
    definition:
      'Make a judgement based on criteria — weigh the evidence and state your overall view of its value or worth.',
    tier: 6,
    markRange: [6, 12],
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
    definition: 'Make a judgement about the value or worth of something.',
    tier: 6,
    markRange: [5, 8],
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
    definition:
      "Support an argument or conclusion with reasons and evidence — prove why it's valid.",
    tier: 6,
    markRange: [6, 10],
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
    definition: 'Provide reasons in favour of something.',
    tier: 6,
    markRange: [5, 8],
    bandDiscrimination: 'Strength of reasons provided.',
    genericMarkingGuide: ['1 mark: Recommendation.', '2+ marks: Valid reasons supporting it.'],
    structuralKeywords: ['suggest', 'favour', 'reason', 'should'],
    exampleQuestion: 'Recommend a course of action for the business to improve employee retention.',
  },
  {
    term: 'CRITICALLY ANALYSE',
    definition:
      'Use interpretation, reasoning and detailed analysis of a range of evidence to make judgements — go deeper with questioning and logic.',
    tier: 6,
    markRange: [8, 20],
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
      'Bring accuracy, depth, logic, questioning and reflection to your evaluation — weigh strengths and weaknesses thoroughly.',
    tier: 6,
    markRange: [8, 20],
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
    definition: 'Show the specific differences that set things apart from one another.',
    tier: 4,
    markRange: [3, 5],
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
    'Relate cause and effect — make the relationships clear and give the why and/or how, linking ideas logically.',
  tier: 2, // Default to Level 2/Tier 2 color for generic explanations
  markRange: [1, 20] as [number, number],
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
 * The band ceiling implied by a question's MARK VALUE alone: an N-mark
 * question can't call for more depth than roughly Band N+1, however lofty its
 * verb (a 1-mark task evidences at most Band 2 recall; a 3-mark task tops out
 * at Band 4; from 5 marks the marks stop being the limiting factor).
 *
 * This exists to normalise questions generated or imported OUTSIDE the usual
 * verb/mark pairings — e.g. a 3-mark Tier-4 DISTINGUISH — so every derived
 * band (and therefore every band colour) stays predictable. It is applied
 * inside getBandForMark, the single source all band figures flow from.
 */
export const getMarksBandCap = (totalMarks: number): number =>
  Math.max(1, Math.min(6, Math.floor(totalMarks) + 1));

/**
 * Calculates the Performance Band (1-6) based on the mark achieved,
 * strictly constrained by the Tier Level (Cognitive complexity) of the question
 * AND by the question's mark value (see getMarksBandCap).
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

  // The effective ceiling: the lower of the tier's maximum and the marks cap.
  const tierMax = Math.min(tier, 6);
  const cap = getMarksBandCap(totalMarks);
  const maxBand = Math.min(tierMax, cap);

  // For questions where totalMarks ≤ maxBand, a linear mapping guarantees each
  // mark gets a distinct band — no collisions possible. This is the common case
  // for HSC short-answer (2-6 mark questions).
  if (totalMarks <= maxBand) {
    // mark 1→(maxBand - totalMarks + 1), ..., mark totalMarks→maxBand
    const clampedMark = Math.min(mark, totalMarks);
    return maxBand - totalMarks + clampedMark;
  }

  // For higher-mark questions (totalMarks > maxBand), distribute bands evenly
  // across the mark range using ceiling division. Full marks always = maxBand,
  // mark 1 = Band 1 (or the lowest achievable).
  const clampedMark = Math.min(mark, totalMarks);
  return Math.min(maxBand, Math.max(1, Math.ceil((clampedMark / totalMarks) * maxBand)));
};

/**
 * Inverse of getBandForMark: the smallest integer mark (1..totalMarks) that maps
 * to `targetBand` on a question of the given tier. Used when we know the band we
 * want an exemplar to demonstrate and need a concrete, consistent mark to store
 * alongside it. Falls back to the closest achievable mark if the exact band is
 * not reachable (e.g. a band above the tier ceiling).
 */
export const markForBand = (targetBand: number, totalMarks: number, tier: number = 4): number => {
  if (totalMarks <= 0) return 0;
  for (let mark = 1; mark <= totalMarks; mark++) {
    if (getBandForMark(mark, totalMarks, tier) >= targetBand) return mark;
  }
  return totalMarks;
};

/**
 * The band a full-mark response to this question can reach — i.e. the ceiling a
 * student is working toward, set by the verb's cognitive tier. This is the
 * single definition of a question's "target band"; the writing area, keyword
 * panels and metrics all colour themselves from it so the destination band is
 * one predefined colour everywhere.
 */
export const getTargetBand = (totalMarks: number, tier: number = 4): number =>
  getBandForMark(totalMarks, totalMarks, tier);

/**
 * The target band for a whole cognitive tier (independent of a specific mark) —
 * the ceiling any question at that tier can reach. Used to colour tier-level UI
 * (e.g. the Command Verb Hierarchy ribbon) in the SAME band colour a question of
 * that tier uses, so a verb like DESCRIBE isn't one colour in the ribbon and
 * another in the prompt.
 *
 * --- The band model (why this exists) -------------------------------------
 * NESA performance bands (1-6) are a *course-level* achievement standard — NESA
 * never publishes a band for an individual question, and no official rule maps a
 * command verb to a band. For questions we author or generate (i.e. not lifted
 * straight from a NESA paper) we therefore INFER a defensible ceiling rather than
 * invent a fact:
 *
 *   band ceiling  ← the command verb's cognitive demand (this function)
 *   depth expected ← the marks (markRange, BAND_METRICS word targets)
 *   band awarded   ← how well the response meets the marking guide (getBandForMark),
 *                    capped at the ceiling
 *
 * The pedagogy: a response can only *demonstrate* the standard of thinking the
 * task actually calls for. However thorough, a DESCRIBE answer cannot evidence
 * the sustained analysis/evaluation that defines Bands 4-6, so it tops out at the
 * ceiling its verb allows. This is a transparent inference, not a NESA decree —
 * it is the single source every band figure in the app derives from, so marking,
 * live feedback, colour and copy can never disagree.
 */
export const getTierTargetBand = (tier: number): number =>
  TIER_GROUPS.find((g) => g.tier === tier)?.maxBand ?? Math.max(1, Math.min(6, tier));

/**
 * The band ceiling a command verb allows — the highest band a response to a
 * question using this verb can demonstrate, set by the verb's cognitive demand.
 * Thin wrapper over {@link getTierTargetBand} keyed by verb for call sites that
 * only have the term. See the band-model note above.
 */
export const getVerbBandCeiling = (verb: PromptVerb): number =>
  getTierTargetBand(getCommandTermInfo(verb).tier);

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
