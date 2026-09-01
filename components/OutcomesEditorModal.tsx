import React, { useState, useEffect } from 'react';
import type { ToastType } from '../hooks/useToast';
import { CourseOutcome, SyllabusYear } from '../types';
import {
  SYLLABUS_YEARS,
  mergeParsedOutcomes,
  outcomesFromYearTabs,
  outcomesOfYear,
  yearShortLabel,
} from '../utils/syllabusYear';
import { duplicateCodeRows, withoutDuplicateCodes } from '../utils/outcomeCodes';
import { parseOutcomesFromText, fetchSyllabusContentFromUrl } from '../services/geminiService';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import UrlFetchField, { NESA_HOST_HINT } from './UrlFetchField';
import DiscardConfirmBar from './DiscardConfirmBar';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { Target, X, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface OutcomesEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The course's complete outcome list, both years, tagged. */
  onSave: (newOutcomes: CourseOutcome[]) => void;
  /** The course's complete outcome list, as stored. */
  initialOutcomes: CourseOutcome[];
  courseName: string;
  /** The year the navigator is on — which tab opens, not which years are shown. */
  year: SyllabusYear;
  showToast: (message: string, type: ToastType) => void;
}

const blankRow = (): CourseOutcome[] => [{ code: '', description: '' }];

const byCode = (a: CourseOutcome, b: CourseOutcome) => a.code.localeCompare(b.code);

/**
 * Both years' outcomes, on tabs.
 *
 * The editor used to hold one year — whichever the navigator was on — which
 * made a NESA outcomes page unusable: those pages list Year 11 and Year 12
 * together, so half of every fetch had nowhere to go. Holding both also means
 * the save writes the whole list, which is only safe *because* both years are
 * in front of the user.
 */
