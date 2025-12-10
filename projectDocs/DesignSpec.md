
# Design Language & Style Specification

## 1. Design Philosophy

**Cognitive Clarity First**: The interface is designed to reduce cognitive load while providing deep context. It uses a split-pane architecture to keep the user's work (Writing) and the AI's assistance (Context/Feedback) visible simultaneously.

**Tier-Based Visual Language**: The core organising principle is the **Cognitive Tier System**, mapped to NESA Command Verbs. This color-coding is semantic and ubiquitous throughout the app (Badges, Borders, Loading Indicators, Gradients).

*   **Tier 1 (Retrieving):** Red (`--color-danger`)
*   **Tier 2 (Comprehending):** Orange
*   **Tier 3 (Applying):** Yellow (`--color-warning`)
*   **Tier 4 (Analysing):** Green (`--color-success`)
*   **Tier 5 (Synthesising):** Blue (`--color-accent`)
*   **Tier 6 (Evaluating):** Purple (`--color-primary`)

**Glassmorphism & Depth**: The UI utilizes modern glassmorphism. Surfaces use semi-transparent backgrounds with `backdrop-blur` to create depth and hierarchy, allowing the "Aurora" background animations to subtly bleed through, creating a dynamic, living feel.

## 2. Colour System

### CSS Variables (RGB Triplet Format)
The application uses RGB triplets for CSS variables to allow for dynamic opacity manipulation in Tailwind (e.g., `bg-[rgb(var(--color-primary))]/20`).

```css
:root {
    /* Brand & Tier Colors */
    --color-primary: 99 102 241;       /* Indigo 500 */
    --color-primary-dark: 79 70 229;   /* Indigo 600 */
    --color-accent: 14 165 233;        /* Sky 500 */
    --color-accent-glow: 56 189 248;   /* Sky 400 */
    --color-accent-dark: 2 132 199;    /* Sky 600 */
    --color-success: 16 185 129;       /* Emerald 500 */
    --color-warning: 245 158 11;       /* Amber 500 */
    --color-danger: 239 68 68;         /* Red 500 */
    --color-purple: 139 92 246;        /* Violet 500 */
    --color-pink: 236 72 153;          /* Pink 500 */
    
    /* Text Colors */
    --color-text-primary: 243 244 246;   /* Gray 100 */
    --color-text-secondary: 209 213 219; /* Gray 300 */
    --color-text-muted: 156 163 175;     /* Gray 400 */
    --color-text-dim: 107 114 128;       /* Gray 500 */

    /* Surfaces */
    --color-bg-base: 10 15 26;             /* Deep slate (Body) */
    --color-bg-surface: 15 23 42;          /* Card background (Main) */
    --color-bg-surface-elevated: 30 41 59; /* Modals/Dropdowns (Popovers) */
    --color-bg-surface-light: 51 65 85;    /* Hover states */
    --color-bg-surface-inset: 2 6 23;      /* Inputs/Wells */
    
    /* Borders */
    --color-border-primary: 55 65 81;      /* Slate 600 */
    --color-border-secondary: 71 85 105;   /* Slate 600/700 */
    --color-border-accent: 56 189 248;     /* Sky 400 */
}
```

## 3. Component Patterns

### Band Configuration Utility
All tier-based UI elements use the `getBandConfig(band)` utility. This ensures consistency across:
*   `bg`: Low opacity background (e.g., `bg-purple-500/10`).
*   `solidBg`: High opacity background for badges/progress.
*   `border`: Corresponding border color with opacity.
*   `text`: High contrast text color.
*   `gradient`: Linear gradient for headers/buttons.
*   `glow`: Colored box-shadow for active states.

### Surfaces & Layering
*   **Base:** `bg-[rgb(var(--color-bg-base))]` with a radial gradient overlay.
*   **Cards:** `bg-[rgb(var(--color-bg-surface))]` or `bg-[rgb(var(--color-bg-surface))]/80` with `backdrop-blur-md`.
*   **Inputs/Wells:** `bg-[rgb(var(--color-bg-surface-inset))]` creating a "sunk-in" feel.
*   **Modals:** `bg-[rgb(var(--color-bg-surface))]` with heavy `shadow-2xl` and `border`.

### Interactive Elements
*   **Buttons:**
    *   *Primary:* Gradient backgrounds (`bg-gradient-to-r`) with shadow and hover lift.
    *   *Secondary:* Glassmorphism (`bg-surface-inset/50`) with border.
    *   *Action Buttons:* Small icon-only buttons (`w-8 h-8`).
*   **Comboboxes:** Custom implementation with `bg-surface-inset` for depth and `ring` focus states.

## 4. Typography

*   **UI Font:** `Inter` (sans-serif) - Used for all UI chrome, labels, and navigation.
*   **Reading/Writing Font:** `Serif` (System) - Used in the **Editor** and **Sample Answers** to simulate a formal exam paper and improve readability of long-form text.
*   **Data Font:** `JetBrains Mono` - Used for marks, JSON data, and code snippets.

## 5. Motion & Feedback

*   **Entrance Animations:**
    *   `animate-fade-in`: Generic fade for content switching.
    *   `animate-fade-in-up`: Used for cards and modals entering the screen.
    *   `animate-slide-in`: Used for notifications.
*   **Status & Processing:**
    *   `animate-pulse-glow`: Used on containers (like the API health indicator) to breathe.
    *   `animate-shimmer`: Used on skeletons or progress bars to indicate activity.
    *   `animate-spin`: Standard loading state.
*   **Feedback:**
    *   `animate-toast-entry`: Slide-up animations for Toast notifications with color-coded borders (Success/Error/Info).

## 6. Print Styles
The application includes specific `@media print` styles to ensure Evaluation Reports can be exported to PDF cleanly:
*   **Visibility:** Hides UI chrome (Sidebar, Buttons, Modals), showing only `#evaluation-print-container`.
*   **Layout:** Expands the Evaluation Report to full width, removes scrollbars.
*   **Color:** Forces backgrounds to white/light gray to save ink and ensure contrast on paper.
*   **Break Avoidance:** Uses `break-inside: avoid` on criteria blocks to prevent awkward page splits.
