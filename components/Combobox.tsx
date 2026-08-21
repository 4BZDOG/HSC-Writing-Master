import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useDeferredValue,
} from 'react';
import { createPortal } from 'react-dom';
import { getTierScaleConfig } from '../utils/renderUtils';
import { PromptVerb } from '../types';
import { Sparkles, ChevronDown, Search, X } from 'lucide-react';

/**
 * Lists shorter than this are faster to read than to search, and a search box
 * above four topics is clutter. A dot point can carry a dozen questions, and a
 * course a dozen topics — that is where scanning stops working.
 */
export const SEARCH_THRESHOLD = 7;

/** Case- and punctuation-insensitive substring match on every supplied term. */
const matches = (option: { label: string; searchText?: string }, query: string): boolean => {
  const haystack = `${option.label} ${option.searchText ?? ''}`.toLowerCase();
  // Every whitespace-separated term must appear, so "2023 assess" finds a
  // question the way a person would type it rather than needing exact order.
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
};

export type ComboboxColor =
  | 'blue'
  | 'purple'
  | 'indigo'
  | 'teal'
  | 'pink'
  | 'green'
  | 'amber'
  | 'default';

interface ComboboxOption {
  id: string;
  label: string;
  renderLabel?: React.ReactNode;
  marks?: number;
  verb?: PromptVerb;
  isNew?: boolean;
  tier?: number;
  disabled?: boolean;
  /** Extra text the search should match — the parts of `renderLabel` that are
   *  not in `label` (a question's verb, its marks, its HSC paper). */
  searchText?: string;
  /**
   * Heading this option sits under. Options carrying a group MUST arrive
   * already ordered by it — the list renders a heading wherever the group
   * changes, so an interleaved array would repeat headings rather than sort
   * itself out. Omit throughout for a flat list, which is what most pickers
   * here still are.
   */
  group?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  label: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  color?: ComboboxColor;
  /**
   * A way out of the empty state. Offered under "Nothing matches …" — the exact
   * moment someone learns the thing they wanted isn't here — and handed the
   * query they typed, so the follow-up can start from their own words rather
   * than a blank field. Omit it and the empty state stays a plain message.
   */
  emptyAction?: { label: string; onAction: (query: string) => void };
}

const colorStyles: Record<
  ComboboxColor,
  {
    border: string;
    glow: string;
    bg: string;
    text: string;
    icon: string;
    hoverBorder: string;
  }
> = {
  blue: {
    border: 'border-blue-500/30',
    glow: 'border-blue-400/50 shadow-[0_0_30px_rgba(59,130,246,0.35)] ring-2 ring-blue-500/20',
    bg: 'bg-blue-500/10',
    text: 'text-blue-100',
    icon: 'text-blue-400',
    hoverBorder: 'group-hover:border-blue-500/40',
  },
  purple: {
    border: 'border-purple-500/30',
    glow: 'border-purple-400/50 shadow-[0_0_30px_rgba(168,85,247,0.35)] ring-2 ring-purple-500/20',
    bg: 'bg-purple-500/10',
    text: 'text-purple-100',
    icon: 'text-purple-400',
    hoverBorder: 'group-hover:border-purple-500/40',
  },
  indigo: {
    border: 'border-indigo-500/30',
    glow: 'border-indigo-400/50 shadow-[0_0_30px_rgba(99,102,241,0.35)] ring-2 ring-indigo-500/20',
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-100',
    icon: 'text-indigo-400',
    hoverBorder: 'group-hover:border-indigo-500/40',
  },
  pink: {
    border: 'border-pink-500/30',
    glow: 'border-pink-400/50 shadow-[0_0_30px_rgba(236,72,153,0.35)] ring-2 ring-pink-500/20',
    bg: 'bg-pink-500/10',
    text: 'text-pink-100',
    icon: 'text-pink-400',
    hoverBorder: 'group-hover:border-pink-500/40',
  },
  green: {
    border: 'border-emerald-500/30',
    glow: 'border-emerald-400/50 shadow-[0_0_30px_rgba(16,185,129,0.35)] ring-2 ring-emerald-500/20',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-100',
    icon: 'text-emerald-400',
    hoverBorder: 'group-hover:border-emerald-500/40',
  },
  teal: {
    border: 'border-teal-500/30',
    glow: 'border-teal-400/50 shadow-[0_0_30px_rgba(20,184,166,0.35)] ring-2 ring-teal-500/20',
    bg: 'bg-teal-500/10',
    text: 'text-teal-100',
    icon: 'text-teal-400',
    hoverBorder: 'group-hover:border-teal-500/40',
  },
  amber: {
    border: 'border-amber-500/30',
    glow: 'border-amber-400/50 shadow-[0_0_30px_rgba(245,158,11,0.35)] ring-2 ring-amber-500/20',
    bg: 'bg-amber-500/10',
    text: 'text-amber-100',
    icon: 'text-amber-400',
    hoverBorder: 'group-hover:border-amber-500/40',
  },
  default: {
    border: 'border-slate-500/30',
    glow: 'border-slate-400/50 shadow-[0_0_30px_rgba(148,163,184,0.35)] ring-2 ring-slate-500/20',
    bg: 'bg-slate-500/10',
    text: 'text-slate-200',
    icon: 'text-slate-400',
    hoverBorder: 'group-hover:border-slate-500/40',
  },
};

