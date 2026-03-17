import React from 'react';
import { PromptVerb } from '../types';

export const escapeRegExp = (string: string): string => {
  if (typeof string !== 'string') return '';
  return string.replace(new RegExp('[.*+?^${}()|[\\]\\\\]', 'g'), '\\$&');
};

export const getKeywordVariants = (keyword: string): string[] => {
  if (typeof keyword !== 'string') return [];
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  variants.add(trimmed);

  // Pattern: "Term (Abbreviation)" -> "Term", "Abbreviation"
  const parenMatch = trimmed.match(new RegExp('^(.+?)\\s*\\((.+?)\\)$'));

  const processTerm = (t: string) => {
    if (t.length < 3) return;
    // Skip if looks like an acronym (all caps) unless it's short
    if (t === t.toUpperCase() && t.length > 1 && t.length < 5) return;

    const lower = t.toLowerCase();

    // Pluralization
    if (lower.endsWith('y') && !lower.match(new RegExp('[aeiou]y$'))) {
      variants.add(t.slice(0, -1) + 'ies'); // City -> Cities
    } else if (lower.match(new RegExp('(s|x|z|ch|sh)$'))) {
      variants.add(t + 'es'); // Bus -> Buses
    } else if (lower.endsWith('is')) {
      variants.add(t.slice(0, -2) + 'es'); // Analysis -> Analyses
    } else {
      variants.add(t + 's'); // Cat -> Cats
    }

    // Singularization (Basic heuristics for reverse matching)
    if (lower.endsWith('ies')) {
      variants.add(t.slice(0, -3) + 'y'); // Cities -> City
    } else if (lower.endsWith('es') && lower.slice(0, -2).match(new RegExp('(s|x|z|ch|sh)$'))) {
      variants.add(t.slice(0, -2)); // Buses -> Bus
    } else if (lower.endsWith('s') && !lower.endsWith('ss') && !lower.endsWith('is')) {
      variants.add(t.slice(0, -1)); // Cats -> Cat
    }

    // Verb forms / Gerunds
    if (lower.endsWith('ing')) {
      variants.add(t.slice(0, -3)); // Testing -> Test
      variants.add(t.slice(0, -3) + 'e'); // Computing -> Compute
    }
  };

  processTerm(trimmed);
  if (parenMatch) {
    processTerm(parenMatch[1].trim());
    processTerm(parenMatch[2].trim());
  }

  return Array.from(variants);
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

export const getBandConfig = (bandOrTier: number): BandConfig => {
  const configs: Record<number, BandConfig> = {
    6: {
      bg: 'bg-purple-500/10 light:bg-purple-50 print:bg-purple-50',
      solidBg: 'bg-purple-600 light:bg-purple-700',
      border: 'border-purple-500/50 light:border-purple-600 print:border-purple-200',
      text: 'text-purple-400 light:text-purple-900 print:text-purple-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-purple-500 to-purple-400 light:from-purple-700 light:to-purple-600',
      glow: 'shadow-purple-500/25 light:shadow-purple-500/20',
      iconBg: 'bg-purple-500/20 light:bg-purple-100 print:bg-purple-100',
      ring: 'ring-purple-500/30 light:ring-purple-600/30',
    },
    5: {
      bg: 'bg-blue-500/10 light:bg-blue-50 print:bg-blue-50',
      solidBg: 'bg-blue-600 light:bg-blue-700',
      border: 'border-blue-500/50 light:border-blue-600 print:border-blue-200',
      text: 'text-blue-400 light:text-blue-900 print:text-blue-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-blue-500 to-blue-400 light:from-blue-700 light:to-blue-600',
      glow: 'shadow-blue-500/25 light:shadow-blue-500/20',
      iconBg: 'bg-blue-500/20 light:bg-blue-100 print:bg-blue-100',
      ring: 'ring-blue-500/30 light:ring-blue-600/30',
    },
    4: {
      bg: 'bg-green-500/10 light:bg-green-50 print:bg-green-50',
      solidBg: 'bg-green-600 light:bg-green-700',
      border: 'border-green-500/50 light:border-green-600 print:border-green-200',
      text: 'text-green-400 light:text-green-900 print:text-green-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-green-500 to-green-400 light:from-green-700 light:to-green-600',
      glow: 'shadow-green-500/25 light:shadow-green-500/20',
      iconBg: 'bg-green-500/20 light:bg-green-100 print:bg-green-100',
      ring: 'ring-green-500/30 light:ring-green-600/30',
    },
    3: {
      bg: 'bg-yellow-500/10 light:bg-amber-50 print:bg-yellow-50',
      solidBg: 'bg-yellow-500 light:bg-amber-500',
      border: 'border-yellow-500/50 light:border-amber-600 print:border-yellow-200',
      text: 'text-yellow-400 light:text-amber-900 print:text-yellow-800',
      solidText: 'text-yellow-900 print:text-yellow-900',
      gradient: 'from-yellow-500 to-yellow-400 light:from-amber-500 light:to-amber-400',
      glow: 'shadow-yellow-500/25 light:shadow-amber-500/20',
      iconBg: 'bg-yellow-500/20 light:bg-amber-100 print:bg-yellow-100',
      ring: 'ring-yellow-500/30 light:ring-amber-500/30',
    },
    2: {
      bg: 'bg-orange-500/10 light:bg-orange-50 print:bg-orange-50',
      solidBg: 'bg-orange-600 light:bg-orange-600',
      border: 'border-orange-500/50 light:border-orange-600 print:border-orange-200',
      text: 'text-orange-400 light:text-orange-900 print:text-orange-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-orange-500 to-orange-400 light:from-orange-600 light:to-orange-500',
      glow: 'shadow-orange-500/25 light:shadow-orange-500/20',
      iconBg: 'bg-orange-500/20 light:bg-orange-100 print:bg-orange-100',
      ring: 'ring-orange-500/30 light:ring-orange-600/30',
    },
    1: {
      bg: 'bg-red-500/10 light:bg-red-50 print:bg-red-50',
      solidBg: 'bg-red-600 light:bg-red-600',
      border: 'border-red-500/50 light:border-red-600 print:border-red-200',
      text: 'text-red-400 light:text-red-900 print:text-red-800',
      solidText: 'text-white print:text-white',
      gradient: 'from-red-500 to-red-400 light:from-red-600 light:to-red-500',
      glow: 'shadow-red-500/25 light:shadow-red-500/20',
      iconBg: 'bg-red-500/20 light:bg-red-100 print:bg-red-100',
      ring: 'ring-red-500/30 light:ring-red-600/30',
    },
  };
  return configs[bandOrTier] || configs[4];
};

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

  return cleaned;
};

