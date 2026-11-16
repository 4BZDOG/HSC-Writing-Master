import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Library, Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import type { Course } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  countQuestions,
  missingFromLibrary,
  type ShippedCourseOffer,
} from '../utils/shippedCatalogue';
import { groupCoursesByFaculty } from '../utils/courseGrouping';
import {
  SUBJECT_AREA_FULL_NAME,
  SUBJECT_AREA_ICON,
  SUBJECT_AREA_TILE,
} from '../utils/subjectAreas';
import {
  CREATOR_BACKDROP,
  CREATOR_BODY,
  CREATOR_CLOSE,
  CREATOR_FOOTER,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_INPUT,
  CREATOR_KICKER,
  CREATOR_PRIMARY_BUTTON,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_SHELL,
  CREATOR_TITLE,
} from '../utils/creatorChrome';

/**
 * The course library: every course the app ships that this library does not
 * hold, grouped by faculty, to add at any time.
 *
 * The first-run picker ("Add syllabuses", `ManifestImportModal`) was the only
 * place a shipped course could be added from, and a course left unticked there
 * is recorded as offered, so the version sync never adds it later either. A
 * returning user who wanted Biology after all had no way to get it. This reads
 * the shipped catalogue afresh each time it opens, so it also lists a course a
 * user deleted, and the structure-only courses that ship unticked.
 */

interface CourseLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The library as it stands: what it holds is not offered. */
  courses: Course[];
  /** Reads the shipped catalogue. Rejects when it cannot be read at all. */
  loadCatalogue: () => Promise<ShippedCourseOffer[]>;
  /** Adds the chosen courses. Returns the ids actually added. */
  onAdd: (offers: ShippedCourseOffer[]) => string[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; catalogue: ShippedCourseOffer[] }
  | { status: 'error' };

/** The search box appears once there is enough to search, as in the course picker. */
const SEARCH_FROM = 7;

const questionsLabel = (n: number): string =>
  n === 0 ? 'Structure only, no questions yet' : n === 1 ? '1 question' : `${n} questions`;

