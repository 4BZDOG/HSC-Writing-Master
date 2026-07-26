/**
 * Quick Start — the first-login guide, and the "how does this work again?"
 * reference you can re-open from your profile at any time.
 *
 * Like `legalContent.ts`, this file is CONTENT. Components render whatever is
 * here, so the guide is extended by editing data:
 *
 *   - Add a step to a track     → push a `QuickStartStep` into its `steps`.
 *   - Add a track for a role    → add it to `QUICK_START_TRACKS` and map the
 *                                 role in `trackForRole()`.
 *   - Add a shortcut / tip      → push onto `POWER_TIPS`.
 *
 * ACCURACY RULE: every step must describe something the app actually does. If
 * a feature is removed, its step goes with it.
 */

import type { UserRole } from '../types';

/**
 * Bump when the guide changes substantially enough that returning users
 * should be shown it again on their next visit. Cosmetic edits do not need a
 * bump — the guide is always re-openable from the header and the profile.
 */
export const QUICK_START_VERSION = '1.0';

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

export type QuickStartAudience = 'student' | 'teacher' | 'guest';

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
        'The coloured strip underneath shows the command-term tiers — from Identify at the bottom to Evaluate at the top. The question you pick lights up its tier.',
        'No question there yet? Load the curriculum library from the home screen, or ask your teacher for an assignment link.',
      ],
    },
    {
      icon: 'pen',
      title: 'Write like it is the real exam',
      body: 'Answer in the writing area. The panel beside it is watching for the things markers actually reward.',
      detail: [
        'Syllabus terms you have used — and the ones you are missing.',
        'Whether your verbs match the command term the question asked for.',
        'Logic connectors ("therefore", "however") that signal a developed argument.',
        'A live estimate of the band you are writing at.',
        'Hit Focus Mode when you want the rest of the screen to disappear.',
      ],
    },
    {
      icon: 'gauge',
      title: 'Get it marked',
      body: 'Press Evaluate. In a few seconds you get a mark out of the question’s total, a band, and the reasoning behind both.',
      detail: [
        'A criterion-by-criterion breakdown — which parts earned marks and which did not.',
        'What you did well, and the specific things to fix next time.',
        'Marker notes: the mistakes real HSC markers see most often on this question.',
      ],
    },
    {
      icon: 'target',
      title: 'Close the gap to the next band',
      body: 'This is the part that actually moves your marks. Do not skip it.',
      detail: [
        'Read the sample answers at each band and compare them to yours — the difference between Band 4 and Band 6 is usually structural, not effort.',
        'Use the answer upgrade to see your own words rewritten one band higher, with the changes called out.',
        'Open the Command Term Guide to see what "Evaluate" demands that "Describe" does not.',
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
        'Generated questions come with marking criteria, marker notes, common student errors and linked outcomes.',
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
      body: 'Open one and look at the marking criteria, the marker notes and the common student errors. That is the part teachers usually care about.',
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

export const QUICK_START_TRACKS: Record<QuickStartAudience, QuickStartTrack> = {
  student: STUDENT_TRACK,
  teacher: TEACHER_TRACK,
  guest: GUEST_TRACK,
};

/**
 * Which guide a role reads. Admins read the teacher track — they have every
 * teacher tool plus system administration, and the admin-only surfaces are
 * self-explanatory to whoever was given the role.
 */
export const trackForRole = (role: UserRole): QuickStartTrack => {
  switch (role) {
    case 'admin':
    case 'teacher':
      return QUICK_START_TRACKS.teacher;
    case 'guest':
      return QUICK_START_TRACKS.guest;
    default:
      return QUICK_START_TRACKS.student;
  }
};

export interface PowerTip {
  label: string;
  body: string;
}

/** Small things that make the app feel faster once you know them. */
export const POWER_TIPS: PowerTip[] = [
  {
    label: 'Esc',
    body: 'Closes any panel, and leaves Focus Mode.',
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
