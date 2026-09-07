# HSC AI Evaluator (v2.3.23)

> "An AI-powered cognitive engine that transforms NESA syllabus content into rigorous, exam-ready assessment tasks using Google's Gemini 3.1 Pro architecture."

![Version](https://img.shields.io/badge/version-2.3.23-indigo) ![AI](https://img.shields.io/badge/AI-Gemini_3.1_Pro-purple) ![Status](https://img.shields.io/badge/status-Production_Ready-emerald)

## 🏗️ The Vision

The **HSC AI Evaluator** is not a simple chatbot. It is a structured pedagogical instrument designed to emulate the reasoning of a Senior HSC Marker. It breaks down the barrier between abstract syllabus dot points and concrete exam performance by enforcing **Cognitive Tiers** and **Explicit Marking Criteria**.

## ⚡ Core Capabilities

### 1. The Evaluation Engine

- **Gemini 3.1 Pro Reasoning**: Utilises the `gemini-3.1-pro-preview` model with expanded thinking budgets (up to 4k tokens) to deconstruct student responses.
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
  - **Reasoning**: `gemini-3.1-pro-preview` (Marking, Complex Generation)
  - **Speed**: `gemini-3-flash-preview` (Keyword Extraction, UI Suggestions)
  - **Multi-Provider**: Gemini is the default engine, but an admin "AI Engine" selector can switch the active engine to Anthropic Claude, Groq, Kimi or OpenRouter models (all provider keys are server-side only).
- **Resilience**: Custom `ApiGuard` circuit breaker to manage quota limits and rate-limiting (429s).

## 🚀 Getting Started

Requires **Node 20 or newer**.

1.  **Clone & install** (the flag is what CI and Vercel use, so it reproduces
    the lockfile exactly):
    ```bash
    git clone [repository-url]
    npm ci --legacy-peer-deps
    ```
2.  **Configure your AI key** (server-side only — never bundled):
    ```bash
    cp .env.example .env.local
    # then set GEMINI_API_KEY=... (aistudio.google.com/app/apikeys)
    ```
    That one line is all `npm run dev` needs. Every other variable in the
    template is commented out on purpose — the app treats any value that is
    _set_ as real, so an uncommented placeholder would have it trying to reach
    a Supabase project that does not exist.
3.  **Launch**:
    ```bash
    npm run dev
    ```
    Sign in with a demo account (`admin`/`admin`) or continue as guest.
4.  **Before deploying anywhere**, audit the configuration:
    ```bash
    npm run test:all      # lint, unit tests, type-check
    npm run check:deploy  # the combinations this app fails quietly on
    ```

## 🌐 Hosting

See [**DEPLOYMENT.md**](DEPLOYMENT.md) for the full guide — hosting options,
what every environment variable does, how to verify a deployment actually
works, and how to roll one back. Short version: **Vercel** (free tier) runs
everything including the AI proxy; **GitHub Pages** hosts the offline
experience via the included `deploy-pages.yml` workflow, and can gain working
AI by pointing it at a Vercel-hosted API.

Once deployed, `npm run check:deploy -- --url https://<your-app>` probes the
running site — including whether `/api/gemini` is actually refusing
unauthenticated callers.

## 📚 Documentation Suite

- [**Deployment Guide**](DEPLOYMENT.md): Hosting, verification, rollback, troubleshooting.
- [**Vercel Setup**](projectDocs/VERCEL_SETUP.md) / [**Supabase Setup**](projectDocs/SUPABASE_SETUP.md) / [**Stripe Setup**](docs/stripesetup.md): step-by-step walkthroughs.
- [**Design Specification**](projectDocs/DesignSpec.md): The "Glass & Texture" UI philosophy.
- [**Gold Standard**](projectDocs/GoldStandard.md): The pedagogical rules for question generation.
- [**System Prompt**](projectDocs/systemPrompt.md): The prompt engineering logic behind the AI.
- [**Data Specs**](projectDocs/dataSpecifications.md): Zod schemas and storage models.

---

_Educational Tool | Designed for NSW HSC Context | Powered by Google Gemini_
