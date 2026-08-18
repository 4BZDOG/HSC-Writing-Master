// types.ts

export type PromptVerb =
  | 'IDENTIFY'
  | 'STATE'
  | 'RECALL'
  | 'DEFINE'
  | 'EXTRACT'
  | 'RECOUNT'
  | 'OUTLINE'
  | 'DESCRIBE'
  | 'CLARIFY'
  | 'SUMMARISE'
  | 'CLASSIFY'
  | 'CALCULATE'
  | 'APPLY'
  | 'DEMONSTRATE'
  | 'CONSTRUCT'
  | 'COMPARE'
  | 'CONTRAST'
  | 'DISTINGUISH'
  | 'EXPLAIN'
  | 'INTERPRET'
  | 'DEDUCE'
  | 'EXTRAPOLATE'
  | 'PREDICT'
  | 'ANALYSE'
  | 'EXAMINE'
  | 'ACCOUNT'
  | 'DISCUSS'
  | 'PROPOSE'
  | 'INVESTIGATE'
  | 'SYNTHESISE'
  | 'ASSESS'
  | 'EVALUATE'
  | 'APPRECIATE'
  | 'JUSTIFY'
  | 'RECOMMEND'
  | 'CRITICALLY ANALYSE'
  | 'CRITICALLY EVALUATE'
  | 'DIFFERENTIATE';

/**
 * Which year of a two-year NSW course something belongs to.
 *
 * Every senior course runs across Year 11 (Preliminary) and Year 12 (HSC) with
 * entirely separate topics, sub-topics and syllabus points — they are two
 * syllabuses under one course name, not one syllabus a student progresses
 * through. Absent means Year 12: everything authored before this existed is
 * HSC content, and the app defaults there.
 */
export type SyllabusYear = 'year11' | 'year12';

export interface CourseOutcome {
  code: string;
  description: string;
  /**
   * Outcomes are stage-specific too (BI-11-01 is not BI-12-01). Optional and
   * defaulted the same way as a topic's: a course whose outcomes carry no year
   * shows all of them in both, which is what every existing course does.
   */
  year?: SyllabusYear;
}

/**
 * A user-raised "this content looks off" report on a question or sample
 * answer. Stays attached to the item (rides along on export/sync) until an
 * admin — or a future AI audit pass — resolves it.
 */
export interface ContentFlag {
  reason: string;
  flaggedAt: number;
  flaggedBy?: string;
  status: 'open' | 'resolved';
}

export interface SampleAnswer {
  id: string;
  band: number;
  answer: string;
  mark: number;
  source: 'AI' | 'USER' | 'HSC_EXEMPLAR';
  /**
   * True when an `AI` sample is a rewrite of a student's OWN response — the
   * improved answer from marking, rather than an exemplar written from scratch.
   * It reads differently and should be trusted differently (it inherits the
   * student's structure and voice), so the library labels it as its own thing.
   */
  derivedFromStudent?: boolean;
  feedback?: string;
  quickTip?: string;
  contentFlag?: ContentFlag;
}

export interface ScenarioImageRef {
  /** Equal to the owning Prompt's id — one image per scenario, so the prompt
   *  id doubles as the lookup key into the scenario-images IDB store and the
   *  Supabase Storage object path. */
  id: string;
  alt?: string;
  /** Epoch ms — lets a cached carousel image know it's stale. */
  updatedAt: number;
  /** Present only once synced to Supabase Storage (bucket `scenario-images`,
   *  object path `${promptId}/${id}`). Absent in pure-IDB/offline mode. */
  storagePath?: string;
}

