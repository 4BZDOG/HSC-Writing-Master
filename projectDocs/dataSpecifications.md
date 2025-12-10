# HSC AI Evaluator - Data Specifications

## 1. Core Data Philosophy
The HSC AI Evaluator relies on a strictly hierarchical, schema-validated data structure designed to mirror the NESA (New South Wales Education Standards Authority) syllabus format. Data integrity is paramount, ensuring that every AI interaction is grounded in official curriculum standards.

## 2. Hierarchical Structure
The application uses a 5-level deep hierarchy. All IDs must be unique strings, typically generated via `crypto.randomUUID()` or a timestamp fallback.

`Course -> Topic -> SubTopic -> DotPoint -> Prompt`

### Level 1: Course
The root container for a subject.
*   **id** (string): Unique identifier (e.g., `course-software-engineering`).
*   **name** (string): Official course name (e.g., "Software Engineering").
*   **outcomes** (array): List of `CourseOutcome` objects defining the high-level goals.
*   **topics** (array): List of `Topic` objects.

### Level 2: Topic
Represents a major module or unit of work.
*   **id** (string): Unique identifier.
*   **name** (string): Topic title (e.g., "Secure Software Architecture").
*   **subTopics** (array): List of `SubTopic` objects.
*   **performanceBandDescriptors** (array, optional): List of Band 1-6 descriptors specific to this topic.

### Level 3: SubTopic
A sub-section of a topic.
*   **id** (string): Unique identifier.
*   **name** (string): Sub-topic title (e.g., "Designing Software").
*   **dotPoints** (array): List of `DotPoint` objects.

### Level 4: DotPoint
A specific syllabus "learn to" or "learn about" statement. This is the granular unit of curriculum coverage.
*   **id** (string): Unique identifier.
*   **description** (string): The verbatim syllabus text (e.g., "Describe the benefits of developing secure software").
*   **prompts** (array): List of `Prompt` objects (Exam Questions).

### Level 5: Prompt (The Question)
The core interactive unit. Represents a specific exam-style question derived from a Dot Point.
*   **id** (string): Unique identifier.
*   **question** (string): The full text of the question.
*   **verb** (string): The NESA command verb (e.g., "EVALUATE", "EXPLAIN"). *Must be a valid key in the Command Term Dictionary.*
*   **totalMarks** (number): The maximum marks available (Integer).
*   **markingCriteria** (string): A detailed rubric or marking guide.
*   **keywords** (string[]): Syllabus terminology required for a Band 6 response.
*   **sampleAnswers** (array): List of `SampleAnswer` objects (AI or User generated).
*   **scenario** (string, optional): A real-world context/stimulus for the question.
*   **linkedOutcomes** (string[]): Array of Outcome Codes (e.g., `['SE-12-01']`) linked to this question.
*   **userDraft** (string, optional): Transient storage for the user's work-in-progress answer.
*   **isPastHSC** (boolean): Flag indicating if this is an official past paper question.
*   **hscYear** (number, optional): Year of the past paper.

## 3. Validation Rules
All data imported into the system undergoes strict validation using Zod schemas.

1.  **Verb Integrity:** The `verb` field in a Prompt MUST match one of the standard NESA command terms (e.g., Identify, Describe, Explain, Analyse, Evaluate). If an invalid verb is found, the system attempts to normalize it (e.g., "explain" -> "EXPLAIN").
2.  **Mark Logic:** `totalMarks` must be a positive integer.
3.  **Sample Answer Bands:** Sample answers must have a `band` (1-6) and `mark`. The system enforces a strict calculation where the `band` cannot exceed the cognitive Tier of the command verb (e.g., an "Identify" question is capped at Band 2/3 logic regardless of marks).
4.  **Outcome Linking:** Linked outcomes must correspond to valid codes defined in the parent `Course` object.

## 4. AI Content Generation Standards
When the AI generates content (questions, answers, criteria), it adheres to these specifications:

*   **Strict JSON Output:** All AI responses are forced into a valid JSON schema structure to prevent parsing errors.
*   **Tier-Based Complexity:**
    *   *Tier 1 (Identify/Recall)*: Simple, direct answers.
    *   *Tier 4 (Explain/Analyse)*: Cause-and-effect relationships, linking concepts.
    *   *Tier 6 (Evaluate/Justify)*: Judgement based on criteria, nuanced arguments.
*   **Mark Alignment:** Generated sample answers must deliberately target specific mark ranges (e.g., "Write a 3/5 answer") by omitting specific details or keywords found in a full-mark response.

## 5. Import/Export Format
The application uses a standard JSON format for portability.
*   **File Extension:** `.json`
*   **Structure:** Array of `Course` objects.
*   **Conflict Resolution:** The importer detects duplicate IDs and offers "Merge" (update existing) or "Skip" strategies.