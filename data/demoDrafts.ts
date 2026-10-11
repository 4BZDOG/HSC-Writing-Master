/**
 * Demo cohort writing corpus.
 *
 * The prose the demo seed attaches to generated student attempts. Kept here —
 * version-controlled and reviewable in git — rather than produced by an AI call
 * at seed time, so a reseed is deterministic, free, and auditable.
 *
 * ⚠️ Every line below is INVENTED for demonstration. None of it is, or is
 * derived from, a real student's work. The demo cohort is deliberately labelled
 * as such (see DEMO_SCHOOL_NAME in utils/demoCohort.ts) so seeded writing can
 * never be mistaken for a real submission.
 *
 * Drafts are banded rather than question-specific: one pool per band tier, with
 * `{topic}` substituted for the owning topic name. A demo does not need each
 * draft to answer its exact question word-for-word — it needs the *shape* of
 * band 2 writing to be visibly different from band 5 writing, because that is
 * what the metrics, band trends and class analytics are reading.
 */

/** Which band tier a piece of writing is meant to demonstrate. */
export type DraftBandTier = 'low' | 'mid' | 'high';

/** The band tier a mark's band falls into. Bands 1–2 low, 3–4 mid, 5–6 high. */
export const bandTierFor = (band: number): DraftBandTier =>
  band <= 2 ? 'low' : band <= 4 ? 'mid' : 'high';

/**
 * Student drafts by band tier. `{topic}` is replaced with the topic name.
 *
 * The progression is deliberate and mirrors the NESA band descriptors in
 * data/performanceBands.ts: low drafts assert without support, mid drafts
 * explain but do not sustain judgement, high drafts sustain a line of argument
 * and weigh alternatives.
 */
export const DEMO_DRAFTS: Record<DraftBandTier, string[]> = {
  low: [
    '{topic} is important for businesses. It helps them do their job better and makes things faster. Companies use it a lot these days.',
    'I think {topic} is useful because it saves time. There are lots of examples of this in the real world. It also costs money to set up.',
    '{topic} means using computers to help with work. This is good for the business and also for the customers who use it.',
    'The main thing about {topic} is that it is modern technology. Businesses need it to stay competitive with other businesses.',
  ],
  mid: [
    'Enterprise systems apply {topic} to convert raw operational data into a form managers can act on. For example, a retailer that records every transaction can group sales by store and period, which shows where demand is concentrated. This supports decisions about stock levels because the manager can see the pattern rather than guessing. However, the quality of the output still depends on the accuracy of the data collected at the point of sale.',
    '{topic} works by structuring information so that relationships between elements become visible. A logistics business, for instance, can compare delivery times across regions and identify which routes fall behind schedule. This is more effective than reading a list of individual deliveries because the comparison is immediate. A limitation is that summarising data can hide unusual cases that matter.',
    'The purpose of {topic} in an enterprise context is to reduce the effort required to interpret large volumes of information. Staff can identify trends quickly, which shortens the time between an event occurring and a response being made. This improves responsiveness. It does require staff training, and an organisation that does not invest in this may not realise the benefit.',
    'A business applies {topic} to support planning. By organising historical figures, the organisation can project likely future demand and allocate resources accordingly. This reduces waste. The approach assumes that past patterns continue, which is not always true, particularly where market conditions change rapidly.',
  ],
  high: [
    'The significance of {topic} lies less in the technology itself than in how it reshapes the decision-making process within an enterprise. By converting transactional records into structured comparisons, it shifts management from reactive correction to anticipatory planning — a manager who can see a downward trend forming across three periods intervenes before the shortfall is realised, rather than after. This is a material change in the locus of control.\n\nHowever, this advantage is conditional. The output inherits every weakness of its input: incomplete collection at the point of capture, inconsistent categorisation across business units, or a reporting period chosen to flatter performance will each produce a confident but misleading picture. The risk is compounded by presentation, because a well-rendered chart carries an authority its underlying data may not warrant.\n\nOn balance, {topic} delivers substantial value where an organisation also invests in data governance and in the analytical literacy of the staff reading the output. Where it is adopted as a technical solution alone, it tends to accelerate poor decisions rather than improve good ones.',
    'Evaluating {topic} requires weighing efficiency gains against the interpretive risks it introduces. The efficiency case is strong and well evidenced: aggregating operational data reduces the cognitive load on decision-makers and compresses the interval between observation and action, which in competitive markets is itself a source of advantage.\n\nThe counter-consideration is that abstraction necessarily discards detail. Summarising by region conceals variation within regions; smoothing a trend line conceals the volatility a risk assessment depends on. An organisation that treats the summary as the phenomenon rather than a representation of it will systematically under-weight exceptional cases — often precisely the cases requiring management attention.\n\nMy judgement is that {topic} is justified where the organisation retains the capacity to interrogate the underlying records, and questionable where the summary becomes the only view available. The determining variable is organisational practice, not the sophistication of the tool.',
    'The effectiveness of {topic} is best assessed against the alternative it displaces. Manual interpretation of operational records is slow, inconsistent between analysts, and does not scale past a modest data volume; measured against that baseline, the improvement in both speed and reproducibility is considerable, and the reproducibility matters more than the speed because it makes decisions auditable.\n\nThat said, reproducibility is not accuracy. A consistently applied but poorly specified categorisation produces reliably wrong output, and its very consistency makes the error harder to detect. This is a more serious failure mode than the inconsistency it replaced, because it is invisible to the people relying on it.\n\nOn balance the approach is sound, provided the specification itself is subject to periodic review. The technology resolves the problem of scale; it does not resolve the prior question of what should be measured, and an enterprise that conflates the two will mistake precision for validity.',
  ],
};

