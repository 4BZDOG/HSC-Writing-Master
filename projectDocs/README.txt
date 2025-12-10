
HSC AI Writing Evaluator
========================

An advanced, AI-powered educational platform designed to assist students and teachers in mastering NSW Higher School Certificate (HSC) written responses. It acts as an intelligent tutor, bridging the gap between syllabus content and exam performance using Google's Gemini 2.5 models.

Core Philosophy
---------------
The application moves beyond simple spell-checking to act as an expert HSC marker. It is driven by the **NESA Command Verb Hierarchy**, providing feedback, marking, and content generation strictly aligned with specific Performance Bands (1-6) and cognitive tiers.

Key Features
------------

### 1. Intelligent Syllabus Navigator
*   **Hierarchical Browsing:** Deep navigation through Course > Topic > Sub-Topic > Dot Point > Question.
*   **Context-Aware Actions:** The UI adapts to the selected level (e.g., offering to generate dot points for empty sub-topics or suggesting new topics for courses).
*   **Smart Search:** Real-time filtering of questions by content, keyword, or verb.

### 2. AI-Powered Evaluation Engine
*   **Strict Marking:** Evaluates student answers against generated marking criteria with a "ruthless marker" persona using `gemini-2.5-pro`.
*   **Band Alignment:** Assigns a specific Performance Band (1-6) and numerical mark based on cognitive depth.
*   **Detailed Feedback:** Breaks down marks by criteria, highlighting strengths and specific areas for improvement.
*   **Exemplar Generation:** Rewrites student answers to demonstrate a Band 6 standard while preserving the original voice.
*   **Improvement Loop:** Allows users to iteratively "Improve to Band X" based on specific feedback.

### 3. Generative Content Studio
*   **Question Generator:** Creates syllabus-aligned exam questions with scenarios, marking criteria, and keyword lists, tailored to specific mark values.
*   **Sample Answer Engine:**
    *   **Generate:** Create fresh responses targeting specific marks/bands (e.g., "Generate a Band 4 answer").
    *   **Revise:** AI-powered rewriting of existing samples to adjust quality (e.g., "Downgrade this to a Band 3").
    *   **Edit:** Full manual control to refine generated content.
*   **Syllabus Tools:**
    *   **Topic/Dot Point Generation:** AI agents can brainstorm topics or populate empty sub-topics with official-style dot points.
    *   **Scenario Enrichment:** Adds real-world context and scenarios to dry syllabus points.
    *   **Keyword Analysis:** Extracts essential terminology required for high-band responses.
    *   **Full Syllabus Import:** Parses raw text from syllabus documents to structure entire courses automatically.

### 4. Writing Workspace
*   **Live Metrics Dashboard:** Tracks word count, keyword usage, and structural signposts in real-time.
*   **Cognitive Verb Hierarchy:** Interactive guide explaining the requirements of NESA verbs (e.g., 'Describe' vs 'Evaluate').
*   **Reference Materials:** Collapsible panels for Band Descriptors, Marking Criteria, and Keyword lists.
*   **Visual Editor:** Distraction-free writing environment with syntax highlighting for keywords and variable font sizing.

### 5. Robust Data Management
*   **Library System:** Persist and share Courses and Topics across sessions via a local `IndexedDB` library store.
*   **Advanced Import/Export:** Full JSON support with a visual conflict resolution tool (Merge vs Skip strategies).
*   **Validation Engine:** Built-in integrity checker to identify missing IDs, empty fields, or structural errors.
*   **Automated Backups:** Auto-snapshots to `IndexedDB` to prevent data loss, with time-based retention.

### 6. System Architecture & Reliability
*   **API Guard (Circuit Breaker):** Automatically handles API rate limits (429s) and errors. Implements exponential backoff and a "blocked" state to prevent API bans.
*   **Usage Monitoring:** Tracks token usage and API calls per session for transparency.
*   **Smart Caching:** Uses `IndexedDB` to cache AI responses (evaluations, scenarios), reducing latency and costs (TTL 30 days).
*   **Auth Simulation:** Role-based access control (Admin/User/Guest) affecting available features (e.g., Library publishing).

Technical Stack
---------------
*   **Frontend:** React 19, TypeScript, Vite.
*   **Styling:** Tailwind CSS with a custom, CSS-variable driven Tier-based design system.
*   **State Management:** `use-immer` for immutable state updates of complex course structures.
*   **AI Integration:** `@google/genai` SDK (Gemini 2.5 Flash for speed, Gemini 2.5 Pro for reasoning).
*   **Persistence:** `idb` (IndexedDB) for large datasets (Courses, Backups, Cache, Library) and `localStorage` for preferences.
*   **Icons:** `lucide-react`.

Setup & Usage
-------------
1.  **API Key:** Requires a valid Google Gemini API key. The app uses the secure Google AI Studio integration for key selection.
2.  **Initialization:** On first load, you can import the sample "HSC Software Engineering" course or create/import your own via the Data Manager.
3.  **Workflow:** Select a question -> Write response -> Click "Evaluate".
4.  **Iteration:** Use the "Revise" and "Improve" tools to refine understanding.

Data Structure
--------------
The application uses a strict hierarchical model:
`Course -> Topic -> SubTopic -> DotPoint -> Prompt`

All data is stored locally in the browser. No student data is sent to any external server other than the Google Gemini API for processing.
