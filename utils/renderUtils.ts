import React from 'react';
import { PromptVerb } from '../types';
import { getTierTargetBand } from '../data/commandTerms';
import {
  expandFracToSlash,
  expandMathSymbolTokens,
  expandSqrt,
  expandSubscriptsToUnicode,
  expandSuperscriptsToUnicode,
  expandVector,
  stripInlineMathDollars,
} from './mathNotation';

export const escapeRegExp = (string: string): string => {
  if (typeof string !== 'string') return '';
  return string.replace(new RegExp('[.*+?^${}()|[\\]\\\\]', 'g'), '\\$&');
};

/**
 * Stems that take -our in British/Australian spelling and -or in American.
 * An explicit list rather than a rule: a blanket `our$ -> or$` also rewrites
 * "four", "hour", "tour" and "flour", and every one of those variants would
 * then light up ordinary prose as a syllabus keyword.
 */
const OUR_STEMS = [
  'behavi',
  'col',
  'fav',
  'flav',
  'hon',
  'hum',
  'lab',
  'neighb',
  'odd',
  'rig',
  'rum',
  'sav',
  'vap',
  'vig',
  'endeav',
  'harb',
  'arm',
  'parl',
];

/** Word pairs with no productive rule behind them. */
const WORD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['programme', 'program'],
  ['defence', 'defense'],
  ['licence', 'license'],
  ['offence', 'offense'],
  ['practise', 'practice'],
  ['metre', 'meter'],
  ['litre', 'liter'],
  ['fibre', 'fiber'],
  ['centre', 'center'],
];

/**
 * British/American spelling swaps for a term. The app is British/Australian
 * English throughout, but students type both, and a keyword must be credited
 * either way — a response that says "behavior" is still using the syllabus
 * term "behaviour". Returns the term plus every spelling twin.
 */
const spellingSwaps = (t: string): string[] => {
  const out = new Set([t]);
  const add = (s: string) => {
    if (s !== t) out.add(s);
  };

  // analyse ↔ analyze, optimisation ↔ optimization
  add(t.replace(/([iy])s(e[sd]?|es|ing|ations?)/gi, '$1z$2'));
  add(t.replace(/([iy])z(e[sd]?|es|ing|ations?)/gi, '$1s$2'));

  // behaviour ↔ behavior, colour ↔ color — including inflected forms
  // ("behavioural", "coloured"), which is why the suffix is optional.
  for (const stem of OUR_STEMS) {
    add(t.replace(new RegExp(`\\b(${stem})our\\b`, 'gi'), '$1or'));
    add(t.replace(new RegExp(`\\b(${stem})our(s|ed|ing|al|ally|able|less)\\b`, 'gi'), '$1or$2'));
    add(t.replace(new RegExp(`\\b(${stem})or\\b`, 'gi'), '$1our'));
    add(t.replace(new RegExp(`\\b(${stem})or(s|ed|ing|al|ally|able|less)\\b`, 'gi'), '$1our$2'));
  }

  // modelling ↔ modeling, labelled ↔ labeled. The 4-character stem floor keeps
  // this off short words where the doubled form is a DIFFERENT word — without
  // it "filing" would also match "filling".
  add(t.replace(/([a-z]{4,})ll(ing|ed|er|ers)\b/gi, '$1l$2'));
  add(t.replace(/([a-z]{4,})l(ing|ed|er|ers)\b/gi, '$1ll$2'));

  // catalogue ↔ catalog, dialogue ↔ dialog. The stem floor keeps "log", "blog"
  // and "dog" out of it.
  add(t.replace(/([a-z]{3,})ogue\b/gi, '$1og'));
  add(t.replace(/([a-z]{4,})og\b/gi, '$1ogue'));

  for (const [a, b] of WORD_PAIRS) {
    add(t.replace(new RegExp(`\\b${a}`, 'gi'), b));
    add(t.replace(new RegExp(`\\b${b}`, 'gi'), a));
  }

  return Array.from(out);
};

/**
 * Separator equivalence: client-side ↔ client side ↔ clientside. Students
 * close, hyphenate and space compound terms interchangeably —
 * "semi-conservative", "semi conservative" and "semiconservative" are the same
 * answer and must all be credited.
 */
const hyphenSwaps = (t: string): string[] => {
  const out = new Set([t]);
  if (t.includes('-')) {
    out.add(t.replace(/-/g, ' '));
    out.add(t.replace(/-/g, ''));
  }
  if (/\w \w/.test(t)) {
    out.add(t.replace(/ /g, '-'));
    // Only single-space compounds close up: joining a long phrase produces a
    // string no student would ever type.
    if (t.split(' ').length === 2) out.add(t.replace(/ /g, ''));
  }
  return Array.from(out);
};

/**
 * Words that carry no letter into an initialism. "Cost of goods sold" is CGS to
 * everyone who writes it down.
 */
const INITIALISM_STOP_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in']);

/**
 * Three-letter strings that are ordinary English words far more often than they
 * are anybody's initialism.
 *
 * Without this, a syllabus term like "customer analysis needs" would derive
 * "CAN" and light up — and credit the student for — every "can" in their
 * response. The list is short on purpose: it only has to cover initialisms a
 * three-word syllabus term could plausibly produce.
 */
const INITIALISM_DENYLIST = new Set([
  'all',
  'and',
  'any',
  'are',
  'but',
  'can',
  'did',
  'end',
  'far',
  'few',
  'for',
  'get',
  'got',
  'had',
  'has',
  'her',
  'him',
  'his',
  'how',
  'its',
  'key',
  'let',
  'low',
  'new',
  'not',
  'now',
  'old',
  'one',
  'out',
  'own',
  'put',
  'run',
  'say',
  'see',
  'set',
  'she',
  'the',
  'top',
  'two',
  'use',
  'was',
  'way',
  'who',
  'why',
  'you',
]);