/**
 * One row in the open option list. Pulled out to its own component (instead
 * of an inline literal inside the `.map()` below) purely so it can carry the
 * local state that gates the "you are here" entrance animation — a bare
 * conditional className would replay `animate-fade-in-up-sm` on every
 * unrelated re-render while a row merely stays selected, not just the moment
 * it becomes selected.
 */
const ComboboxOptionRow: React.FC<{
  option: ComboboxOption;
  index: number;
  listboxId: string;
  className: string;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}> = ({ option, index, listboxId, className, isSelected, onClick, onMouseEnter }) => {
  // Plays once — right as the row first renders selected (dropdown opening on
  // the current value) or the moment a click/keyboard action lands here — and
  // never again while it merely stays selected through an unrelated re-render.
  const [justSelected, setJustSelected] = useState(false);
  const wasSelected = useRef(false);
  useEffect(() => {
    if (isSelected && !wasSelected.current) {
      setJustSelected(true);
    }
    wasSelected.current = isSelected;
  }, [isSelected]);

  return (
    <li
      id={`${listboxId}-opt-${index}`}
      data-option-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`${className} ${isSelected && justSelected ? 'animate-fade-in-up-sm' : ''}`}
      role="option"
      aria-selected={isSelected}
      aria-disabled={option.disabled || undefined}
    >
      <div className="flex items-center whitespace-normal w-full">
        {option.renderLabel || option.label}
      </div>
    </li>
  );
};

