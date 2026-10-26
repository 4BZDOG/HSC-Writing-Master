/**
 * How NSW HSC papers write a scenario, as rules for the AI generators.
 *
 * Drawn from 472 items across the 2020–2025 papers (Business Studies, Economics,
 * Legal Studies, Geography, Biology, PDHPE, English, and the Software Engineering
 * and Enterprise Computing guidelines); the evidence, counts and examples are in
 * `docs/hsc-scenario-conventions.md`. The short version: most real scenarios name
 * no place at all; Australia is named when the question is about Australia, once,
 * and signalled by its institutions and law rather than by cliché; people are roles,
 * not a cast of names; and a scenario is short.
 *
 * The generators had none of this. Their output named Australia in more than half
 * of Business Studies scenarios (a third in the papers), moved through thirteen
 * cities where the papers name Newcastle once, invented Geography place names, and
 * cast named characters in Legal Studies and Enterprise Computing, which no paper
 * does.
 */

const GENERAL_RULES = [
  'Default to an unlocated situation named by role: "a cafe", "a building company", "a local council", "an athlete", "a hypothetical economy", "Country A". Most real HSC scenarios name no place.',
  'Name Australia only when the question is about Australia (its law, institutions, economy or health system), and then once and plainly: "an Australian business", "in NSW". At most ONE place per scenario; never add a city for colour.',
  'Signal an Australian setting through institutions, law and terms, as the papers do (the Reserve Bank of Australia and the cash rate, the ABS, Medicare, superannuation, award wages, Australian Consumer Law, "Pty Ltd", the High Court of Australia), never through cultural shorthand. No kangaroos, outback, surf, barbecues, "mate", footy, Bondi or Vegemite unless the syllabus content is itself about them.',
  'People are roles ("the owner", "a manager", "the coach", "Athlete A"). Name at most one person, only if the scenario cannot work without it, with one plain name. Never give several characters names and never use names to signal diversity or background.',
  'A short question refers to "a business" and its stem to "this business". Give an invented business a name only for an extended (15+ mark) report-style question, in company form ("… Pty Ltd").',
  'Keep it short and concrete: about 30–60 words for a short-answer question, up to about 150 for a 15+ mark question, with only the facts the answer needs.',
  'Start an invented scenario with "Hypothetical:". Invented figures stay hypothetical; never attribute invented data, quotations or events to a real organisation, publication or person.',
  'Tie the stem to the scenario with the papers’ phrases: "this business", "the information provided", "the extract", "the stimulus".',
  'Where the syllabus expects the student’s own case study, ask for it ("a business you have studied", "a case study you have studied") instead of inventing one.',
  'An overseas setting is named and bounded, and used only where the course studies places or a market beyond Australia is the point of the question.',
];

/** Per-course defaults, matched on the course name. First match wins, so PDHPE /
 *  Health and Movement Science is matched before the science rule its name would also hit. */
const COURSE_DEFAULTS: { match: RegExp; rule: string }[] = [
  {
    match: /business studies/i,
    rule: 'Business Studies: an invented business or a short data set; unlocated about two times in three, Australian about one in three. The 20-mark report gives a named Pty Ltd business, two or three short paragraphs, and asks the student to apply the hypothetical business situation.',
  },
  {
    match: /economics/i,
    rule: 'Economics: theory questions use "a hypothetical economy" or "Country A and Country B" with hypothetical figures; questions about the Australian economy, its policy settings or its data name Australia and its institutions plainly.',
  },
  {
    match: /legal/i,
    rule: 'Legal Studies: usually no invented scenario. Open with a short quoted proposition or name the jurisdiction (the Australian Constitution, the High Court of Australia, state and federal governments, or a named international instrument).',
  },
  {
    match: /geograph/i,
    rule: 'Geography: either a real place, named with the kind of source it would come with, or the student’s own case study ("an economic activity you have studied"). Never invent a place name.',
  },
  {
    match: /pdhpe|health|movement|physical/i,
    rule: 'PDHPE / Health and Movement Science: an athlete, coach or community archetype for performance questions; Australia’s health system named in health questions (Medicare, Closing the Gap, Aboriginal and Torres Strait Islander peoples).',
  },
  {
    match: /biolog|chemistr|physics|science|investigat/i,
    rule: 'Science: organisms, populations, experiments and data, unlocated. Name Australia only for a real programme or event, stated as it is.',
  },
  {
    match: /software|enterprise|computing|technolog/i,
    rule: 'Software Engineering / Enterprise Computing: a product or system (an app, a website, a booking system, a manufacturing line). No places, no company names, no named people.',
  },
  {
    match: /english/i,
    rule: 'English: no invented case study. Use the prescribed text, or a short, attributed stimulus (a quotation, an extract, a described image).',
  },
  {
    match: /histor/i,
    rule: 'History: historical sources and contexts, stated accurately and attributed; no invented scenario.',
  },
];

/** The scenario rules for a course: the general conventions and its own default. */
export const buildScenarioRules = (courseName: string): string => {
  const own = COURSE_DEFAULTS.find((c) => c.match.test(courseName ?? ''));
  return [
    'SCENARIO CONVENTIONS (as NSW HSC papers write them):',
    ...GENERAL_RULES.map((r) => `- ${r}`),
    ...(own ? [`- ${own.rule}`] : []),
  ].join('\n');
};

/** The generator modal's scenario types, as words the model can act on. */
export const SCENARIO_TYPE_BRIEF: Readonly<Record<string, string>> = {
  random: 'whichever kind of context best fits the dot point',
  temporal: 'a time-pressured situation (a deadline or an urgent response)',
  financial: 'a financial constraint (a budget limit, costs or a return on investment)',
  ethical: 'an ethical dilemma',
  stakeholder: 'stakeholders with conflicting interests',
  technical: 'a technical constraint (a legacy system or a limitation)',
  regulatory: 'a legal or regulatory requirement',
};