/** Overall AI feedback text, by band tier. */
export const DEMO_FEEDBACK: Record<DraftBandTier, string[]> = {
  low: [
    'This response identifies the topic but does not yet develop it. The claims made are general and are not supported with a specific example, so the marker cannot see evidence of understanding. Aim to name a concrete business context and explain what happens in it.',
    'The response stays at the level of assertion. Statements such as "it saves time" need to be followed by *how* — what specific step becomes faster, and what the consequence is for the organisation. Adding one worked example would lift this considerably.',
  ],
  mid: [
    'A sound response that explains the concept and supports it with a relevant example. The cause-and-effect reasoning is clear. To reach the higher bands, the limitation raised at the end needs to be developed into a judgement rather than left as an observation — say which consideration outweighs the other, and why.',
    'This demonstrates solid understanding and communicates it competently. The example is well chosen and does real work in the argument. The response would be strengthened by sustaining the analysis further: the second half is thinner than the first, and the concession is stated without being weighed.',
  ],
  high: [
    'A well-developed response that sustains a line of argument and reaches a defensible judgement. The concession is genuinely weighed rather than acknowledged in passing, and the criterion for the judgement is made explicit — this is what distinguishes the top band. The prose is controlled and the terminology is used accurately.',
    'This is a sophisticated treatment. The distinction drawn between reproducibility and accuracy is a genuine insight and it is carried through to the conclusion rather than abandoned. The judgement is conditional in a way that reflects the complexity of the question rather than hedging it.',
  ],
};

/** Per-criterion feedback fragments, cycled deterministically. */
export const DEMO_CRITERION_FEEDBACK: Record<DraftBandTier, string[]> = {
  low: [
    'The relevant concept is named but not explained.',
    'No supporting example is provided.',
    'Terminology is used loosely.',
  ],
  mid: [
    'Explains the concept accurately with a relevant example.',
    'Cause and effect is established, though not sustained throughout.',
    'Syllabus terminology is used appropriately.',
  ],
  high: [
    'Sustains a coherent line of argument to a supported judgement.',
    'Weighs competing considerations against an explicit criterion.',
    'Precise, controlled use of subject terminology.',
  ],
};