/**
 * Helper to create a regex for keywords/verbs
 */
const createKeywordRegex = (words: string[]) => {
  if (!words || words.length === 0) return null;

  const allVariants = new Set<string>();
  words.forEach((w) => getKeywordVariants(w).forEach((v) => allVariants.add(v)));

  const sortedWords = Array.from(allVariants).sort((a, b) => b.length - a.length);
  // Match word boundaries to avoid partial matches
  // Use new RegExp to be safe
  return new RegExp(`\\b(${sortedWords.map(escapeRegExp).join('|')})\\b`, 'gi');
};

// Regex for inline styles - Use new RegExp for safety
const REGEX_SUPERSCRIPT = new RegExp('(\\^[a-zA-Z0-9-]+)', 'g');
const REGEX_SUBSCRIPT = new RegExp('(_[a-zA-Z0-9]+)', 'g');
const REGEX_BOLD = new RegExp('(\\*\\*.*?\\*\\*)', 'g');
const REGEX_ITALIC = new RegExp('(\\*[^*]+\\*)', 'g');

const processInlineFormatting = (
  text: string,
  verbRegex: RegExp | null,
  keywordRegex: RegExp | null
): React.ReactNode[] => {
  const processRecursively = (segment: string | React.ReactNode): React.ReactNode[] => {
    if (typeof segment !== 'string') return [segment];
    if (!segment) return [];

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
                  key: i,
                  className:
                    'font-bold text-white light:text-slate-900 print:text-[rgb(var(--color-text-primary))]',
                },
                processRecursively(part.slice(2, -2))
              );
            }
            return processRecursively(part);
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
                  key: i,
                  className:
                    'italic text-white/90 light:text-slate-800 print:text-[rgb(var(--color-text-secondary))]',
                },
                processRecursively(part.slice(1, -1))
              );
            }
            return processRecursively(part);
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
              return React.createElement(
                'sup',
                { key: i, className: 'text-[0.7em]' },
                part.slice(1)
              );
            }
            return processRecursively(part);
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
              return React.createElement(
                'sub',
                { key: i, className: 'text-[0.7em]' },
                part.slice(1)
              );
            }
            return processRecursively(part);
          })
          .flat();
      }
    }

    // 5. Keyword/Verb Highlighting (Leaf nodes)
    if (verbRegex || keywordRegex) {
      let nodes: React.ReactNode[] = [segment];

      if (verbRegex) {
        nodes = nodes.flatMap((n) => {
          if (typeof n !== 'string') return n;
          const parts = n.split(verbRegex);
          return parts.map((part, i) => {
            if (verbRegex.test(part)) {
              // Capturing group matched
              return React.createElement(
                'span',
                { key: `v-${i}`, className: 'font-black text-[rgb(var(--color-accent))]' },
                part
              );
            }
            return part;
          });
        });
      }

      if (keywordRegex) {
        nodes = nodes.flatMap((n) => {
          if (typeof n !== 'string') return n;
          const parts = n.split(keywordRegex);
          return parts.map((part, i) => {
            if (keywordRegex.test(part)) {
              return React.createElement(
                'span',
                { key: `k-${i}`, className: 'font-bold text-emerald-400 light:text-emerald-700' },
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

  return processRecursively(text);
};

export const renderFormattedText = (
  text: string,
  keywords?: string[],
  commandVerb?: PromptVerb
): React.ReactNode => {
  if (!text) return text;

  const keywordRegex = createKeywordRegex(keywords || []);
  const verbRegex = commandVerb ? createKeywordRegex([commandVerb]) : null;

  // 1. Split by lines to handle lists
  const lines = text.split('\n');

  const processedLines = lines.map((line, lineIdx) => {
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
  });

  return React.createElement(React.Fragment, null, processedLines);
};

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
      nodes = nodes.flatMap((n) => {
        if (typeof n !== 'string') return n;
        const parts = n.split(verbRegex);
        return parts.map((part, i) => {
          if (verbRegex.test(part)) {
            // Removed padding px-0.5 to prevent horizontal drift/ghosting
            return React.createElement(
              'span',
              {
                key: `v-${i}`,
                className: 'bg-[rgb(var(--color-accent))]/20 text-[rgb(var(--color-accent))]',
              },
              part
            );
          }
          return part;
        });
      });
    }

    if (keywordRegex) {
      nodes = nodes.flatMap((n) => {
        if (typeof n !== 'string') return n;
        const parts = n.split(keywordRegex);
        return parts.map((part, i) => {
          if (keywordRegex.test(part)) {
            // Removed padding px-0.5 to prevent horizontal drift/ghosting
            return React.createElement(
              'span',
              { key: `k-${i}`, className: 'bg-emerald-500/20 text-emerald-400' },
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
