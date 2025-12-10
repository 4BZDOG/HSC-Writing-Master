
import React, { useState, useRef, useEffect, useId } from 'react';
import { getBandConfig } from '../utils/renderUtils';
import { PromptVerb } from '../types';
import { Sparkles, ChevronDown } from 'lucide-react';
import { getCommandTermsForMarks } from '../data/commandTerms';


interface ComboboxOption {
  id: string;
  label: string;
  renderLabel?: React.ReactNode;
  marks?: number;
  verb?: PromptVerb;
  isNew?: boolean;
  tier?: number;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  label: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
}

const Combobox: React.FC<ComboboxProps> = ({ options, value, onChange, label, placeholder = 'Select an option', disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
  };

  const labelId = useId();
  
  const getListItemClasses = (option: ComboboxOption, isSelected: boolean): string => {
      let tier = option.tier;

      // If tier is not explicitly provided, try to derive it from marks (legacy fallback)
      if (tier === undefined && option.marks !== undefined) {
          const { primaryTerm: commandTermInfo } = getCommandTermsForMarks(option.marks);
          tier = commandTermInfo.tier;
      }
      
      // Standard padding for items without mark/tier-based styling (Course, Topic, etc.)
      if (tier === undefined) {
          return `pl-4 border-l-4 ${isSelected 
            ? 'bg-[rgb(var(--color-primary))]/10 border-[rgb(var(--color-primary))] text-white light:bg-indigo-50 light:text-indigo-900 light:border-indigo-600 font-semibold' 
            : 'border-transparent hover:bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-secondary))] light:text-slate-700 light:hover:bg-slate-100'}`;
      }
      
      // Logic for items with tiers (Questions)
      const bandConfig = getBandConfig(tier);
      
      // Use pl-3 combined with border-l-4 to create balanced visual rhythm
      const borderClasses = `pl-3 border-l-4 ${bandConfig.border}`;

      return isSelected 
        ? `bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 ${borderClasses} text-[rgb(var(--color-text-primary))] light:text-slate-900 font-semibold` 
        : `hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-50 text-[rgb(var(--color-text-secondary))] light:text-slate-700 ${borderClasses}`;
  };

  return (
    <div ref={containerRef} className="relative w-full">
        {label && (
            <label id={labelId} className="block text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-2 ml-1">
                {label}
            </label>
        )}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
            relative w-full rounded-xl shadow-sm py-3.5 px-4 text-left 
            focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50
            transition-all duration-200 flex justify-between items-center group
            disabled:opacity-50 disabled:cursor-not-allowed min-h-[3.5rem]
            ${selectedOption 
                // Selected state: Elegant tint, subtle border
                ? 'bg-[rgb(var(--color-primary))]/10 light:bg-indigo-50 border border-[rgb(var(--color-primary))]/30 light:border-indigo-200 text-[rgb(var(--color-text-primary))] light:text-indigo-950 shadow-sm' 
                // Default/Empty state
                : 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:border-[rgb(var(--color-border-accent))]'
            }
            ${isOpen ? 'ring-2 ring-[rgb(var(--color-accent))]/50 border-[rgb(var(--color-accent))]' : ''}
        `}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelId}
      >
        <span className={`flex items-center truncate w-full ${selectedOption ? 'font-bold' : ''}`}>
          {selectedOption?.isNew && <Sparkles className="w-4 h-4 text-yellow-400 mr-2 flex-shrink-0" />}
          <span className="truncate w-full block">
            {selectedOption ? (selectedOption.renderLabel || selectedOption.label) : placeholder}
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 ml-2 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${selectedOption ? 'text-[rgb(var(--color-primary))] light:text-indigo-600' : 'text-[rgb(var(--color-text-muted))]'}`} />
      </button>

      {isOpen && (
        <ul
          className="absolute z-[100] mt-2 w-full bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white shadow-2xl max-h-80 rounded-xl py-1 text-base ring-1 ring-black/5 overflow-auto focus:outline-none sm:text-sm border border-[rgb(var(--color-border-secondary))] light:border-slate-200 animate-fade-in-up-sm"
          role="listbox"
          aria-labelledby={labelId}
        >
          {options.length > 0 ? options.map((option) => (
            <li
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`cursor-pointer select-none relative py-3 pr-9 transition-colors duration-150 ${getListItemClasses(option, option.id === value)}`}
              role="option"
              aria-selected={option.id === value}
            >
              <div className={`flex items-center whitespace-normal w-full`}>
                {option.isNew && <Sparkles className="w-4 h-4 text-yellow-400 mr-2 flex-shrink-0" />}
                {option.renderLabel || option.label}
              </div>
              {option.id === value && (
                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-[rgb(var(--color-accent))] light:text-indigo-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </li>
          )) : (
             <li className="cursor-default select-none relative py-3 px-4 text-[rgb(var(--color-text-muted))] italic text-center">
                No options available.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default Combobox;
