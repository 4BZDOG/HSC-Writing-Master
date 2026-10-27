/**
 * Quick Start — the first-login guide, and the "how does this work again?"
 * reference you can re-open from your profile at any time.
 *
 * Like `legalContent.ts`, this file is CONTENT. Components render whatever is
 * here, so the guide is extended by editing data:
 *
 *   - Add a step to a track     → push a `QuickStartStep` into its `steps`.
 *   - Add a track for a role    → add it to `QUICK_START_TRACKS` and map the
 *                                 role in `TRACK_FOR_ROLE` (the compiler will
 *                                 point at both when a role is added).
 *   - Add a shortcut / tip      → push onto `POWER_TIPS`.
 *
 * ACCURACY RULE: every step must describe something the app actually does. If
 * a feature is removed, its step goes with it.
 */

import type { UserRole } from '../types';

/**
 * Re-exported for convenience; DEFINED in `agreementVersion.ts`, which has no
 * imports of its own so the Playwright runner can read it.
 */
export { QUICK_START_VERSION } from './agreementVersion';

/** Icon keys resolved to lucide components in `components/agreementIcons.ts`. */
export type QuickStartIcon =
  | 'compass'
  | 'pen'
  | 'sparkles'
  | 'gauge'
  | 'target'
  | 'timer'
  | 'library'
  | 'share'
  | 'chart'
  | 'shield'
  | 'wand'
  | 'flag'
  | 'download'
  | 'eye';

export interface QuickStartStep {
  icon: QuickStartIcon;
  /** Short imperative — "Pick a question", not "Picking a question". */
  title: string;
  body: string;
  /** Concrete sub-points: where to click, what to look for. */
  detail?: string[];
  /** Marks a step as a paid feature so the guide never over-promises. */
  planNote?: string;
}

export type QuickStartAudience = 'student' | 'teacher' | 'guest' | 'parent';

export interface QuickStartTrack {
  audience: QuickStartAudience;
  eyebrow: string;
  title: string;
  /** One sentence that sets expectations, pitched at this audience. */
  intro: string;
  /** Realistic time to work through the steps. */
  timeToRead: string;
  steps: QuickStartStep[];
  /** The single most important thing, shown as a closing note. */
  closer: string;
}

const STUDENT_TRACK: QuickStartTrack = {
  audience: 'student',
  eyebrow: 'Quick start',
  title: 'Your first marked answer, in five steps',
  intro:
    'This is a marker that explains itself. You write an HSC-style answer, it marks it against the syllabus, and it tells you exactly where the marks went — and where the next band is.',
  timeToRead: '2 min read',
  steps: [
    {
      icon: 'compass',
      title: 'Find a question',
      body: 'Use the navigator across the top. It follows the syllabus exactly, so you can go straight to the dot point you are stuck on.',
      detail: [
        'Course → Topic → Sub-topic → Dot point → Question.',
        'The command verb hierarchy under it shows the six tiers of command verbs, from Identify to Evaluate. The question you pick lights up its tier.',
        'No question there yet? Load the curriculum library from the home screen, or ask your teacher for an assignment link.',
      ],
    },
    {
      icon: 'pen',
      title: 'Write like it is the real exam',
      body: 'Answer in the writing area. Draft check, under it, keeps an eye on the basics as you write.',
      detail: [
        'Whether the length suits the marks on offer.',
        'Syllabus terms you have used, and the ones still missing. Tap a missing term to add it.',
        'Sentences that run on, and an answer that needs breaking into paragraphs.',
        'A readiness bar beside Evaluate fills as the draft takes shape. It measures completeness, not the band you will get.',
        'Turn on Focus mode when you want the rest of the screen to disappear.',
      ],
    },
    {
      icon: 'gauge',
      title: 'Get it marked',
      body: 'Press Evaluate. In under a minute you get a mark out of the question’s total, a band, and the reasoning behind both.',
      detail: [
        'A criterion-by-criterion breakdown — which parts earned marks and which did not.',
        'What you did well, and the specific things to fix next time.',
        'The marker’s commentary: why the answer sits in that band.',
      ],
    },
    {
      icon: 'target',
      title: 'Close the gap to the next band',
      body: 'This is the part that actually moves your marks. Do not skip it.',
      detail: [
        'Read the sample answers at each band and compare them to yours — the difference between Band 4 and Band 6 is usually structural, not effort.',
        'Use the answer upgrade to see your own words rewritten one step higher (the next band, or one more mark on a long question), with each change explained.',
        'Tap the question’s command verb to open its guide, and see what "Evaluate" demands that "Describe" does not.',
      ],
      planNote: 'Full band-by-band exemplars and answer upgrades are part of Band 6 Plus.',
    },
    {
      icon: 'timer',
      title: 'Then practise under pressure',
      body: 'Switch from Coach to Exam mode when you want the real thing: a countdown, no live feedback, no exemplars, and a plain exam-paper screen. You get the full marking afterwards.',
      planNote: 'Exam simulation is part of Band 6 Plus.',
    },
  ],
  closer:
    'One properly-read set of feedback beats five rushed attempts. Read why you lost the mark before you write the next answer.',
};