const OutcomesEditorModal: React.FC<OutcomesEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialOutcomes,
  courseName,
  year,
  showToast,
}) => {
  const [tabs, setTabs] = useState<Record<SyllabusYear, CourseOutcome[]>>({
    year11: blankRow(),
    year12: blankRow(),
  });
  const [activeYear, setActiveYear] = useState<SyllabusYear>(year);
  const [pastedText, setPastedText] = useState('');
  const [url, setUrl] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcomes = tabs[activeYear];
  const setOutcomes = (next: CourseOutcome[]) =>
    setTabs((prev) => ({ ...prev, [activeYear]: next }));

  useEffect(() => {
    if (!isOpen) return;
    const seed = (y: SyllabusYear) => {
      const found = outcomesOfYear({ outcomes: initialOutcomes }, y).map(
        ({ code, description }) => ({
          code,
          description,
        })
      );
      // An empty year opens on one blank row, so there is always somewhere to
      // type — an empty box with an "Add" button is a dead end.
      return found.length > 0 ? [...found].sort(byCode) : blankRow();
    };
    setTabs({ year11: seed('year11'), year12: seed('year12') });
    setActiveYear(year);
    setPastedText('');
    setUrl('');
    setError(null);
  }, [isOpen, initialOutcomes, year]);

  const handleAddOutcome = () => setOutcomes([...outcomes, { code: '', description: '' }]);

  const handleDeleteOutcome = (index: number) =>
    setOutcomes(outcomes.filter((_, i) => i !== index));

  // The two TEXT fields only. `keyof CourseOutcome` also covers `year`, which
  // is not a free-text field and must not be written by a text input — the tab
  // decides the year.
  const handleOutcomeChange = (index: number, field: 'code' | 'description', value: string) => {
    const newOutcomes = [...outcomes];
    newOutcomes[index] = { ...newOutcomes[index], [field]: value };
    setOutcomes(newOutcomes);
  };

  /**
   * Fold a parse into the tabs and say where everything went.
   *
   * "Added 10 Year 11 and 9 Year 12 outcomes" is the whole point of accepting a
   * page that carries both — without it the user has to go and count.
   */
  const absorb = (parsed: CourseOutcome[], source: string) => {
    // Drop the empty starter rows from BOTH tabs first, or a fetch that fills
    // the other year leaves a blank line sitting above its results. Rows with
    // anything typed in them survive, even half-typed ones.
    const typedIn = (list: CourseOutcome[]) =>
      list.filter((o) => o.code.trim() || o.description.trim());
    const cleaned: Record<SyllabusYear, CourseOutcome[]> = {
      year11: typedIn(tabs.year11),
      year12: typedIn(tabs.year12),
    };
    const { tabs: merged, added, duplicates } = mergeParsedOutcomes(cleaned, parsed, activeYear);
    setTabs({
      year11: merged.year11.length ? merged.year11 : blankRow(),
      year12: merged.year12.length ? merged.year12 : blankRow(),
    });

    const parts = SYLLABUS_YEARS.filter((y) => added[y.id] > 0).map(
      (y) => `${added[y.id]} ${y.short}`
    );
    if (parts.length === 0) {
      showToast(
        duplicates > 0
          ? `Every outcome ${source} was already in the list.`
          : `No outcomes could be read ${source}.`,
        'info'
      );
      return;
    }
    // Landing on a tab that just gained rows beats leaving the user looking at
    // an unchanged one and wondering whether anything happened.
    const gained = SYLLABUS_YEARS.find((y) => added[y.id] > 0);
    if (gained && added[activeYear] === 0) setActiveYear(gained.id);
    showToast(
      `Added ${parts.join(' and ')} outcome${added.year11 + added.year12 === 1 ? '' : 's'}` +
        (duplicates > 0 ? `, skipping ${duplicates} already in the list.` : '.'),
      'success'
    );
  };

  /** The studio lock, checked here because both AI paths below are studio calls. */
  const studioBlocked = () => {
    if (!isFeatureLocked('aiContentStudio')) return false;
    requestUpgrade('aiContentStudio');
    return true;
  };

  const handleParseText = async () => {
    if (!pastedText.trim() || studioBlocked()) return;
    setIsParsing(true);
    setError(null);
    try {
      absorb(await parseOutcomesFromText(pastedText), 'in that text');
      setPastedText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse outcomes.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFetchUrl = async (normalisedUrl: string) => {
    if (studioBlocked()) return;
    setIsFetching(true);
    setError(null);
    try {
      const content = (await fetchSyllabusContentFromUrl(normalisedUrl)).trim();
      absorb(await parseOutcomesFromText(content), 'on that page');
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read that page.');
    } finally {
      setIsFetching(false);
    }
  };

  const isBusy = isParsing || isFetching;

  const handleSave = () => {
    const complete = (list: CourseOutcome[]) =>
      list.filter((o) => o.code.trim() && o.description.trim());
    // A question links to an outcome by code, so two rows sharing one make the
    // link ambiguous. Flagged on the row and dropped here.
    onSave(
      outcomesFromYearTabs({
        year11: withoutDuplicateCodes(complete(tabs.year11)),
        year12: withoutDuplicateCodes(complete(tabs.year12)),
      })
    );
    onClose();
  };

  const handleClose = () => {
    if (isBusy) return;
    onClose();
  };

  /**
   * Whether closing would actually lose something.
   *
   * Compared against what was loaded rather than tracking a flag: a fetch that
   * lands twenty outcomes and a hand-typed row are the same kind of loss, and
   * merely opening the modal and closing it again should not ask a question.
   */
  const asStored = (list: CourseOutcome[]) =>
    list
      .map((o) => `${o.year ?? 'year12'}|${o.code.trim()}|${o.description.trim()}`)
      .sort()
      .join('\n');
  const hasWork =
    pastedText.trim().length > 0 ||
    asStored(
      outcomesFromYearTabs({
        year11: tabs.year11.filter((o) => o.code.trim() || o.description.trim()),
        year12: tabs.year12.filter((o) => o.code.trim() || o.description.trim()),
      })
    ) !== asStored(initialOutcomes);

  const guard = useDiscardGuard(isOpen, hasWork, handleClose);

  useEscapeKey(isOpen && !isBusy, guard.requestClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  if (!isOpen) {
    return null;
  }

  const countFor = (y: SyllabusYear) =>
    tabs[y].filter((o) => o.code.trim() && o.description.trim()).length;
  const validCount = countFor(activeYear);
  // BI-11-01 vs BI-12-01: the year is the middle segment of every NESA code.
  const stem = activeYear === 'year11' ? '11' : '12';
  const repeatedRows = duplicateCodeRows(outcomes);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Edit course outcomes"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-modal p-4"
      onClick={guard.requestCloseFromBackdrop}
    >
      <div
        className="relative bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Edit Outcomes
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  {courseName} · both years
                </p>
              </div>
            </div>
            <button
              onClick={guard.requestClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        {/* Content — stacks vertically on mobile, side-by-side on desktop */}
        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          {/* Import panel */}
          <div className="md:w-80 lg:w-96 flex-shrink-0 border-b md:border-b-0 md:border-r border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex flex-col bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50">
            <div className="p-5 flex flex-col h-full gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                  <h3 className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    From the NESA outcomes page
                  </h3>
                </div>
                <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-2.5">
                  A NESA page lists both years together, and each outcome goes to the year it
                  belongs to.
                </p>
                <UrlFetchField
                  value={url}
                  onChange={setUrl}
                  onFetch={handleFetchUrl}
                  onInvalid={setError}
                  isFetching={isFetching}
                  disabled={isBusy}
                  label="Outcomes page URL"
                  layout="stacked"
                  error={error}
                />
              </div>

              <div className="flex flex-col flex-grow min-h-0">
                <h3 className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2">
                  …or paste the text
                </h3>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  aria-label="Outcomes text to parse"
                  // NESA puts the year in the middle of every outcome code, so
                  // the example follows the tab on screen — pasting Year 11
                  // outcomes under a placeholder reading SE-12-01 invites the
                  // wrong list.
                  placeholder={`e.g.\nSE-${stem}-01 Describes methods used to plan, develop...\nSE-${stem}-02 Applies appropriate development...`}
                  className="flex-grow bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] resize-none min-h-[100px] md:min-h-0 leading-relaxed text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder:text-[rgb(var(--color-text-muted))]/60"
                />
                <button
                  onClick={handleParseText}
                  disabled={isBusy || !pastedText.trim()}
                  className="mt-3 w-full py-2.5 px-4 rounded-lg text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-lg active:scale-[0.98] transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  {isParsing ? 'Parsing...' : 'Parse with AI'}
                </button>
              </div>

              <p className="text-[10px] text-[rgb(var(--color-text-muted))]/80 light:text-slate-400">
                {NESA_HOST_HINT}
              </p>
            </div>
          </div>

          {/* Manual editor, one tab per year */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="px-5 pt-5 pb-3 flex-shrink-0 border-b border-[rgb(var(--color-border-secondary))]/50 light:border-slate-100 space-y-3">
              <div
                role="tablist"
                aria-label="Outcome year"
                className="flex items-center gap-1 p-1 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100"
              >
                {SYLLABUS_YEARS.map((y) => {
                  const selected = y.id === activeYear;
                  const count = countFor(y.id);
                  return (
                    <button
                      key={y.id}
                      type="button"
                      role="tab"
                      id={`outcomes-editor-tab-${y.id}`}
                      aria-selected={selected}
                      aria-controls="outcomes-editor-panel"
                      onClick={() => setActiveYear(y.id)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold border transition-colors ${
                        selected
                          ? 'bg-[rgb(var(--color-bg-surface-light))] light:bg-white border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-[rgb(var(--color-text-primary))] light:text-slate-900 shadow-sm'
                          : 'border-transparent text-[rgb(var(--color-text-muted))] light:text-slate-600 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900'
                      }`}
                    >
                      {y.label}
                      {count > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))]">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  {validCount} valid {yearShortLabel(activeYear)} outcome
                  {validCount === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={handleAddOutcome}
                  className="py-1.5 px-3.5 rounded-lg text-xs font-semibold text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10 hover:bg-[rgb(var(--color-accent))]/20 transition flex items-center gap-1.5 border border-[rgb(var(--color-accent))]/20"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
              </div>
            </div>

            <div
              role="tabpanel"
              id="outcomes-editor-panel"
              aria-labelledby={`outcomes-editor-tab-${activeYear}`}
              className="flex-grow overflow-y-auto px-5 py-4"
            >
              <div className="space-y-3">
                {outcomes.map((outcome, index) => (
                  <div
                    key={index}
                    className="group flex items-start gap-2.5 p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50/80 border border-[rgb(var(--color-border-secondary))]/60 light:border-slate-200 hover:border-[rgb(var(--color-border-secondary))] light:hover:border-slate-300 transition-colors"
                  >
                    <span className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200/80 text-[10px] font-bold text-[rgb(var(--color-text-muted))]/60 light:text-slate-500 flex-shrink-0 mt-1.5">
                      {index + 1}
                    </span>
                    <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                      <input
                        type="text"
                        value={outcome.code}
                        onChange={(e) => handleOutcomeChange(index, 'code', e.target.value)}
                        placeholder={`e.g., SE-${stem}-01`}
                        className="bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-3.5 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-full sm:w-40 font-mono text-sm font-semibold flex-shrink-0"
                      />
                      <textarea
                        value={outcome.description}
                        onChange={(e) => handleOutcomeChange(index, 'description', e.target.value)}
                        placeholder="Outcome description..."
                        rows={2}
                        className="bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-3.5 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-full text-sm resize-y min-h-[56px] leading-relaxed"
                      />
                      {repeatedRows.has(index) && (
                        <p className="text-[11px] text-amber-400 light:text-amber-600">
                          {outcome.code.trim()} is already listed above — this row will be ignored.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteOutcome(index)}
                      className="p-2 text-[rgb(var(--color-text-muted))]/50 light:text-slate-300 hover:text-red-400 light:hover:text-red-500 transition rounded-lg flex items-center hover:bg-red-500/10 light:hover:bg-red-50 flex-shrink-0 mt-1"
                      title="Delete Outcome"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddOutcome}
                  className="w-full py-3 px-4 rounded-xl text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/5 hover:bg-[rgb(var(--color-accent))]/10 transition text-sm font-semibold border border-dashed border-[rgb(var(--color-accent))]/30 hover:border-[rgb(var(--color-accent))]/50"
                >
                  <Plus className="inline w-4 h-4 mr-1" /> Add {yearShortLabel(activeYear)} Outcome
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {guard.isConfirming ? (
          <DiscardConfirmBar
            summary="these outcome changes"
            onKeep={guard.cancelDiscard}
            onDiscard={guard.confirmDiscard}
          />
        ) : (
          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 hidden sm:block">
              Incomplete rows are ignored on save. Both years are saved together.
            </p>
            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={guard.requestClose}
                className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        <AiBusyOverlay show={isBusy}>
          <LoadingIndicator
            message={isFetching ? 'Reading the page...' : 'Parsing outcomes...'}
            task="enrichment"
          />
        </AiBusyOverlay>
      </div>
    </div>
  );
};

export default OutcomesEditorModal;
