# HSC AI Evaluator - Feature Roadmap

## 1. Current Capabilities (v2.2.0)

### 🧭 Intelligent Syllabus Navigator
*   **Deep Hierarchy Browsing:** Seamless navigation through Course > Topic > Sub-Topic > Dot Point > Question.
*   **Progress Tracking:** Visual health rings indicating coverage of syllabus dot points.
*   **Smart Search:** Fuzzy search for questions with typo tolerance.
*   **Contextual Actions:** "Add Question", "Generate Dot Points", and "Import Topic" actions available at relevant hierarchy levels.

### 🧠 AI-Powered Evaluation Engine
*   **Ruthless Marking:** Uses a specific "HSC Marker" persona to provide strict, evidence-based feedback.
*   **Band & Mark Assessment:** Automatically assigns a Band (1-6) and numerical mark based on NESA standards.
*   **Criteria Breakdown:** Detailed feedback on specific marking criteria (e.g., "Explains relationship", "Uses examples").
*   **Feedback Loop:** "Improve Answer" workflow allowing students to iteratively refine their work.
*   **Exemplar Generation:** Generates a "Next Step" exemplar (Band N+1) to show students exactly how to improve.

### ✍️ Writing Workspace
*   **Distraction-Free Editor:** Rich text editor with syntax highlighting for syllabus keywords and command verbs.
*   **Real-Time Metrics:** Live word count, keyword usage tracking, and "Band Trajectory" estimation.
*   **Live Coach:** Ambient feedback banner providing nudges (e.g., "Try adding a concrete example").
*   **Split-View Reference:** "Reference Materials" pane with Marking Criteria and Band Descriptors visible while writing.

### 🎨 Generative Content Studio
*   **Question Generator:** AI creation of syllabus-aligned questions with scenarios and criteria.
*   **Sample Answer Studio:** Generate sample answers for *any* mark level (e.g., "Show me a 3/5 answer vs a 5/5 answer").
*   **Syllabus Importer:** Parse raw text from PDF/Word documents into structured Course objects.
*   **Context Enrichment:** Auto-generate keywords and scenarios for bare-bones questions.

### 🛠️ Data Management & Admin
*   **Library System:** Persistent local database (IndexedDB) for storing courses.
*   **Import/Export:** Full JSON import/export with conflict resolution.
*   **Content Audit:** Admin tool to scan for empty topics or missing sample answers and bulk-generate content.
*   **Safety Guard:** API circuit breaker to prevent rate-limiting bans.

---

## 2. Future Planned Enhancements

### Phase 1: Enhanced Analytics (Next)
*   **Student Progress Dashboard:** Visualise improvement over time (avg. band score, questions answered).
*   **Weakness Detection:** Identify specific syllabus dot points or command verbs where the student consistently scores low.
*   **Comparative Analytics:** Compare student performance against the "class average" (simulated or real).

### Phase 2: Advanced AI Features
*   **Persona Switching:** Allow users to toggle marker personas (e.g., "Strict HSC Marker", "Supportive Tutor", "Peer Reviewer").
*   **Multimodal Inputs:** Allow uploading images of handwritten responses for OCR and evaluation.
*   **Socratic Tutor Mode:** A chat interface where the AI asks guiding questions instead of just giving the answer.

### Phase 3: Collaboration & Cloud
*   **Classroom Mode:** Allow teachers to create assignments and view student submissions.
*   **Shared Library:** Cloud-based sharing of Courses and Topics between users.
*   **Peer Review:** Enable students to anonymously mark each other's work using the AI rubric.

### Phase 4: Accessibility & Localisation
*   **Voice Mode:** Speech-to-text for answering and Text-to-speech for feedback.
*   **Subject Expansion:** Pre-seeded templates for Humanities, Science, and English courses.