const TEACHER_TRACK: QuickStartTrack = {
  audience: 'teacher',
  eyebrow: 'Quick start',
  title: 'Set your class up in five steps',
  intro:
    'You get everything students get, plus the tools to build the content and see where the cohort actually is. Your staff account already includes the full toolkit.',
  timeToRead: '3 min read',
  steps: [
    {
      icon: 'library',
      title: 'Get your syllabus in',
      body: 'Start from the curriculum library, or build a course from the syllabus itself.',
      detail: [
        'Load Curriculum Library imports the ready-made courses that ship with the app.',
        'Import a Syllabus builds a course from pasted NESA syllabus text or a syllabus URL — topics, sub-topics and dot points are structured for you.',
        'Import a topic, or add courses, topics and dot points by hand, whenever you want finer control.',
      ],
    },
    {
      icon: 'wand',
      title: 'Generate questions worth setting',
      body: 'Pick a dot point and generate exam-style questions with rubrics, or write your own and have them refined.',
      detail: [
        'Generated questions come with marking criteria and the syllabus outcome they assess.',
        'Generate band-level sample answers for any question — useful for modelling in class, not just for students.',
        'Run Quality Check before you publish anything: it screens a question or sample against the syllabus and flags problems.',
      ],
      planNote: 'AI content generation is included with staff and School plans.',
    },
    {
      icon: 'share',
      title: 'Set the work',
      body: 'With a question selected, copy its assignment link. Students who open it land directly on that question — no navigating, no instructions needed.',
      detail: ['The link is on the navigator bar and the breadcrumb, next to the question.'],
    },
    {
      icon: 'chart',
      title: 'See where the class actually is',
      body: 'Two views, both built from real attempts rather than self-report.',
      detail: [
        'Class Insights — which dot points and command terms the cohort is losing marks on.',
        'Student Progress — one student across verb groups over time, so you can see whether the problem is content or command-term handling.',
        'Both are in the header, next to the review queue.',
      ],
    },
    {
      icon: 'shield',
      title: 'Moderate what gets published',
      body: 'The Review Queue holds contributions from teachers and students. Approving one publishes it to every school using the shared library, so read before you approve.',
      detail: [
        'Each item carries an AI quality score to help you triage — it is advice, not a verdict.',
        'Flagged content (from the flag button on any question or sample) lands here too.',
      ],
    },
  ],
  closer:
    'Tell your class the marks are practice feedback, not grades, and that submitting AI-written work for assessment is misconduct. Two minutes at the start saves an integrity conversation later.',
};

const GUEST_TRACK: QuickStartTrack = {
  audience: 'guest',
  eyebrow: 'Quick start',
  title: 'Having a look around',
  intro:
    'You are in a guest session — a read-only trial. Have a proper look, then make an account when you want your work to stick.',
  timeToRead: '1 min read',
  steps: [
    {
      icon: 'compass',
      title: 'Browse the real thing',
      body: 'The navigator across the top follows the syllabus exactly: Course → Topic → Sub-topic → Dot point → Question. Everything you can see is what students see.',
    },
    {
      icon: 'eye',
      title: 'Read a question properly',
      body: 'Open one and read its marking guide, the criteria a marker works through. That is the part teachers usually care about.',
    },
    {
      icon: 'sparkles',
      title: 'What a guest session cannot do',
      body: 'Nothing is saved to our servers, your work disappears when you clear your browser, and AI marking may be unavailable — it needs a signed-in account so one visitor cannot spend everyone’s allowance.',
    },
    {
      icon: 'target',
      title: 'Make an account when you are ready',
      body: 'Signing up is free and keeps your work, your progress and your streak. The free plan includes daily marked evaluations at no cost.',
    },
  ],
  closer: 'Nothing here is billed until you choose a paid plan. The free plan stays free.',
};