export interface Prompt {
  id: string;
  question: string;
  totalMarks: number;
  verb: PromptVerb;
  highlightedQuestion?: string;
  scenario?: string;
  scenarioImage?: ScenarioImageRef;
  linkedOutcomes?: string[];
  estimatedTime?: string;
  relatedTopics?: string[];
  prerequisiteKnowledge?: string[];
  markerNotes?: string[];
  commonStudentErrors?: string[];
  keywords?: string[];
  markingCriteria?: string;
  targetPerformanceBands?: number[];
  sampleAnswers?: SampleAnswer[];
  isPastHSC?: boolean;
  hscYear?: number;
  hscQuestionNumber?: string;
  userDraft?: string;
  /**
   * AI quality pre-screen (0–100 + reviewer notes), set by the audit studio's
   * "Screen Quality" batch action. Advisory triage data: rides along when the
   * prompt syncs to the shared library so reviewers see it in the queue.
   */
  qualityScore?: number;
  qualityNotes?: string;
  contentFlag?: ContentFlag;
}

export interface DotPoint {
  id: string;
  description: string;
  prompts: Prompt[];
  /**
   * The focus areas (the "including …" list) a teacher has set by hand.
   *
   * Absent means "derive them from the description" — the usual case, handled
   * by `parseSubItemsFromDescription`. That parser is a heuristic over prose a
   * syllabus author never wrote for it, so it sometimes splits a clause in the
   * wrong place or misses a list entirely. Once this is set it WINS, including
   * when set to an empty array, which is how a teacher says "this dot point has
   * no focus areas" and silences a bad parse.
   */
  focusAreas?: string[];
}

export interface SubTopic {
  id: string;
  name: string;
  dotPoints: DotPoint[];
}

export interface PerformanceBandDescriptor {
  band: number;
  label: string;
  shortLabel: string;
  description: string;
}

export interface Topic {
  id: string;
  name: string;
  subTopics: SubTopic[];
  performanceBandDescriptors?: PerformanceBandDescriptor[];
  /** Year 11 or Year 12 content. Absent means Year 12 — see SyllabusYear. */
  year?: SyllabusYear;
}

export interface Course {
  id: string;
  name: string;
  subject?: string;
  /**
   * Admin publication gate. Absent (or 'published') means visible to everyone
   * — the same "absence means what it always meant" rule as every other
   * additive field (see Topic.year, DotPoint.focusAreas). 'draft' hides the
   * course from anyone who is not canCreateCurriculum (admin), so new/seeded
   * content can be built and reviewed before students or teachers see it
   * exists. Maps to the existing Supabase `courses.status` column in remote
   * mode ('approved' -> published, anything else -> draft) — see
   * services/curriculumService.ts.
   */
  status?: 'draft' | 'published';
  outcomes: CourseOutcome[];
  topics: Topic[];
}

export interface StatePath {
  courseId?: string;
  /**
   * Which year of the selected course is being navigated. Absent means Year 12,
   * so a path saved before this existed restores exactly where it was.
   */
  syllabusYear?: SyllabusYear;
  topicId?: string;
  subTopicId?: string;
  dotPointId?: string;
  promptId?: string;
  selectedSubItems?: string[];
}

/**
 * One level of the Course → Topic → Sub-Topic → Dot Point path, as the
 * breadcrumb renders it. Shared so the path is built once, in `App.tsx`, and
 * consumed by both the collapsed navigator bar and the workspace breadcrumb —
 * they used to construct it separately and drifted apart.
 */
export interface SyllabusCrumb {
  label: string;
  /**
   * A qualifier on the label that is not part of its name — the syllabus year
   * on the course crumb. Rendered as a chip, kept OUT of `label` so
   * `crumbs.map((c) => c.label)` still yields the plain names the PDF export
   * and the AI hierarchy context consume.
   */
  badge?: string;
  onClick?: () => void;
}

export interface EvaluationCriterion {
  criterion: string;
  mark: number;
  maxMark: number;
  feedback: string;
}

export interface EvaluationResult {
  overallMark: number;
  overallBand: number;
  overallFeedback: string;
  quickTip?: string; // New field for short, punchy feedback
  strengths: string[];
  improvements: string[];
  criteria: EvaluationCriterion[];
  revisedAnswer?:
    | string
    | {
        text: string;
        mark: number;
        band?: number;
        keyChanges: string[];
      };
  userFeedback?: UserFeedback;
}