const Combobox: React.FC<ComboboxProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  disabled = false,
  color = 'default',
  emptyAction,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [menuRect, setMenuRect] = useState({ top: 0, left: 0, width: 0 });
  const selectedOption = options.find((opt) => opt.id === value);
  const labelId = useId();
  const listboxId = useId();

  const theme = colorStyles[color] || colorStyles.default;

  // Search appears only where scanning stops being the faster option.
  const isSearchable = options.length >= SEARCH_THRESHOLD;

  /**
   * The typed text paints immediately; the LIST catches up.
   *
   * Every keystroke re-filters and re-renders up to twenty question rows, each
   * a tinted card with its own chips — enough work to be felt on a school
   * laptop, and felt in the worst place, between a key going down and the
   * letter appearing. `useDeferredValue` rather than a timer because there is
   * no delay here that would be right for every machine: React re-renders the
   * list at a lower priority and abandons the attempt if another key arrives,
   * so a fast typist gets one filter pass at the end instead of one per letter,
   * and a fast machine still gets it in the same frame.
   */
  const deferredQuery = useDeferredValue(query);
  const visibleOptions = useMemo(
    () =>
      isSearchable && deferredQuery.trim()
        ? options.filter((option) => matches(option, deferredQuery))
        : options,
    [options, deferredQuery, isSearchable]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // The list itself lives in a portal now (see the positioning effect
      // below), so it is no longer a DOM descendant of `containerRef` — a
      // click on an option would otherwise read as "outside" and close the
      // list a beat before the option's own onClick ever ran.
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * The list portals to `document.body` (below), so its position has to be
   * computed in JS rather than left to `absolute` + a positioned ancestor.
   *
   * Why it portals at all: this control sits inside the navigator's
   * collapse-animation wrapper in `App.tsx`, a `grid-rows-[0fr]/[1fr]` box
   * whose child carries `overflow-hidden` so the collapse has something to
   * clip. An `absolute` dropdown is out of flow, so it never contributed to
   * that box's measured height — the box sized itself to the trigger alone,
   * and `overflow-hidden` clipped the list at that boundary, with the next
   * component in the page (the command verb ribbon) visible immediately
   * below the cut. Portaling out from under that ancestor is the fix used
   * throughout this codebase's own patterns (a `fixed`-position layer keyed
   * to the trigger's own rect) rather than reworking the collapse animation
   * to leave room for a popup its height calculation was never meant to see.
   */
  useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuRect({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    };
    updatePosition();
    // Capture phase so scrolling any ancestor — not just the window — keeps
    // the list glued to the trigger instead of drifting off it.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  // A stale query would silently hide options the next time this opens.
  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  // Typing goes straight into the box rather than needing a click first.
  useEffect(() => {
    if (isOpen && isSearchable) searchRef.current?.focus();
  }, [isOpen, isSearchable]);

  // Step the highlight, skipping disabled (locked) options so Enter always
  // lands on something actionable.
  const stepHighlight = (direction: 1 | -1) => {
    if (visibleOptions.length === 0) return;
    setHighlightedIndex((prev) => {
      let next = prev;
      for (let i = 0; i < visibleOptions.length; i++) {
        next = (next + direction + visibleOptions.length) % visibleOptions.length;
        if (!visibleOptions[next]?.disabled) return next;
      }
      return prev; // every option disabled — stay put
    });
  };

  /**
   * The one path that both changes the value and destroys the control the user
   * was standing on: in a searchable list focus sits in the search input, which
   * unmounts with the popup, so it fell to `<body>` and the next Tab restarted
   * at the top of the document. Hand it back to the trigger — the same thing
   * Escape already does below.
   */
  const commit = (id: string) => {
    onChange(id);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  // Keyboard navigation handler — shared by the trigger and the search box, so
  // arrows and Enter behave the same whichever has focus.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          stepHighlight(1);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          stepHighlight(-1);
        }
        break;
      case 'Home':
        if (isOpen) {
          e.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      case 'End':
        if (isOpen) {
          e.preventDefault();
          setHighlightedIndex(visibleOptions.length - 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && visibleOptions.length > 0 && !visibleOptions[highlightedIndex]?.disabled) {
          commit(visibleOptions[highlightedIndex].id);
        } else if (!isOpen) {
          setIsOpen(true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        // Escape clears a query first and closes only an unfiltered list, so a
        // mistyped search does not cost the whole dropdown.
        if (query) {
          setQuery('');
        } else {
          setIsOpen(false);
          buttonRef.current?.focus();
        }
        break;
    }
  };

  // Reset highlighted index when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex((opt) => opt.id === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, value, options]);

  // Filtering shortens the list under the highlight; left alone it would point
  // past the end and Enter would select nothing.
  useEffect(() => {
    setHighlightedIndex((prev) => (prev < visibleOptions.length ? prev : 0));
  }, [visibleOptions.length]);

  // Keep the keyboard highlight visible — long question lists scroll, and an
  // offscreen highlight made arrow-key selection feel broken.
  useEffect(() => {
    if (!isOpen) return;
    listRef.current
      ?.querySelector(`[data-option-index="${highlightedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, highlightedIndex]);

  const getListItemClasses = (option: ComboboxOption, isSelected: boolean): string => {
    if (option.tier === undefined) {
      return `pl-4 border-l-4 transition-all ${
        isSelected
          ? `${theme.bg} ${theme.border} text-white light:text-slate-900 font-bold`
          : 'border-transparent hover:bg-white/5 light:hover:bg-slate-50 text-[rgb(var(--color-text-secondary))] light:text-slate-700'
      }`;
    }

    // Tiered options (questions): the row chrome uses the SAME tier-identity
    // colour as the question card (getTierScaleConfig), so the picker can
    // never disagree with the main question item. The option's renderLabel
    // already carries the tinted card, so unselected rows stay neutral here —
    // painting a second (previously marks-capped, i.e. sometimes DIFFERENT)
    // wash underneath was the source of the mismatched backgrounds.
    const tierConfig = getTierScaleConfig(option.tier);
    return isSelected
      ? `${tierConfig.bg} pl-3 border-l-4 ${tierConfig.border} text-[rgb(var(--color-text-primary))] light:text-slate-900 font-bold`
      : `pl-3 border-l-4 border-transparent hover:bg-white/5 light:hover:bg-slate-50 text-[rgb(var(--color-text-secondary))] light:text-slate-700`;
  };

  const baseInputStyles = `
    relative w-full rounded-xl py-3.5 px-4 text-left 
    transition-all duration-500 flex justify-between items-center group
    disabled:opacity-50 disabled:cursor-not-allowed min-h-[3.5rem]
    border active:scale-[0.98]
  `;

  // Dynamic styling based on state
  let stateStyles = '';

  if (isOpen) {
    // Open State: Diffused "Bloom" glow
    stateStyles = `${theme.glow} bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white text-white light:text-slate-900`;
  } else if (selectedOption) {
    // Closed but Selected: use the option's tier colour when available so the
    // button chrome matches the tier-coloured renderLabel inside it.
    if (selectedOption.tier !== undefined) {
      const tc = getTierScaleConfig(selectedOption.tier);
      stateStyles = `${tc.bg} ${tc.border} text-[rgb(var(--color-text-primary))] light:text-slate-900 shadow-sm`;
    } else {
      stateStyles = `${theme.bg} ${theme.border} text-[rgb(var(--color-text-primary))] light:text-slate-900 shadow-sm ${theme.hoverBorder}`;
    }
  } else {
    // Closed and Empty: Neutral surface with faint border (Fixed from stark white)
    stateStyles = `bg-[rgb(var(--color-bg-surface-inset))] light:bg-white border-white/10 light:border-slate-300 text-[rgb(var(--color-text-muted))] light:text-slate-500 ${theme.hoverBorder}`;
  }

  const listStateStyles = isOpen
    ? `shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border-white/10 light:border-slate-300 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white`
    : '';

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label
          id={labelId}
          className="block text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-2 ml-1"
        >
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`${baseInputStyles} ${stateStyles}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? `${listboxId}-opt-${highlightedIndex}` : undefined}
      >
        <span className={`flex items-center truncate w-full ${selectedOption ? 'font-bold' : ''}`}>
          {selectedOption?.isNew && (
            <Sparkles className="w-4 h-4 text-yellow-400 mr-2 animate-pulse" />
          )}
          <span className="truncate w-full block">
            {selectedOption ? selectedOption.renderLabel || selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 ml-2 transition-transform duration-500 ${isOpen ? `rotate-180 ${theme.icon}` : 'opacity-40'}`}
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
            }}
            className={`z-[100] rounded-xl overflow-hidden animate-fade-in border ${listStateStyles}`}
          >
            {/* Sits outside the scroll region so it stays put while the list
            moves under it. */}
            {isSearchable && (
              <div className="relative border-b border-white/10 light:border-slate-200">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--color-text-muted))] pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-expanded={isOpen}
                  aria-controls={listboxId}
                  aria-activedescendant={`${listboxId}-opt-${highlightedIndex}`}
                  aria-label={`Search ${options.length} options`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Search ${options.length}…`}
                  className="w-full bg-transparent py-3 pl-10 pr-9 text-sm font-medium text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder:text-[rgb(var(--color-text-muted))] focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={label ? labelId : undefined}
              className="max-h-72 py-1 overflow-auto custom-scrollbar"
            >
              {visibleOptions.length > 0 ? (
                visibleOptions.map((option, index) => {
                  // A dot point can carry twenty questions, and twenty tinted
                  // cards in a row are a wall rather than a choice. Where the
                  // caller supplies groups, the list breaks into named runs so
                  // the length is read as "six kinds of question" instead.
                  // Sticky, so the heading of the run being scrolled through is
                  // always the one on screen.
                  const heading =
                    option.group && option.group !== visibleOptions[index - 1]?.group ? (
                      <li
                        key={`group-${option.group}`}
                        role="presentation"
                        className="sticky top-0 z-10 px-4 pt-2.5 pb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[rgb(var(--color-text-dim))] light:text-slate-500 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white"
                      >
                        {option.group}
                      </li>
                    ) : null;

                  return (
                    <React.Fragment key={option.id}>
                      {heading}
                      <ComboboxOptionRow
                        option={option}
                        index={index}
                        listboxId={listboxId}
                        isSelected={option.id === value}
                        className={`${option.disabled ? 'cursor-not-allowed' : 'cursor-pointer'} select-none relative py-3 pr-9 transition-[color,background-color,border-color,transform] active:scale-[0.98] ${
                          index === highlightedIndex
                            ? `${getListItemClasses(option, true)}`
                            : getListItemClasses(option, option.id === value)
                        }`}
                        onClick={() => {
                          if (option.disabled) return;
                          commit(option.id);
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      />
                    </React.Fragment>
                  );
                })
              ) : (
                <li className="py-4 px-4 text-center">
                  <span className="block text-[rgb(var(--color-text-muted))] italic text-xs">
                    {deferredQuery.trim()
                      ? `Nothing matches “${deferredQuery.trim()}”.`
                      : 'No options available.'}
                  </span>
                  {emptyAction && (
                    <button
                      type="button"
                      onClick={() => {
                        emptyAction.onAction(deferredQuery.trim());
                        setIsOpen(false);
                      }}
                      className="mt-2 text-[11px] font-bold text-indigo-400 light:text-indigo-600 hover:underline not-italic"
                    >
                      {emptyAction.label}
                    </button>
                  )}
                </li>
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Combobox;
