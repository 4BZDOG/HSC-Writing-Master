# Design Language & Style Specification (v2.2.2)

## 1. Design Philosophy

**Cognitive Clarity First**: The interface is designed to reduce cognitive load while providing deep context. It uses a split-pane architecture to keep the user's work (Writing) and the AI's assistance (Context/Feedback) visible simultaneously.

**Luminous Progression**: The UI is "alive" and reacts to user progress. The **Editor** and **Action Buttons** shift through a chromatic scale (Slate -> Emerald -> Sky -> Indigo) as the response quality and word count increase.

**The "Studio" Aesthetic**: A premium, professional feel achieved through:
*   **Cubic Mesh Textures**: Subtle SVG overlays used in headers and cards to provide tactile depth.
*   **Glassmorphism**: Heavy use of `backdrop-blur-3xl` and semi-transparent surfaces (`bg-surface/80`).
*   **Aurora Motion**: Deep-layer animated blobs in the background to prevent a static feel.

## 2. Colour System

### Brand & Tier Colors (Semantic)
The application uses a 6-tier system mapped to NESA Command Verbs:
*   **Tier 1 (Retrieving)**: Red (`#ef4444`) - Recall, Define.
*   **Tier 2 (Comprehending)**: Orange (`#f97316`) - Describe, Outline.
*   **Tier 3 (Applying)**: Yellow/Amber (`#f59e0b`) - Apply, Calculate.
*   **Tier 4 (Analysing)**: Green/Emerald (`#10b981`) - Explain, Analyse.
*   **Tier 5 (Synthesising)**: Blue/Sky (`#0ea5e9`) - Discuss, Synthesise.
*   **Tier 6 (Evaluating)**: Purple/Indigo (`#6366f1`) - Evaluate, Justify.

### Chromatic Progression (Editor States)
1.  **Draft** (0-15%): Slate themes, focused on initial input.
2.  **Forming** (15-40%): Emerald themes, indicates a viable response is taking shape.
3.  **Polishing** (40-75%): Sky/Blue themes, indicates structural completeness.
4.  **Mastery** (75%+): Indigo/Purple "Glow", indicates potential Exemplar (Band 6) quality.

## 3. Component Patterns

### Layering & Hierarchy
*   **Base**: Deep deep-sea navy (`#0a0f1a`) with noise and radial gradients.
*   **Surface**: Card containers with 1px border (`white/10`) and slight elevation.
*   **Inlay**: Darker, recessed wells (`bg-surface-inset`) for inputs and code blocks.

### Interaction States
*   **Haptic Buttons**: Heavy shadows, 105% hover scaling, and active state compression (95%).
*   **Syllabus Nodes**: Circular "nodes" in the navigator indicate path completeness with pulsing glows.

## 4. Typography
*   **Interface**: `Inter` - High legibility for data-dense controls.
*   **Manuscript**: `Newsreader` (Serif) - Used for the main writing area and AI exemplars to simulate the gravity of an official examination paper.
*   **Telemetry**: `JetBrains Mono` - Used for marks, token counts, and system logs.

## 5. Print & Export
Custom `@media print` styles ensure:
*   Removal of all UI chrome and backgrounds.
*   Transformation of serif text to high-contrast black.
*   Prevention of page breaks within criteria blocks.
*   Standardized 15mm margins.