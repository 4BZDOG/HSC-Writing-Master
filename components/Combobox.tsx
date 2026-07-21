import React, { useState, useRef, useEffect, useId } from 'react';
import { getTierScaleConfig } from '../utils/renderUtils';
import { PromptVerb } from '../types';
import { Sparkles, ChevronDown } from 'lucide-react';

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
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  label: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  color?: ComboboxColor;
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

const Combobox: React.FC<ComboboxProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  disabled = false,
  color = 'default',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedOption = options.find((opt) => opt.id === value);
  const labelId = useId();
  const listboxId = useId();

  const theme = colorStyles[color] || colorStyles.default;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Step the highlight, skipping disabled (locked) options so Enter always
  // lands on something actionable.
  const stepHighlight = (direction: 1 | -1) => {
    if (options.length === 0) return;
    setHighlightedIndex((prev) => {
      let next = prev;
      for (let i = 0; i < options.length; i++) {
        next = (next + direction + options.length) % options.length;
        if (!options[next]?.disabled) return next;
      }
      return prev; // every option disabled — stay put
    });
  };

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
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
          setHighlightedIndex(options.length - 1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && options.length > 0 && !options[highlightedIndex]?.disabled) {
          onChange(options[highlightedIndex].id);
          setIsOpen(false);
        } else if (!isOpen) {
          setIsOpen(true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
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
    ? `shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border-white/10 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white`
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

      {isOpen && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          className={`absolute z-[100] mt-2 w-full max-h-80 rounded-xl py-1 overflow-auto animate-fade-in custom-scrollbar border ${listStateStyles}`}
        >
          {options.length > 0 ? (
            options.map((option, index) => (
              <li
                key={option.id}
                id={`${listboxId}-opt-${index}`}
                data-option-index={index}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.id);
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`${option.disabled ? 'cursor-not-allowed' : 'cursor-pointer'} select-none relative py-3 pr-9 transition-colors ${
                  index === highlightedIndex
                    ? `${getListItemClasses(option, true)}`
                    : getListItemClasses(option, option.id === value)
                }`}
                role="option"
                aria-selected={option.id === value}
                aria-disabled={option.disabled || undefined}
              >
                <div className="flex items-center whitespace-normal w-full">
                  {option.renderLabel || option.label}
                </div>
              </li>
            ))
          ) : (
            <li className="py-4 px-4 text-[rgb(var(--color-text-muted))] italic text-center text-xs">
              No options available.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default Combobox;