/**
 * The initialism of a multi-word term — "multi-factor authentication" -> "MFA".
 *
 * A curator who writes the term out in full gets no credit for the student who
 * writes the acronym, which is the form the acronym exists for. That produced
 * the paradox where a response the marker praised for "using MFA" scored two of
 * seven key terms.
 *
 * Only three letters or more, and never an ordinary English word: a two-letter
 * initialism ("intelligent systems" -> "IS") would match half the response.
 */
export const initialismOf = (keyword: string): string | null => {
  const parts = keyword
    .replace(/\(.*?\)/g, ' ')
    .split(/[\s\-\u2011-\u2015/]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w && !INITIALISM_STOP_WORDS.has(w.toLowerCase()));
  if (parts.length < 2) return null;

  const letters = parts.map((w) => w[0]).join('');
  if (letters.length < 3) return null;
  if (INITIALISM_DENYLIST.has(letters.toLowerCase())) return null;
  return letters.toUpperCase();
};

export const getKeywordVariants = (keyword: string): string[] => {
  if (typeof keyword !== 'string') return [];
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  variants.add(trimmed);

  // Pattern: "Term (Abbreviation)" -> "Term", "Abbreviation"
  const parenMatch = trimmed.match(new RegExp('^(.+?)\\s*\\((.+?)\\)$'));

  const addInflections = (t: string) => {
    if (t.length < 3) return;
    // Skip if looks like an acronym (all caps) unless it's short
    if (t === t.toUpperCase() && t.length > 1 && t.length < 5) return;

    const lower = t.toLowerCase();

    // Pluralisation. The -is rule has to come FIRST: every word ending in "is"
    // also ends in "s", so behind the sibilant rule it was unreachable and
    // "hypothesis" produced "hypothesises" instead of "hypotheses" — the plural
    // a student actually writes never matched.
    if (lower.endsWith('y') && !lower.match(new RegExp('[aeiou]y$'))) {
      variants.add(t.slice(0, -1) + 'ies'); // City -> Cities
    } else if (lower.endsWith('is')) {
      variants.add(t.slice(0, -2) + 'es'); // Analysis -> Analyses
    } else if (lower.match(new RegExp('(s|x|z|ch|sh)$'))) {
      variants.add(t + 'es'); // Bus -> Buses
    } else {
      variants.add(t + 's'); // Cat -> Cats
    }

    // Singularisation (basic heuristics for reverse matching).
    //
    // These tests are deliberately CASE-SENSITIVE on the original term, unlike
    // the pluralisation above. A trailing capital "S" is part of an initialism,
    // not a plural: lower-casing first turned "DoS" (Denial of Service) into
    // the variant "Do", so every "do" a student wrote lit up as that syllabus
    // keyword and was credited in the coverage meter. Conversely the "-is"
    // exception exists for "analysis"/"basis", and matching it case-insensitively
    // caught acronym plurals too — "APIs" was never allowed to match "API".
    if (lower.endsWith('ies')) {
      variants.add(t.slice(0, -3) + 'y'); // Cities -> City
    } else if (lower.endsWith('es') && lower.slice(0, -2).match(new RegExp('(s|x|z|ch|sh)$'))) {
      variants.add(t.slice(0, -2)); // Buses -> Bus
    } else if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('is')) {
      variants.add(t.slice(0, -1)); // Cats -> Cat, APIs -> API, but DoS stays DoS
    }

    // Verb forms / Gerunds — both directions, so the keyword "test" lights up
    // "testing"/"tested" in an answer, and "Testing" still matches "test".
    if (lower.endsWith('ing')) {
      variants.add(t.slice(0, -3)); // Testing -> Test
      variants.add(t.slice(0, -3) + 'e'); // Computing -> Compute
    } else if (lower.endsWith('ed')) {
      variants.add(t.slice(0, -2)); // Tested -> Test
      variants.add(t.slice(0, -1)); // Encoded -> Encode
    } else if (lower.endsWith('e') && !lower.endsWith('ee')) {
      variants.add(t.slice(0, -1) + 'ing'); // Compute -> Computing
      variants.add(t + 'd'); // Compute -> Computed
    } else {
      variants.add(t + 'ing'); // Test -> Testing
      variants.add(t + 'ed'); // Test -> Tested
    }
  };

  // Expand each base term (and any parenthesised abbreviation pair) through
  // hyphen/space and spelling equivalences, then inflect every base form.
  const bases = new Set<string>();
  const collectBases = (t: string) =>
    hyphenSwaps(t).forEach((h) => spellingSwaps(h).forEach((s) => bases.add(s)));

  collectBases(trimmed);
  if (parenMatch) {
    collectBases(parenMatch[1].trim());
    collectBases(parenMatch[2].trim());
  }

  bases.forEach((b) => {
    variants.add(b);
    addInflections(b);
  });

  // The initialism a student is far more likely to write than the full term.
  const initialism = initialismOf(trimmed);
  if (initialism) variants.add(initialism);

  // Backstop: a one- or two-letter DERIVED variant is never a real term, and
  // matching one against a whole response is how a stray "do" or "re" ends up
  // highlighted as a syllabus keyword. The keyword the curator actually wrote
  // is always kept, however short ("AI", "pH").
  return Array.from(variants).filter(
    (v) => v === trimmed || v.replace(/[^\p{L}\p{N}]/gu, '').length >= 3
  );
};

export interface BandConfig {
  bg: string;
  solidBg: string;
  border: string;
  text: string;
  solidText: string;
  gradient: string;
  glow: string;
  iconBg: string;
  ring: string;
}