/** Strengths, by band tier. */
export const DEMO_STRENGTHS: Record<DraftBandTier, string[]> = {
  low: ['Correctly identifies the topic of the question.', 'Writes in clear, readable sentences.'],
  mid: [
    'Supports the explanation with a specific, relevant example.',
    'Establishes clear cause and effect.',
    'Uses syllabus terminology accurately.',
  ],
  high: [
    'Sustains a single line of argument across the whole response.',
    'Weighs the counter-consideration rather than merely noting it.',
    'States the criterion on which the judgement rests.',
    'Controlled, precise expression throughout.',
  ],
};

/** Improvements, by band tier. */
export const DEMO_IMPROVEMENTS: Record<DraftBandTier, string[]> = {
  low: [
    'Name a specific business context and explain what happens in it.',
    'Replace general claims with a cause-and-effect chain.',
    'Address the command verb directly — the question asks for more than a definition.',
  ],
  mid: [
    'Develop the limitation into a weighed judgement.',
    'Sustain the depth of the opening paragraph through the second half.',
    'Make the criterion for your judgement explicit.',
  ],
  high: [
    'Consider a second counter-example to test the judgement further.',
    'Tighten the middle paragraph — one supporting point is doing less work than the others.',
  ],
};

/** Short, punchy tips, by band tier. */
export const DEMO_QUICK_TIPS: Record<DraftBandTier, string[]> = {
  low: [
    'Add one real example — it is the fastest way to move up a band.',
    'Answer the verb, not the topic.',
  ],
  mid: ['Turn your "however" into a judgement.', 'Say which consideration wins, and why.'],
  high: ['Strong work. Test the judgement against one more case.', 'Trim to sharpen.'],
};

// ----------------------------------------------------------------------------
// Software Engineering corpus
// ----------------------------------------------------------------------------
// The Enterprise corpus above speaks of businesses, managers and organisations,
// which is right for Enterprise Computing and wrong for a Software Engineering
// class — a Software student's answer on secure architecture should not read like
// a business studies essay. The same banded design, in the course's own terms.
// Quick tips and strengths are course-neutral and are shared (see DEMO_CORPORA).

export const DEMO_SOFTWARE_DRAFTS: Record<DraftBandTier, string[]> = {
  low: [
    '{topic} is important for software teams. It helps them build better programs and makes development faster. Developers use it a lot these days.',
    'I think {topic} is useful because it saves time. There are lots of examples of this in real software. It also takes time to learn properly.',
    '{topic} means using good habits when writing code. This is good for the team and also for the people who end up using the program.',
    'The main thing about {topic} is that it is modern. Software companies need it to stay competitive with other software companies.',
  ],
  mid: [
    '{topic} applies a structured method to a software problem so that the developer can predict how the program will behave. For example, a team building an online store can keep the payment code separate from the product catalogue, so a fault in one part does not stop the other. This makes the system easier to test. However, the benefit depends on the team keeping that separation clear as new features are added.',
    '{topic} works by controlling how the parts of a program depend on one another. A web application that checks user input on the server, rather than trusting the browser, can reject a malformed request before it reaches the database. This is more reliable than checking only on the page, because the user cannot bypass the check. A limitation is that every extra check adds processing time to each request.',
    'The purpose of {topic} in a software project is to reduce the effort needed to find and fix faults. Developers can read unfamiliar code more quickly when its structure is consistent, which shortens the time between a bug report and a fix. This improves maintenance. It does require discipline, and a team that skips the standards will not see the benefit.',
    'A development team applies {topic} to plan its work. By recording how long earlier tasks actually took, the team can estimate the time for new features more accurately. This reduces the risk of missed deadlines. The approach assumes that future tasks resemble past ones, which is not always true when requirements change quickly.',
  ],
  high: [
    'The significance of {topic} lies less in any single technique than in how it changes the decisions a development team makes about risk. By making the structure of a system explicit, it moves the team from repairing faults after release to anticipating where they are likely to appear. A developer who can see that a module is shared by three services will test it carefully before changing it, rather than discovering the dependency when something breaks. This is a material change in how quality is managed.\n\nHowever, the advantage is conditional. A structure is only as sound as the requirements it was designed from. If the security requirements are incomplete, a clean architecture will protect the wrong assets with great consistency, and that consistency makes the gap harder to notice. The risk is compounded when the documentation describes the intended design rather than the system actually built.\n\nOn balance, {topic} delivers substantial value where a team also invests in review and in checking the implementation against the design. Where it is adopted as a set of diagrams alone, it tends to give confidence without evidence.',
    'Evaluating {topic} requires weighing faster delivery against the long-term cost of the decisions it encourages. The delivery case is strong: a well-structured system lets a team change one component without rebuilding the rest, which shortens the interval between an idea and a working feature.\n\nThe counter-consideration is that a simple structure can hide complexity rather than remove it. Moving logic into a shared library shortens each program but concentrates faults in code that many programs depend on. A team that treats the library as finished may under-test exactly the code that matters most.\n\nMy judgement is that {topic} is justified where the team keeps the capacity to test the shared parts thoroughly, and questionable where the structure is adopted only to look orderly. The determining variable is the discipline of testing, not the sophistication of the design.',
  ],
};