const PARENT_TRACK: QuickStartTrack = {
  audience: 'parent',
  eyebrow: 'Quick start',
  title: 'Link your child in five steps',
  intro:
    'You link to your child’s account to see how they are going, and you can pay for their Band 6 Plus. Nothing is linked without their code, and you can stop at any time.',
  timeToRead: '2 min read',
  steps: [
    {
      icon: 'share',
      title: 'Get the code from your child',
      body: 'Your child makes the link, not you. They create a link code under Parent or guardian in their profile and give it to you.',
      detail: [
        'The code works once and expires after seven days. If it has lapsed, ask them to make a new one.',
        'Enter it under Link a child on your dashboard, with or without the hyphen.',
        'You can link up to six children.',
      ],
    },
    {
      icon: 'eye',
      title: 'See how they are going',
      body: 'Each child has a card on your dashboard with their plan and a read-only progress summary.',
      detail: [
        'Attempts, average band and average marks for each command verb, and a recent band trend.',
        'Their written answers are never shown to you. The summary is there to support their practice, not to watch it.',
      ],
    },
    {
      icon: 'sparkles',
      title: 'Pay for their Band 6 Plus',
      body: 'Choose Get Band 6 Plus on a child’s card. You pay, and the plan goes onto their account.',
      detail: [
        'Pick monthly or yearly, then check out with Stripe. Your child gets the plan once payment goes through.',
        'The card belongs to you, and the plan is theirs. A child on a school licence already has Plus, so there is nothing to buy.',
      ],
      planNote: 'Band 6 Plus is the paid plan a parent can buy for a child.',
    },
    {
      icon: 'gauge',
      title: 'Manage billing in one place',
      body: 'Manage billing opens the billing portal, where you update your card or cancel.',
      detail: [
        'Your subscription renews until you cancel it. Your child keeps the plan to the end of the period you have paid for.',
        'Manage billing stays on your dashboard for as long as you pay for any plan, even after you remove a link.',
      ],
    },
    {
      icon: 'shield',
      title: 'Remove a link whenever you like',
      body: 'Either of you can remove a link at any time. Use the Remove link button on the child’s card. Your child can also remove it from their side.',
      detail: [
        'Removing a link stops you seeing their progress. It does not cancel a plan you pay for.',
      ],
    },
  ],
  closer:
    'Removing a link does not stop a plan you pay for. If you want the payments to stop, cancel in Manage billing first.',
};

export const QUICK_START_TRACKS: Record<QuickStartAudience, QuickStartTrack> = {
  student: STUDENT_TRACK,
  teacher: TEACHER_TRACK,
  guest: GUEST_TRACK,
  parent: PARENT_TRACK,
};

/**
 * Which guide each role reads, keyed on every `UserRole`: a new role is a
 * compile error here until it has a guide. Admins read the teacher track — they
 * have every teacher tool plus system administration, and the admin-only
 * surfaces are self-explanatory to whoever was given the role.
 */
export const TRACK_FOR_ROLE: Record<UserRole, QuickStartAudience> = {
  admin: 'teacher',
  teacher: 'teacher',
  user: 'student',
  guest: 'guest',
  parent: 'parent',
};

export const trackForRole = (role: UserRole): QuickStartTrack =>
  QUICK_START_TRACKS[TRACK_FOR_ROLE[role]];

export interface PowerTip {
  label: string;
  body: string;
}

/** Small things that make the app feel faster once you know them. */
export const POWER_TIPS: PowerTip[] = [
  {
    label: 'Esc',
    body: 'Closes any panel, and leaves Focus mode.',
  },
  {
    label: 'Collapse to breadcrumb',
    body: 'Folds the navigator away once you have picked a question, so the screen belongs to your writing.',
  },
  {
    label: 'Flag anything odd',
    body: 'Every question and sample answer has a flag button. One tap sends it to a reviewer.',
  },
  {
    label: 'Your streak is real',
    body: 'It counts consecutive days you turned up, and it lives in your profile with your band average and words written.',
  },
];