/**
 * Canonical band colours — the SINGLE source of truth for the hex a band is
 * drawn in, so the band a student works toward is the same predefined colour
 * everywhere (prompt, editor, keywords, metrics). These are the exact Tailwind
 * 500/600 equivalents of the classes returned by getBandConfig(), so the raw
 * hex used in inline gradients (e.g. the editor header) can never drift from
 * the class-based colours used elsewhere.
 */
export const BAND_HEX: Record<number, string> = {
  1: '#ef4444', // red-500
  2: '#f97316', // orange-500
  3: '#eab308', // yellow-500
  4: '#22c55e', // green-500
  5: '#3b82f6', // blue-500
  6: '#a855f7', // purple-500
};

export const BAND_HEX_DARK: Record<number, string> = {
  1: '#dc2626', // red-600
  2: '#ea580c', // orange-600
  3: '#ca8a04', // yellow-600
  4: '#16a34a', // green-600
  5: '#2563eb', // blue-600
  6: '#9333ea', // purple-600
};

export const BAND_NAMES: Record<number, string> = {
  1: 'Elementary',
  2: 'Limited',
  3: 'Developing',
  4: 'Sound',
  5: 'Excellent',
  6: 'Outstanding',
};

const clampBand = (band: number): number => Math.max(1, Math.min(6, Math.round(band)));
export const getBandHex = (band: number): string => BAND_HEX[clampBand(band)];
export const getBandHexDark = (band: number): string => BAND_HEX_DARK[clampBand(band)];
export const getBandName = (band: number): string => BAND_NAMES[clampBand(band)];

/**
 * The class bundle a band is drawn in, in both themes.
 *
 * A NOTE ON THE LIGHT TINTS, because the obvious value is the wrong one.
 * `bg` and `iconBg` are alpha washes in dark mode (`/10`, `/20`) — a 10% purple
 * over a near-black surface is plainly purple. The light theme cannot mirror
 * that with the matching `-50` shade: `purple-50` is #faf5ff and every panel in
 * the app is white, so a `-50` wash is a ~2% difference and simply is not
 * there. Marking-guide levels, band descriptors and exemplar rows all showed
 * their coloured BORDER and nothing else, and the band ladder — the thing those
 * tints exist to communicate — only worked in dark mode.
 *
 * So the light steps are one stop deeper than the dark ones look: `-100` for
 * the surface wash and `-200` for an icon tile sitting on top of it, which
 * keeps the two-level relationship the dark `/10` → `/20` pair has. The `text`
 * entries are `-900`, so contrast on either is far past AA.
 *
 * `print:` stays at `-50`/`-100`: paper is white too, but a printed tint is
 * ink, and the printed report leans on the border and the band NUMBER rather
 * than on fill.
 */
export const getBandConfig = (bandOrTier: number): BandConfig => {
  const configs: Record<number, BandConfig> = {
    6: {
      bg: 'bg-purple-500/10 light:bg-purple-100 print:bg-purple-50',
      solidBg: 'bg-purple-600 light:bg-purple-700',
      border: 'border-purple-500/50 light:border-purple-600 print:border-purple-200',
      text: 'text-purple-400 light:text-purple-900 print:text-purple-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-purple-500 to-purple-400 light:from-purple-700 light:to-purple-600',
      glow: 'shadow-purple-500/25 light:shadow-purple-500/20',
      iconBg: 'bg-purple-500/20 light:bg-purple-200 print:bg-purple-100',
      ring: 'ring-purple-500/30 light:ring-purple-600/30',
    },
    5: {
      bg: 'bg-blue-500/10 light:bg-blue-100 print:bg-blue-50',
      solidBg: 'bg-blue-600 light:bg-blue-700',
      border: 'border-blue-500/50 light:border-blue-600 print:border-blue-200',
      text: 'text-blue-400 light:text-blue-900 print:text-blue-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-blue-500 to-blue-400 light:from-blue-700 light:to-blue-600',
      glow: 'shadow-blue-500/25 light:shadow-blue-500/20',
      iconBg: 'bg-blue-500/20 light:bg-blue-200 print:bg-blue-100',
      ring: 'ring-blue-500/30 light:ring-blue-600/30',
    },
    4: {
      bg: 'bg-green-500/10 light:bg-green-100 print:bg-green-50',
      solidBg: 'bg-green-600 light:bg-green-700',
      border: 'border-green-500/50 light:border-green-600 print:border-green-200',
      text: 'text-green-400 light:text-green-900 print:text-green-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-green-500 to-green-400 light:from-green-700 light:to-green-600',
      glow: 'shadow-green-500/25 light:shadow-green-500/20',
      iconBg: 'bg-green-500/20 light:bg-green-200 print:bg-green-100',
      ring: 'ring-green-500/30 light:ring-green-600/30',
    },
    3: {
      bg: 'bg-yellow-500/10 light:bg-amber-100 print:bg-yellow-50',
      solidBg: 'bg-yellow-500 light:bg-amber-500',
      border: 'border-yellow-500/50 light:border-amber-600 print:border-yellow-200',
      text: 'text-yellow-400 light:text-amber-900 print:text-yellow-800',
      // Band 3 is the one band whose solid fill is too light for white text, so
      // it inverts: dark text on a light fill. `-900` was half a step short of
      // that being true. Measured in the browser on the three chips that wear
      // this pairing: `text-yellow-900` is 4.52:1 on the dark theme's
      // `bg-yellow-500` and 4.04:1 on the light theme's `bg-amber-500` — the
      // light one FAILS AA. `-950` is 7.60:1 and 6.79:1. `print:` stays at
      // `-900`: paper is white, and a printed tint leans on the border and the
      // band number rather than on fill. Pinned by bandColors.test.ts.
      solidText: 'text-yellow-950 print:text-yellow-900',
      gradient: 'from-yellow-500 to-yellow-400 light:from-amber-500 light:to-amber-400',
      glow: 'shadow-yellow-500/25 light:shadow-amber-500/20',
      iconBg: 'bg-yellow-500/20 light:bg-amber-200 print:bg-yellow-100',
      ring: 'ring-yellow-500/30 light:ring-amber-500/30',
    },
    2: {
      bg: 'bg-orange-500/10 light:bg-orange-100 print:bg-orange-50',
      solidBg: 'bg-orange-600 light:bg-orange-600',
      border: 'border-orange-500/50 light:border-orange-600 print:border-orange-200',
      text: 'text-orange-400 light:text-orange-900 print:text-orange-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-orange-500 to-orange-400 light:from-orange-600 light:to-orange-500',
      glow: 'shadow-orange-500/25 light:shadow-orange-500/20',
      iconBg: 'bg-orange-500/20 light:bg-orange-200 print:bg-orange-100',
      ring: 'ring-orange-500/30 light:ring-orange-600/30',
    },
    1: {
      bg: 'bg-red-500/10 light:bg-red-100 print:bg-red-50',
      solidBg: 'bg-red-600 light:bg-red-600',
      border: 'border-red-500/50 light:border-red-600 print:border-red-200',
      text: 'text-red-400 light:text-red-900 print:text-red-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-red-500 to-red-400 light:from-red-600 light:to-red-500',
      glow: 'shadow-red-500/25 light:shadow-red-500/20',
      iconBg: 'bg-red-500/20 light:bg-red-200 print:bg-red-100',
      ring: 'ring-red-500/30 light:ring-red-600/30',
    },
  };
  return configs[bandOrTier] || configs[4];
};