export interface UserFeedback {
  rating: 'positive' | 'negative';
  reason: string;
  timestamp: number;
}

export interface HierarchyContext {
  course: string;
  topic: string;
  subTopic: string;
  dotPoint: string;
}

/**
 * App roles. `teacher` curates content and moderates the review queue but has
 * no system-administration access (Database Manager, Data Vault, bulk AI
 * tools) — see utils/permissions.ts for the capability mapping.
 */
export type UserRole = 'admin' | 'teacher' | 'user' | 'guest';

export interface UserStats {
  xp: number;
  level: number;
  questionsAnswered: number;
  totalWordsWritten: number;
  averageBand: number;
  lastActive: number;
  streakDays: number;
}

/**
 * The student's writing experience:
 * - `coach`: live feedback on — keyword/verb highlighting, live insights,
 *   syllabus-term tracking, logic connectors, band-progress, and exemplars.
 * - `exam`: HSC exam simulation — no assistance, no exemplars, marking guide
 *   hidden, a countdown timer running, and a calm exam-paper aesthetic.
 */
export type WritingMode = 'coach' | 'exam';

export interface UserPreferences {
  defaultFocusMode: boolean;
  autoSave: boolean;
  highContrast: boolean;
  showTips: boolean;
  theme: 'dark' | 'light';
}

/**
 * The user agreement the account has accepted. `version` is compared against
 * `AGREEMENT_VERSION` in data/legalContent.ts — bumping that re-prompts
 * everyone and shows them what changed.
 */
export interface UserAgreement {
  version: string;
  /** Epoch milliseconds. */
  acceptedAt: number;
  /**
   * Which charter they read. Students and staff agree to materially different
   * things — the staff charter covers student visibility and moderation — so a
   * promoted account has to read the other one. Absent on records written
   * before this was tracked, which are accepted as-is rather than re-prompted.
   */
  audience?: 'student' | 'teacher';
}

export interface User {
  username: string;
  role: UserRole;
  displayName: string;
  preferences: UserPreferences;
  stats: UserStats;
  /** Absent until the user accepts; see services/agreementService.ts. */
  agreement?: UserAgreement;
  /** Version of the quick-start guide this user has already been shown. */
  quickStartSeenVersion?: string;
  /** Stripe-resolved plan override. Set by the webhook handler when a
   *  checkout completes or a subscription changes. Absent until Stripe is
   *  live — getUserPlan() falls back to role-based resolution. */
  stripePlan?: 'free' | 'plus' | 'school';
  /** ISO date the current billing period ends (renewal or expiry). */
  planPeriodEnd?: string;
}

export interface BackgroundTask {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  progress: number;
  message: string;
  error?: string;
  courseId?: string;
}

export interface LibraryItem {
  id: string;
  type: 'course' | 'topic' | 'subTopic';
  title: string;
  data: Course | Topic | SubTopic;
  timestamp: number;
}

export interface QualityCheckIssue {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestion: string;
}

export interface QualityCheckResult {
  status: 'PASS' | 'FAIL' | 'WARN';
  score: number;
  summary: string;
  issues: QualityCheckIssue[];
  refinedContent?: string;
}

export interface DataValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalCourses: number;
    totalTopics: number;
    totalSubTopics: number;
    totalDotPoints: number;
    totalPrompts: number;
    promptsWithSampleAnswers: number;
    promptsWithKeywords: number;
    averagePromptsPerDotPoint: number;
  };
}

export interface CommandTermInfo {
  term: PromptVerb;
  definition: string;
  tip: string;
  tier: number;
  markRange: [number, number];
  charRange: [number, number];
  pageEstimate: string;
  timeRange: [number, number];
  syllabusTerms: [number, number];
  bandDiscrimination: string;
  genericMarkingGuide: string[];
  structuralKeywords: string[];
  exampleQuestion: string;
  tailwind: {
    color: string;
    bg: string;
  };
}
