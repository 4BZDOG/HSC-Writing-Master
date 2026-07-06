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

export interface CourseOutcome {
  code: string;
  description: string;
}

export interface SampleAnswer {
  id: string;
  band: number;
  answer: string;
  mark: number;
  source: 'AI' | 'USER' | 'HSC_EXEMPLAR';
  feedback?: string;
  quickTip?: string;
}

export interface Prompt {
  id: string;
  question: string;
  totalMarks: number;
  verb: PromptVerb;
  highlightedQuestion?: string;
  scenario?: string;
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
}

export interface DotPoint {
  id: string;
  description: string;
  prompts: Prompt[];
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
}

export interface Course {
  id: string;
  name: string;
  subject?: string;
  outcomes: CourseOutcome[];
  topics: Topic[];
}

export interface StatePath {
  courseId?: string;
  topicId?: string;
  subTopicId?: string;
  dotPointId?: string;
  promptId?: string;
  selectedSubItems?: string[];
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

export interface User {
  username: string;
  role: UserRole;
  displayName: string;
  preferences: UserPreferences;
  stats: UserStats;
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
  tier: number;
  markRange: [number, number];
  bandDiscrimination: string;
  genericMarkingGuide: string[];
  structuralKeywords: string[];
  exampleQuestion: string;
  tailwind: {
    color: string;
    bg: string;
  };
}