/**
 * Colour config for a cognitive TIER, expressed in the band that tier targets.
 * Now that each tier's maxBand equals the tier number, this produces the SAME
 * result as `getTierScaleConfig(tier)` — both are kept for call-site clarity.
 */
export const getTierBandConfig = (tier: number): BandConfig =>
  getBandConfig(getTierTargetBand(tier));

/**
 * Colour config for a cognitive TIER as its own identity on the six-step
 * red → orange → yellow → green → blue → purple scale (Tier 1 red … Tier 6
 * purple) — the scale the verb ribbon's cognitive spectrum is painted in
 * (`components/CommandVerbHierarchy.tsx`, via `getBandHex`).
 *
 * It used to say "matching the CognitiveSpectrum meter", naming a component
 * that was imported nowhere and held its own hard-coded copy of these six
 * colours. That component is gone; this is the scale it meant.
 *
 * Use this when displaying the tier LADDER itself (tier cards, tier pickers,
 * the cognitive timeline) where every tier must be visually distinct. The
 * band-target mapping above collapses Tiers 5 and 6 into the same purple and
 * shifts Tier 1 to orange, because several tiers share a target band — right
 * for colouring a question, wrong for telling tiers apart.
 */
export const getTierScaleConfig = (tier: number): BandConfig =>
  getBandConfig(Math.max(1, Math.min(6, Math.round(tier))));

export const getBandStyle = (band: number): { label: string; color: string } => {
  if (band >= 6)
    return {
      label: 'Band 6',
      color:
        'text-purple-300 light:text-purple-800 border-purple-500 bg-purple-900/30 light:bg-purple-100',
    };
  if (band >= 5)
    return {
      label: 'Band 5',
      color: 'text-blue-300 light:text-blue-800 border-blue-500 bg-blue-900/30 light:bg-blue-100',
    };
  if (band >= 4)
    return {
      label: 'Band 4',
      color:
        'text-green-300 light:text-green-800 border-green-500 bg-green-900/30 light:bg-green-100',
    };
  if (band >= 3)
    return {
      label: 'Band 3',
      color:
        'text-yellow-300 light:text-yellow-800 border-yellow-500 bg-yellow-900/30 light:bg-yellow-100',
    };
  if (band >= 2)
    return {
      label: 'Band 2',
      color:
        'text-orange-400 light:text-orange-800 border-orange-500 bg-orange-900/30 light:bg-orange-100',
    };
  return {
    label: 'Band 1',
    color: 'text-red-400 light:text-red-800 border-red-500 bg-red-900/30 light:bg-red-100',
  };
};

export const stripHtmlTags = (html: string): string => {
  if (typeof document === 'undefined') return html.replace(new RegExp('<[^>]*>?', 'gm'), '');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
};

