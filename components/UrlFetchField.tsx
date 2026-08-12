import React, { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';

/**
 * The page-reader supports NESA/NSW curriculum hosts. Saying so up front turns
 * a rejected request into a question that was never asked — the reader's own
 * refusal is accurate but arrives after a round trip and a spinner.
 */
export const NESA_HOST_HINT =
  'Works with NESA pages — educationstandards.nsw.edu.au and curriculum.nsw.edu.au.';

interface UrlFetchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the normalised, syntactically valid URL. */
  onFetch: (url: string) => void;
  /** Called with a message when what was typed is not a web address at all. */
  onInvalid: (message: string) => void;
  isFetching: boolean;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  /**
   * Why the last fetch failed, shown under the field.
   *
   * A modal's error block sits at the bottom of a scrolling body, so a failure
   * from a control at the top appeared off-screen: the button stopped spinning
   * and nothing else visibly happened.
   */
  error?: string | null;
  /**
   * "stacked" puts the button under the field. The side-by-side default keys
   * off the VIEWPORT, which is wrong inside a narrow side panel: on a wide
   * screen the row wins and the URL box is left too cramped to read a URL in.
   */
  layout?: 'inline' | 'stacked';
}

/**
 * One URL box, used by every "fetch from a page" surface.
 *
 * The three copies of this had drifted: two normalised bare domains and one did
 * not, none of them submitted on Enter, and none said which hosts the reader
 * accepts. Typing a URL and pressing Enter is what everyone does.
 */
const UrlFetchField: React.FC<UrlFetchFieldProps> = ({
  value,
  onChange,
  onFetch,
  onInvalid,
  isFetching,
  disabled = false,
  label = 'Page URL',
  placeholder = 'https://curriculum.nsw.edu.au/...',
  error = null,
  layout = 'inline',
}) => {
  const [id] = useState(() => `url-fetch-${Math.random().toString(36).slice(2, 9)}`);

  const submit = () => {
    if (!value.trim() || disabled || isFetching) return;
    // Accept a bare domain by assuming https, but reject anything that still is
    // not a web address rather than sending it and waiting for a refusal.
    let normalised = value.trim();
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    try {
      const candidate = new URL(normalised);
      if (!candidate.hostname.includes('.')) throw new Error('no hostname');
    } catch {
      onInvalid(
        `That does not look like a web address. Paste the full page URL, e.g. https://curriculum.nsw.edu.au/…`
      );
      return;
    }
    onFetch(normalised);
  };

  return (
    <div className="space-y-2">
      <div className={`flex gap-2 ${layout === 'stacked' ? 'flex-col' : 'flex-col sm:flex-row'}`}>
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          id={id}
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Inside a <form> this would submit it; every caller here wants the
              // fetch instead.
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled && !isFetching}
          className="flex-grow min-w-0 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 light:bg-blue-600 light:hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 flex-shrink-0"
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Globe className="w-4 h-4" />
          )}
          {isFetching ? 'Reading…' : 'Fetch'}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="text-red-400 light:text-red-600 text-xs bg-red-900/20 light:bg-red-50 p-2.5 rounded-md border border-red-500/20 light:border-red-200"
        >
          {error}
        </p>
      )}
    </div>
  );
};

export default UrlFetchField;