const CourseLibraryModal: React.FC<CourseLibraryModalProps> = ({
  isOpen,
  onClose,
  courses,
  loadCatalogue,
  onAdd,
}) => {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  // A read that finishes after a newer one started (a quick close and reopen) is dropped.
  const requestRef = useRef(0);

  const read = useCallback(() => {
    const request = ++requestRef.current;
    setLoad({ status: 'loading' });
    loadCatalogue().then(
      (catalogue) => {
        if (request === requestRef.current) setLoad({ status: 'ready', catalogue });
      },
      (err) => {
        console.warn('[Course library] Could not read the shipped courses:', err);
        if (request === requestRef.current) setLoad({ status: 'error' });
      }
    );
  }, [loadCatalogue]);

  // Read afresh on every open, and start from nothing ticked.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    setQuery('');
    read();
  }, [isOpen, read]);

  const missing = useMemo(
    () => (load.status === 'ready' ? missingFromLibrary(load.catalogue, courses) : []),
    [load, courses]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? missing.filter((offer) => offer.name.toLowerCase().includes(q)) : missing;
  }, [missing, query]);

  const groups = useMemo(() => groupCoursesByFaculty(visible), [visible]);

  // Only what is still on offer counts: a course the library gained while this was
  // open (another tab, a sync) drops out of the list and out of the count with it.
  const chosen = useMemo(
    () => missing.filter((offer) => selectedIds.has(offer.id)),
    [missing, selectedIds]
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleAdd = () => {
    if (chosen.length === 0) return;
    onAdd(chosen);
    onClose();
  };

  if (!isOpen) return null;

  const addLabel =
    chosen.length === 0
      ? 'Add courses'
      : chosen.length === 1
        ? 'Add 1 course'
        : `Add ${chosen.length} courses`;

  return createPortal(
    <div className={CREATOR_BACKDROP} onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-library-title"
        aria-describedby="course-library-kicker"
        className={`${CREATOR_SHELL} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <Library className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p id="course-library-kicker" className={CREATOR_KICKER}>
              Shipped courses not in your library
            </p>
            <h2 id="course-library-title" className={CREATOR_TITLE}>
              Course library
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={CREATOR_CLOSE}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className={`${CREATOR_BODY} space-y-6`}>
          {load.status === 'loading' && (
            <div
              role="status"
              className="flex items-center justify-center gap-3 py-12 text-sm text-secondary"
            >
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              Reading the course library…
            </div>
          )}

          {load.status === 'error' && (
            <div role="alert" className="flex flex-col items-center text-center gap-4 py-10">
              <AlertCircle className="w-8 h-8 text-red-700 dark:text-red-400" aria-hidden="true" />
              <p className="text-sm text-primary max-w-sm">
                The course library could not be read. Check your connection and try again.
              </p>
              <button type="button" onClick={read} className={CREATOR_SECONDARY_BUTTON}>
                <span className="inline-flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Try again
                </span>
              </button>
            </div>
          )}

          {load.status === 'ready' && missing.length === 0 && (
            <div className="flex flex-col items-center text-center gap-3 py-10">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
              </div>
              <p className="text-sm text-primary">
                Every course the app ships is already in your library.
              </p>
            </div>
          )}

          {load.status === 'ready' && missing.length > 0 && (
            <>
              <p className="text-sm text-secondary leading-relaxed">
                Tick the courses you want to add. Nothing already in your library changes.
              </p>

              {missing.length >= SEARCH_FROM && (
                <div className="relative">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search the course library"
                    placeholder="Search courses"
                    className={`${CREATOR_INPUT} pl-11`}
                  />
                </div>
              )}

              {visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  No course in the library matches “{query.trim()}”.
                </p>
              ) : (
                groups.map(({ area, courses: offers }) => {
                  const Icon = SUBJECT_AREA_ICON[area];
                  const headingId = `course-library-${area.replace(/\s+/g, '-').toLowerCase()}`;
                  return (
                    <section key={area} aria-labelledby={headingId}>
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          aria-hidden="true"
                          className={`p-1.5 rounded-lg border ${SUBJECT_AREA_TILE[area]}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <h3
                          id={headingId}
                          title={SUBJECT_AREA_FULL_NAME[area]}
                          className="text-sm font-bold text-primary"
                        >
                          {area}
                        </h3>
                        <span className="text-xs text-muted">{offers.length} available</span>
                      </div>
                      <ul className="rounded-panel border border-slate-200 dark:border-white/10 bg-surface-elevated overflow-hidden divide-y divide-slate-200 dark:divide-white/5">
                        {offers.map((offer) => {
                          const isSelected = selectedIds.has(offer.id);
                          const inputId = `course-library-${offer.id}`;
                          const questions = countQuestions(offer.course);
                          return (
                            <li
                              key={offer.id}
                              className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                                isSelected
                                  ? 'bg-indigo-50/70 dark:bg-indigo-500/[0.07]'
                                  : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                id={inputId}
                                checked={isSelected}
                                onChange={() => toggle(offer.id)}
                                className="w-4 h-4 shrink-0 accent-indigo-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              />
                              <label
                                htmlFor={inputId}
                                className="flex-1 min-w-0 cursor-pointer select-none"
                              >
                                <span className="block text-sm font-bold text-primary leading-snug">
                                  {offer.name}
                                </span>
                                <span className="block text-xs text-muted mt-0.5">
                                  {questionsLabel(questions)}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })
              )}
            </>
          )}
        </div>

        <div className={CREATOR_FOOTER}>
          <button type="button" onClick={onClose} className={CREATOR_SECONDARY_BUTTON}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={chosen.length === 0}
            className={CREATOR_PRIMARY_BUTTON}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {addLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CourseLibraryModal;