export const cleanMarkdown = (text: string): string => {
  if (!text) return '';
  let cleaned = text;
  // Remove Bold/Italic markers (**text**, *text*, __text__, _text_)
  cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, '$2');
  cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, '$2');

  // Remove Header markers (### Header)
  cleaned = cleaned.replace(/^\s*#+\s+/gm, '');

  // Remove Inline Code markers (`code`)
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // Remove Block Code markers (```code```)
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (match) => {
    // Keep content inside code blocks but remove backticks
    return match.replace(/```/g, '');
  });

  // Plain-text math flatten (order matches `pdf/text.ts`'s `toText`, since
  // this is also flat text with the same stacked-fraction constraint —
  // "Use this answer" / clipboard-copy paths must not paste raw \frac{}{}/
  // \pi/^2 syntax into the student's own editable answer).
  cleaned = stripInlineMathDollars(cleaned);
  cleaned = expandFracToSlash(cleaned);
  cleaned = expandSqrt(cleaned);
  cleaned = expandVector(cleaned);
  cleaned = expandMathSymbolTokens(cleaned);
  cleaned = expandSuperscriptsToUnicode(cleaned);
  cleaned = expandSubscriptsToUnicode(cleaned);

  return cleaned;
};

/**
 * The single source of truth for how a matched syllabus keyword / command verb
 * looks, everywhere it appears. Two contexts:
 *
 * - `…_HIGHLIGHT_CLASS` — static prose (question prompts, sample answers,
 *   marking guides, feedback): a soft tinted wash + weight so terms read as
 *   deliberate emphasis in both themes and in print.
 * - `…_OVERLAY_CLASS` — the live writing overlay, which paints colour on a
 *   mirror div stacked pixel-perfectly over a transparent textarea. These MUST
 *   stay layout-neutral (no padding/margins/font-weight changes) or the
 *   overlay drifts out of alignment with the real text.
 */
export const KEYWORD_HIGHLIGHT_CLASS =
  'font-semibold text-emerald-400 light:text-emerald-800 bg-emerald-500/10 light:bg-emerald-600/10 rounded-[0.3em] px-[0.15em] box-decoration-clone print:bg-transparent print:text-emerald-800';
export const VERB_HIGHLIGHT_CLASS =
  'font-black text-[rgb(var(--color-accent))] underline decoration-2 underline-offset-[3px] decoration-[rgb(var(--color-accent))]/40';
export const KEYWORD_OVERLAY_CLASS =
  'bg-emerald-500/20 light:bg-emerald-500/25 text-emerald-400 light:text-emerald-900 rounded-[0.2em] box-decoration-clone';
export const VERB_OVERLAY_CLASS =
  'bg-[rgb(var(--color-accent))]/20 text-[rgb(var(--color-accent))] rounded-[0.2em] box-decoration-clone';

/**
 * Coordination-ellipsis sources for a multi-word keyword. Syllabus text often
 * coordinates shared head nouns — "supervised AND UNSUPERVISED learning",
 * "local, wide AND PERSONAL area networks" — where the first conjunct
 * ("supervised") stands in for the full term ("supervised learning") with the
 * head elided. A literal variant can't express that, so each multi-word
 * keyword also gets a lookahead alternative: match the keyword's first word
 * alone when one or more coordinated conjuncts follow and the phrase still
 * ends with the keyword's remaining words. Only the elided word itself is
 * highlighted — the neighbouring conjunct belongs to its own keyword.
 */
const COORDINATOR = String.raw`(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+|\s*\/\s*)`;
const coordinationEllipsisSources = (keyword: string): string[] => {
  const parts = keyword.trim().split(/\s+/);
  if (parts.length < 2) return [];

  const first = parts[0];
  if (!/^\w/.test(first)) return [];
  const rest = parts.slice(1);
  // Allow a simple plural on the shared head ("network" ↔ "networks",
  // "industry" ↔ "industries").
  const pluralisableHead = (w: string): string =>
    /[^aeiou]y$/i.test(w)
      ? `${escapeRegExp(w.slice(0, -1))}(?:y|ies)`
      : `${escapeRegExp(w)}(?:e?s)?`;
  const restSource = rest
    .map((w, i) => (i === rest.length - 1 ? pluralisableHead(w) : escapeRegExp(w)))
    .join(String.raw`\s+`);

  return [
    String.raw`\b` +
      escapeRegExp(first) +
      String.raw`(?=(?:${COORDINATOR}[\w-]+)+\s+${restSource}\b)`,
  ];
};

/**
 * Helper to create a regex for keywords/verbs.
 *
 * Exported so the PDF exporter colours exactly the terms the screen
 * highlights. Two matchers would drift — a term shown in emerald in the app and
 * left black on the printout is the kind of disagreement a student notices and
 * a teacher cannot explain.
 */
export const createKeywordRegex = (words: string[]) => {
  if (!words || words.length === 0) return null;

  const allVariants = new Set<string>();
  words.forEach((w) => getKeywordVariants(w).forEach((v) => allVariants.add(v)));
  if (allVariants.size === 0) return null;

  const sortedWords = Array.from(allVariants).sort((a, b) => b.length - a.length);
  // Word boundaries prevent partial matches, but `\b` only works against word
  // characters — a term that starts/ends with a symbol (C++, .NET) would never
  // match, so the boundary is applied per-edge only where the edge is a word
  // character. The whole alternation stays inside ONE capturing group: the
  // renderers split on this regex and rely on odd indices being the matches.
  const alternatives = sortedWords.map((v) => {
    const lead = /^\w/.test(v) ? '\\b' : '';
    const tail = /\w$/.test(v) ? '\\b' : '';
    return lead + escapeRegExp(v) + tail;
  });
  // Elliptical coordinated forms are regex sources (lookaheads), not literal
  // variants — appended after the literals so a full contiguous phrase always
  // wins when both could match at the same position.
  words.forEach((w) => coordinationEllipsisSources(w).forEach((s) => alternatives.push(s)));
  return new RegExp(`(${alternatives.join('|')})`, 'gi');
};

/**
 * Does this text use the keyword (in any recognised variant)? The SAME
 * matcher that drives highlighting, exported so coverage meters (right-panel
 * progress, metrics dashboard, keyword chips) can never disagree with what
 * the student sees highlighted.
 */
export const textContainsKeyword = (text: string, keyword: string): boolean => {
  if (!text || !keyword) return false;
  const regex = createKeywordRegex([keyword]);
  return regex ? regex.test(text) : false;
};

// Regex for inline styles - Use new RegExp for safety
//
// Brace groups (`^{...}` / `_{...}`) are accepted alongside the original
// bare-word form, so `Ca^{2+}` (ion charges) and `log_{10}` (log bases) also
// render — common in HSC Chemistry/Physics/Extension Maths, where the bare
// form's `+`/`-`-only class can't express a mixed charge/subscript.
const REGEX_SUPERSCRIPT = new RegExp('(\\^\\{[^{}]*\\}|\\^[a-zA-Z0-9+\\-()]+)', 'g');
const REGEX_SUBSCRIPT = new RegExp('(_\\{[^{}]*\\}|_[a-zA-Z0-9+\\-()]+)', 'g');
const REGEX_FRACTION = new RegExp('(\\\\frac\\{[^{}]*\\}\\{[^{}]*\\})', 'g');
const REGEX_BOLD = new RegExp('(\\*\\*.*?\\*\\*)', 'g');
const REGEX_ITALIC = new RegExp('(\\*[^*]+\\*)', 'g');

const processInlineFormatting = (
  text: string,
  verbRegex: RegExp | null,
  keywordRegex: RegExp | null
): React.ReactNode[] => {
  // Every key carries its full position in the recursion. Each branch below
  // flattens its results into ONE sibling array, so a bare per-branch index
  // collides as soon as two branches emit an element at the same position —
  // React then warns and may duplicate or omit the highlighted spans. The path
  // is derived from structure, not a counter, so keys stay stable across
  // re-renders of the same text.
  const processRecursively = (
    segment: string | React.ReactNode,
    path: string
  ): React.ReactNode[] => {
    if (typeof segment !== 'string') return [segment];
    if (!segment) return [];

    // 0. Fraction — \frac{a}{b} renders as a real stacked fraction (numerator
    // / rule / denominator) rather than flattened "a/b" text, matching the
    // structural fidelity a screen can give that flat PDF text cannot.
    // Numerator/denominator are recursed through `processRecursively` so
    // nested symbols (already expanded by the pre-pass), keywords, or a
    // nested superscript inside a fraction still resolve.
    if (segment.match(REGEX_FRACTION)) {
      const parts = segment.split(REGEX_FRACTION);
      if (parts.length > 1) {
        return parts
          .map((part, i) => {
            const m = part.match(/^\\frac\{([^{}]*)\}\{([^{}]*)\}$/);
            if (m) {
              const [, num, den] = m;
              return React.createElement(
                'span',
                {
                  key: `f${path}.${i}`,
                  className:
                    'inline-flex flex-col items-center align-middle mx-0.5 text-center leading-none',
                },
                React.createElement(
                  'span',
                  { className: 'px-0.5 text-[0.78em] border-b border-current' },
                  processRecursively(num, `${path}.${i}.n`)
                ),
                React.createElement(
                  'span',
                  { className: 'px-0.5 text-[0.78em]' },
                  processRecursively(den, `${path}.${i}.d`)
                )
              );
            }
            return processRecursively(part, `${path}.${i}`);
          })
          .flat();
      }
    }

    // 1. Bold
    if (segment.match(REGEX_BOLD)) {
      const parts = segment.split(REGEX_BOLD);
      if (parts.length > 1) {
        return parts
          .map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return React.createElement(
                'strong',
                {
                  key: `b${path}.${i}`,
                  className:
                    'font-bold text-white light:text-slate-900 print:text-[rgb(var(--color-text-primary))]',
                },
                processRecursively(part.slice(2, -2), `${path}.${i}`)
              );
            }
            return processRecursively(part, `${path}.${i}`);
          })
          .flat();
      }
    }

    // 2. Italic
    if (segment.match(REGEX_ITALIC)) {
      const parts = segment.split(REGEX_ITALIC);
      if (parts.length > 1) {
        return parts
          .map((part, i) => {
            if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
              return React.createElement(
                'em',
                {
                  key: `i${path}.${i}`,
                  className:
                    'italic text-white/90 light:text-slate-800 print:text-[rgb(var(--color-text-secondary))]',
                },
                processRecursively(part.slice(1, -1), `${path}.${i}`)
              );
            }
            return processRecursively(part, `${path}.${i}`);
          })
          .flat();
      }
    }

    // 3. Superscript
    if (segment.match(REGEX_SUPERSCRIPT)) {
      const parts = segment.split(REGEX_SUPERSCRIPT);
      if (parts.length > 1) {
        return parts
          .map((part, i) => {
            if (part.startsWith('^')) {
              const inner = part.startsWith('^{') ? part.slice(2, -1) : part.slice(1);
              return React.createElement(
                'sup',
                { key: `sup${path}.${i}`, className: 'text-[0.7em]' },
                inner
              );
            }
            return processRecursively(part, `${path}.${i}`);
          })
          .flat();
      }
    }

    // 4. Subscript
    if (segment.match(REGEX_SUBSCRIPT)) {
      const parts = segment.split(REGEX_SUBSCRIPT);
      if (parts.length > 1) {
        return parts
          .map((part, i) => {
            if (part.startsWith('_')) {
              const inner = part.startsWith('_{') ? part.slice(2, -1) : part.slice(1);
              return React.createElement(
                'sub',
                { key: `sub${path}.${i}`, className: 'text-[0.7em]' },
                inner
              );
            }
            return processRecursively(part, `${path}.${i}`);
          })
          .flat();
      }
    }

    // 5. Keyword/Verb Highlighting (Leaf nodes)
    if (verbRegex || keywordRegex) {
      let nodes: React.ReactNode[] = [segment];

      if (verbRegex) {
        nodes = nodes.flatMap((n, outer) => {
          if (typeof n !== 'string') return n;
          const parts = n.split(verbRegex);
          return parts.map((part, i) => {
            // Odd indices are the captured matches. Using verbRegex.test() here
            // would be stateful (/g regex, lastIndex carries over) and drop every
            // other match — index parity is the reliable, stateless check.
            if (i % 2 === 1) {
              return React.createElement(
                'span',
                { key: `v${path}.${outer}.${i}`, className: VERB_HIGHLIGHT_CLASS },
                part
              );
            }
            return part;
          });
        });
      }

      if (keywordRegex) {
        nodes = nodes.flatMap((n, outer) => {
          if (typeof n !== 'string') return n;
          const parts = n.split(keywordRegex);
          return parts.map((part, i) => {
            // Odd indices are the matched keywords (see verb branch above).
            if (i % 2 === 1) {
              // The key carries the OUTER node index as well as the index
              // within this split. `nodes` already holds several segments by the
              // time the keyword pass runs (the verb pass split it), and each is
              // split independently — so a bare `k-${i}` collides the moment two
              // segments both match at the same position. React then warns and
              // may duplicate or omit the highlighted spans.
              return React.createElement(
                'span',
                { key: `k${path}.${outer}.${i}`, className: KEYWORD_HIGHLIGHT_CLASS },
                part
              );
            }
            return part;
          });
        });
      }

      return nodes;
    }

    return [segment];
  };

  return processRecursively(text, '0');
};

type TableAlign = 'left' | 'center' | 'right';

interface ParsedTable {
  header: string[];
  rows: string[][];
  align: TableAlign[];
  /** Index of the first line AFTER the table. */
  end: number;
}

/** A line that could be a table row: at least one cell divider. */
const isPipeRow = (line: string): boolean => line.includes('|');

/** `| --- | :--: |` — the row that makes a pipe block a real table. */
const isSeparatorRow = (line: string): boolean => {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  return splitTableRow(trimmed).every((cell) => /^:?-{1,}:?$/.test(cell.trim()) && cell.trim());
};

/**
 * Split one row into cells. The outer pipes are optional (both `| a | b |` and
 * `a | b` are valid GFM), and `\|` is an escaped pipe inside a cell rather than
 * a divider.
 *
 * Scanned by hand rather than with `split(/(?<!\\)\|/)`. A lookbehind is a
 * PARSE error on Safari before 16.4, not a runtime one, so a single such regex
 * anywhere in a module takes the whole module down as it loads — and this
 * module is imported by the prompt, the editor and the marking report, i.e.
 * every screen. The app still supports that Safari (see the `overflow-x: clip`
 * fallback in index.css), and the one other lookbehind in the codebase is in
 * `pdf/text.ts`, which is loaded on demand and can only cost the exporter.
 */
const splitTableRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (trimmed[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += trimmed[i];
    }
  }
  cells.push(cell.trim());
  return cells;
};

const alignOf = (cell: string): TableAlign => {
  const t = cell.trim();
  if (t.startsWith(':') && t.endsWith(':')) return 'center';
  if (t.endsWith(':')) return 'right';
  return 'left';
};

/**
 * Read a markdown pipe table starting at `start`, or null if there isn't one.
 *
 * Two shapes are accepted, because the model writes both. The canonical one is
 * a header followed by a `---` separator row. The other is a fully fenced block
 * (every line starting AND ending with `|`) with the separator missing — which
 * used to reach the student as a wall of pipes and dashes. A bare line with a
 * pipe in it is never a table: prose says "either/or" often enough that the
 * fence or the separator has to be the signal.
 */
const parseTable = (lines: string[], start: number): ParsedTable | null => {
  const first = lines[start];
  if (!first || !isPipeRow(first) || isSeparatorRow(first)) return null;

  const header = splitTableRow(first);
  if (header.length < 2) return null;

  const hasSeparator = isSeparatorRow(lines[start + 1] ?? '');
  const fenced = (line: string): boolean => {
    const t = line.trim();
    return t.startsWith('|') && t.endsWith('|') && t.length > 1;
  };
  if (!hasSeparator && !(fenced(first) && fenced(lines[start + 1] ?? ''))) return null;

  const align = hasSeparator
    ? splitTableRow(lines[start + 1]).map(alignOf)
    : header.map((): TableAlign => 'left');

  const rows: string[][] = [];
  let i = start + (hasSeparator ? 2 : 1);
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || !isPipeRow(line)) break;
    if (isSeparatorRow(line)) continue; // a stray second rule inside the block
    rows.push(splitTableRow(line));
  }

  // A header alone is a single piped line, not a table — leave it to the
  // ordinary line renderer rather than drawing an empty grid.
  if (rows.length === 0) return null;

  return { header, rows, align, end: i };
};

const ALIGN_CLASS: Record<TableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const renderTable = (
  table: ParsedTable,
  key: number,
  verbRegex: RegExp | null,
  keywordRegex: RegExp | null
): React.ReactNode => {
  const columns = Math.max(table.header.length, ...table.rows.map((r) => r.length));
  const alignFor = (col: number): string => ALIGN_CLASS[table.align[col] ?? 'left'];

  const headCells = Array.from({ length: columns }, (_, col) =>
    React.createElement(
      'th',
      {
        key: col,
        scope: 'col',
        className: `px-3 py-2 align-bottom t-label text-[rgb(var(--color-text-primary))] light:text-slate-900 border-b border-[rgb(var(--color-border-secondary))]/30 light:border-slate-300 ${alignFor(col)}`,
      },
      processInlineFormatting(table.header[col] ?? '', verbRegex, keywordRegex)
    )
  );

  const bodyRows = table.rows.map((row, r) =>
    React.createElement(
      'tr',
      {
        key: r,
        className:
          'border-b border-[rgb(var(--color-border-secondary))]/15 light:border-slate-200 last:border-0',
      },
      Array.from({ length: columns }, (_, col) =>
        React.createElement(
          'td',
          {
            key: col,
            className: `px-3 py-2 align-top text-[rgb(var(--color-text-secondary))] light:text-slate-700 ${alignFor(col)}`,
          },
          processInlineFormatting(row[col] ?? '', verbRegex, keywordRegex)
        )
      )
    )
  );

  return React.createElement(
    'div',
    {
      key,
      // Its own scroller: a four-column comparison inside a modal must not push
      // the page sideways.
      className:
        'my-3 overflow-x-auto rounded-xl border border-[rgb(var(--color-border-secondary))]/20 light:border-slate-200 bg-black/10 light:bg-slate-50/80',
    },
    React.createElement(
      'table',
      { className: 'w-full border-collapse text-[0.95em] leading-snug' },
      React.createElement('thead', null, React.createElement('tr', null, headCells)),
      React.createElement('tbody', null, bodyRows)
    )
  );
};

export const renderFormattedText = (
  text: string,
  keywords?: string[],
  commandVerb?: PromptVerb
): React.ReactNode => {
  if (!text) return text;

  const keywordRegex = createKeywordRegex(keywords || []);
  const verbRegex = commandVerb ? createKeywordRegex([commandVerb]) : null;

  // Strip $...$ inline-math delimiters first — Gemini reaches for them out
  // of habit even though this app's own shorthand never uses them, and
  // nothing below touches a bare `$` (see `stripInlineMathDollars`'s own
  // comment for why a lone currency figure is safe). Then expand \sqrt,
  // \vec and symbol tokens — but NOT \frac (rendered structurally as a real
  // stacked fraction by `processInlineFormatting`, below) and NOT sup/sub
  // (kept as literal `^`/`_` for the `<sup>`/`<sub>` DOM step, which can
  // wrap arbitrary content unlike PDF's Unicode-table approach).
  const expanded = expandMathSymbolTokens(expandVector(expandSqrt(stripInlineMathDollars(text))));

  // 1. Split by lines to handle headings, lists, etc.
  const lines = expanded.split('\n');

  const processedLines: React.ReactNode[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Markdown table: consumes several lines at once, so it is checked before
    // anything that works a line at a time.
    const table = parseTable(lines, lineIdx);
    if (table) {
      processedLines.push(renderTable(table, lineIdx, verbRegex, keywordRegex));
      lineIdx = table.end - 1;
      continue;
    }

    processedLines.push(renderLine(line, lineIdx, verbRegex, keywordRegex));
  }

  return React.createElement(React.Fragment, null, processedLines);
};

/** One line of prose: rule, heading, list item or plain text. */
function renderLine(
  line: string,
  lineIdx: number,
  verbRegex: RegExp | null,
  keywordRegex: RegExp | null
): React.ReactNode {
  // Horizontal rule: --- or *** or ___
  if (/^[\s]*[-*_]{3,}[\s]*$/.test(line)) {
    return React.createElement('hr', {
      key: lineIdx,
      className:
        'my-3 border-0 h-px bg-gradient-to-r from-transparent via-[rgb(var(--color-border-secondary))] to-transparent',
    });
  }

  // Headings: ### Heading → <strong> block
  const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const headingText = headingMatch[2];
    const parts = processInlineFormatting(headingText, verbRegex, keywordRegex);
    const sizeClass = level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm';
    return React.createElement(
      'strong',
      {
        key: lineIdx,
        className: `block ${sizeClass} font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 mt-3 mb-1 first:mt-0`,
      },
      parts
    );
  }

  // Check for Lists using new RegExp constructor.
  // Double escape backslashes for string literal: \\d+
  const listMatch = line.match(new RegExp('^(\\s*)([\\*\\-]|\\d+\\.)\\s+(.*)'));

  let content = line;
  let isListItem = false;
  let indentLevel = 0;
  let listMarker = '';

  if (listMatch) {
    isListItem = true;
    indentLevel = listMatch[1].length;
    listMarker = listMatch[2];
    content = listMatch[3];
  }

  const parts = processInlineFormatting(content, verbRegex, keywordRegex);

  const bulletElement = React.createElement(
    'span',
    { className: 'inline-block w-6 mr-1 text-[rgb(var(--color-accent))]' },
    listMarker.endsWith('.') ? listMarker : '•'
  );

  const renderedLine = React.createElement(
    'span',
    { key: lineIdx, className: 'block min-h-[1.5em]' },
    isListItem && bulletElement,
    parts
  );

  if (isListItem) {
    return React.createElement(
      'div',
      { key: lineIdx, style: { paddingLeft: `${indentLevel * 10 + (isListItem ? 0 : 0)}px` } },
      renderedLine
    );
  }
  return renderedLine;
}

export const renderEditorHighlights = (
  text: string,
  keywords?: string[],
  verb?: PromptVerb
): React.ReactNode => {
  if (!text) return null;

  const keywordRegex = createKeywordRegex(keywords || []);
  const verbRegex = verb ? createKeywordRegex([verb]) : null;

  const processSegment = (segment: string): React.ReactNode[] => {
    let nodes: React.ReactNode[] = [segment];

    if (verbRegex) {
      nodes = nodes.flatMap((n, outer) => {
        if (typeof n !== 'string') return n;
        const parts = n.split(verbRegex);
        return parts.map((part, i) => {
          // String.split with a single capturing group returns the matched
          // delimiters at the odd indices. Re-testing with verbRegex here would
          // be stateful (it is a /g regex whose lastIndex carries between calls)
          // and would silently drop every other occurrence — the flickering
          // highlight bug. Index parity is the reliable, stateless check.
          if (i % 2 === 1) {
            // Layout-neutral overlay class (no padding) so the mirror div
            // can't drift out of alignment with the textarea underneath.
            return React.createElement(
              'span',
              { key: `v-${outer}-${i}`, className: VERB_OVERLAY_CLASS },
              part
            );
          }
          return part;
        });
      });
    }

    if (keywordRegex) {
      nodes = nodes.flatMap((n, outer) => {
        if (typeof n !== 'string') return n;
        const parts = n.split(keywordRegex);
        return parts.map((part, i) => {
          // Odd indices are the matched keywords (see verb branch above).
          if (i % 2 === 1) {
            // Layout-neutral overlay class (see verb branch above).
            return React.createElement(
              'span',
              { key: `k-${outer}-${i}`, className: KEYWORD_OVERLAY_CLASS },
              part
            );
          }
          return part;
        });
      });
    }

    return nodes;
  };

  return React.createElement(React.Fragment, null, processSegment(text));
};
