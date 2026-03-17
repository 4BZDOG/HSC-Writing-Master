# HSC AI Evaluator (v2.2.1)

> "An AI-powered cognitive engine that transforms NESA syllabus content into rigorous, exam-ready assessment tasks using Google's Gemini 3 architecture."

![Version](https://img.shields.io/badge/version-2.2.1-indigo) ![AI](https://img.shields.io/badge/AI-Gemini_3_Pro-purple) ![Status](https://img.shields.io/badge/status-Production_Ready-emerald)

## 🏗️ The Vision

The **HSC AI Evaluator** is not a simple chatbot. It is a structured pedagogical instrument designed to emulate the reasoning of a Senior HSC Marker. It breaks down the barrier between abstract syllabus dot points and concrete exam performance by enforcing **Cognitive Tiers** and **Explicit Marking Criteria**.

## ⚡ Core Capabilities

### 1. The Evaluation Engine

- **Gemini 3 Pro Reasoning**: Utilizes the latest `gemini-3-pro-preview` model with expanded thinking budgets (up to 8k tokens) to deconstruct student responses.
- **Ruthless Marking Persona**: Applies a strict "Band Cut-off" logic. A response that "Describes" when asked to "Analyse" is capped at Band 3, regardless of length.
- **The Improvement Loop**: Provides specific, actionable "Band N+1" feedback to guide students to the next performance level.

### 2. The Content Studio

- **Curriculum Navigator**: Deep hierarchical browsing (Course > Topic > Sub-Topic > Dot Point).
- **Prompt Generator**: Synthesizes exam-style questions with valid marking rubrics and scenarios based on syllabus outcomes.
- **Content Audit**: A bulk-processing dashboard that scans entire courses for gaps, automatically generating questions and samples for empty syllabus points.

### 3. Data Integrity & Persistence

- **Offline-First**: Powered by `idb`, storing all curriculum data, user drafts, and history locally in the browser.
- **Data Vault**: Advanced import/export capabilities with conflict resolution and automated hourly snapshots ("Time Machine").
- **Health Rings**: Visual indicators of syllabus coverage density.

## 🛠️ Technical Architecture

- **Frontend**: React 19, TypeScript, Vite
- **State**: `use-immer` for immutable complex state trees
- **Styling**: Tailwind CSS with a Semantic Tier-based Colour System
- **AI Layer**: `@google/genai` SDK
  - **Reasoning**: `gemini-3-pro-preview` (Marking, Complex Generation)
  - **Speed**: `gemini-3-flash-preview` (Keyword Extraction, UI Suggestions)
- **Resilience**: Custom `ApiGuard` circuit breaker to manage quota limits and rate-limiting (429s).

## 🚀 Getting Started

1.  **Clone & Install**:
    ```bash
    git clone [repository-url]
    npm install
    ```
2.  **Launch**:
    ```bash
    npm run dev
    ```
3.  **Authenticate**:
    The application utilizes Google's secure AI Studio integration. You will be prompted to select your API Key context upon launching the evaluation engine.

## 📚 Documentation Suite

- [**Design Specification**](projectDocs/DesignSpec.md): The "Glass & Texture" UI philosophy.
- [**Gold Standard**](projectDocs/GoldStandard.md): The pedagogical rules for question generation.
- [**System Prompt**](projectDocs/systemPrompt.md): The prompt engineering logic behind the AI.
- [**Data Specs**](projectDocs/dataSpecifications.md): Zod schemas and storage models.

---

_Educational Tool | Designed for NSW HSC Context | Powered by Google Gemini_