export const DEMO_SOFTWARE_FEEDBACK: Record<DraftBandTier, string[]> = {
  low: [
    'This response identifies the topic but does not yet develop it. The claims made are general and are not supported with a specific example, so the marker cannot see evidence of understanding. Aim to name a concrete program or system and explain what happens in it.',
    'The response stays at the level of assertion. Statements such as "it saves time" need to be followed by *how* — which step becomes faster in the code or the process, and what the consequence is for the users. Adding one worked example would lift this considerably.',
  ],
  mid: [
    'A sound response that explains the concept and supports it with a relevant example. The cause-and-effect reasoning is clear. To reach the higher bands, the trade-off raised at the end needs to be developed into a judgement rather than left as an observation — say which consideration outweighs the other, and why.',
    'This demonstrates solid understanding and communicates it competently. The example is well chosen and does real work in the argument. The response would be strengthened by sustaining the analysis further: the second half is thinner than the first, and the concession is stated without being weighed.',
  ],
  high: [
    'A well-developed response that sustains a line of argument and reaches a defensible judgement. The concession is genuinely weighed rather than acknowledged in passing, and the criterion for the judgement is made explicit — this is what distinguishes the top band. The terminology is used accurately throughout.',
    'This is a sophisticated treatment. The link drawn between the design decision and the risk it carries is a genuine insight, and it is carried through to the conclusion rather than abandoned. The judgement is conditional in a way that reflects the complexity of the question rather than hedging it.',
  ],
};

export const DEMO_SOFTWARE_IMPROVEMENTS: Record<DraftBandTier, string[]> = {
  low: [
    'Name a specific program or system and explain what happens in it.',
    'Replace general claims with a cause-and-effect chain.',
    'Address the command verb directly — the question asks for more than a definition.',
  ],
  mid: [
    'Develop the trade-off into a weighed judgement.',
    'Sustain the depth of the opening paragraph through the second half.',
    'Make the criterion for your judgement explicit.',
  ],
  high: [
    'Consider a second case study to test the judgement further.',
    'Tighten the middle paragraph — one supporting point is doing less work than the others.',
  ],
};

/** The course-specific prose one course's demo writing is drawn from. */
export interface DemoCorpus {
  drafts: Record<DraftBandTier, string[]>;
  feedback: Record<DraftBandTier, string[]>;
  improvements: Record<DraftBandTier, string[]>;
}

/**
 * The corpus for each demo course, keyed by course key. Enterprise is the
 * original corpus, untouched, so the Enterprise cohort reads exactly as it did.
 */
export const DEMO_CORPORA: Record<string, DemoCorpus> = {
  enterprise: { drafts: DEMO_DRAFTS, feedback: DEMO_FEEDBACK, improvements: DEMO_IMPROVEMENTS },
  software: {
    drafts: DEMO_SOFTWARE_DRAFTS,
    feedback: DEMO_SOFTWARE_FEEDBACK,
    improvements: DEMO_SOFTWARE_IMPROVEMENTS,
  },
};
