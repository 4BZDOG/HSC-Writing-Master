import React, { useRef, useEffect } from 'react';
import { ChevronRight, BookOpen, Layers, Folder, Hash } from 'lucide-react';
import type { SyllabusCrumb } from '../types';

interface BreadcrumbProps {
  /** Course → Topic → Sub-Topic → Dot Point, built once in `App.tsx`. */
  items: SyllabusCrumb[];
  /**
   * `default` is the standalone card above the workspace; `dense` is the inline
   * scale used inside the collapsed navigator bar, which supplies its own
   * surface. Type scale and padding only — the markup is identical, which is
   * the point: there is now one breadcrumb, not two that drift apart.
   */
  size?: 'default' | 'dense';
  /**
   * The navigation landmark's accessible name. Supplied by the caller rather
   * than wrapping this component in a second `<nav>`, which would put two
   * nested navigation landmarks around one list of crumbs.
   */
  label?: string;
}

/** One icon per level. The path is never deeper than these four. */
const CRUMB_ICONS = [BookOpen, Layers, Folder, Hash];

/**
 * What each level is called when the crumb offers to return to it. The tooltip
 * has to name the destination: "Change Nature and Practice of Business" read as
 * an offer to rename the topic rather than to pick a different one.
 */
const LEVEL_NAMES = ['course', 'topic', 'sub-topic', 'syllabus point'];

const SIZES = {
  default: {
    shell:
      'w-full overflow-hidden rounded-xl border border-white/10 light:border-slate-200 bg-[rgb(var(--color-bg-surface-elevated))]/40 light:bg-white backdrop-blur-md shadow-sm hover:border-white/20 transition-colors',
    list: 'py-3 px-4',
    crumb: 'gap-2 px-3 py-1.5 text-sm',
    icon: 'w-4 h-4',
    chevron: 'w-4 h-4 mx-2',
  },
  dense: {
    // No surface of its own: the collapsed navigator bar is already a card, and
    // a second bordered, blurred panel inside it reads as a nested box.
    shell: 'overflow-hidden',
    list: '',
    crumb: 'gap-1.5 px-2 py-1 text-[11px]',
    icon: 'w-3 h-3',
    chevron: 'w-3 h-3 mx-1',
  },
} as const;

/**
 * The syllabus path, in one implementation. Every crumb that carries an
 * `onClick` is a live jump back to that level — including the last one, which
 * is the deepest place in the path but not the current page (the question is).
 */
const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  size = 'default',
  label = 'Breadcrumb',
}) => {
  const scrollRef = useRef<HTMLOListElement>(null);
  const scale = SIZES[size];

  // Keyed on the path's CONTENT, not the array's identity. `items` is a fresh
  // literal on every parent render, and the parent re-renders on every
  // keystroke — keyed on `items` this pinned the list to its right-hand end
  // while a student typed, hiding the Course crumb on a narrow viewport.
  const pathKey = items.map((i) => i.label).join('›');
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // The global `scroll-behavior: auto !important` (index.css) is a CSS
    // declaration and cannot override an explicit `behavior` passed in an
    // options bag, so the preference is read here instead.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: el.scrollWidth, behavior: reduce ? 'auto' : 'smooth' });
  }, [pathKey]);

  return (
    <nav className={scale.shell} aria-label={label}>
      <ol
        ref={scrollRef}
        className={`flex items-center overflow-x-auto scrollbar-hide ${scale.list}`}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const level = Math.min(index, CRUMB_ICONS.length - 1);
          const Icon = CRUMB_ICONS[level];
          const canJump = !!item.onClick;

          return (
            <li key={`breadcrumb-${index}`} className="flex items-center flex-shrink-0">
              {index > 0 && (
                <ChevronRight
                  className={`${scale.chevron} text-[rgb(var(--color-text-muted))]/50 flex-shrink-0`}
                  aria-hidden="true"
                />
              )}
              <button
                onClick={item.onClick}
                disabled={!canJump}
                // `location` rather than `page`: this names the deepest place in
                // the path, but the page the student is on is the question below.
                aria-current={isLast ? 'location' : undefined}
                title={canJump ? `Go back to choose a different ${LEVEL_NAMES[level]}` : item.label}
                className={`
                    flex items-center ${scale.crumb} rounded-lg font-medium
                    whitespace-nowrap border transition-all duration-200
                    ${
                      isLast
                        ? 'bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-primary))] border-white/10 light:border-slate-200 shadow-sm font-bold'
                        : 'bg-transparent text-[rgb(var(--color-text-secondary))] border-transparent hover:bg-[rgb(var(--color-bg-surface-light))]/50 hover:text-[rgb(var(--color-text-primary))]'
                    }
                    ${canJump ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'}
                `}
              >
                <span
                  className={`shrink-0 opacity-70 ${isLast ? 'text-[rgb(var(--color-accent))] opacity-100' : ''}`}
                >
                  <Icon className={scale.icon} />
                </span>
                <span className="truncate max-w-[150px] sm:max-w-[250px]">{item.label}</span>
                {/* Outside the truncating span, so a long course name can never
                    eat the year, and outside `label`, so `crumbs.map(c => c.label)`
                    still yields the plain names the PDF export and the AI
                    hierarchy context consume. */}
                {item.badge && (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-px rounded bg-slate-900/10 dark:bg-white/10">
                    {item.badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
