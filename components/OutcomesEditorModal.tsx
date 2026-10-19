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
import {
  duplicateCodeRows,
  parseOutcomeList,
  withoutDuplicateCodes,
  yearOfOutcomeCode,
} from '../utils/outcomeCodes';
import { parseOutcomesFromText, fetchSyllabusPage } from '../services/geminiService';
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
import {
  CREATOR_BACKDROP,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
  CREATOR_INPUT,
} from '../utils/creatorChrome';

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
    if (!pastedText.trim()) return;
    // A NESA list of codes and descriptions is read as it stands: exact, instant,
    // and free, so it needs neither the AI nor the plan that pays for it. Only
    // text with no codes in it goes to the AI reader.
    const listed = parseOutcomeList(pastedText);
    if (listed.length > 0) {
      absorb(listed, 'in that text');
      setPastedText('');
      return;
    }
    if (studioBlocked()) return;
    setIsParsing(true);
    setError(null);
    try {
      absorb(await parseOutcomesFromText(pastedText), 'in that text');
      setPastedText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse the outcomes. Try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFetchUrl = async (normalisedUrl: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const page = await fetchSyllabusPage(normalisedUrl);
      // A curriculum.nsw.edu.au page carries its outcomes exactly; read those
      // rather than asking an AI to find them again in the page's text.
      const exact: CourseOutcome[] =
        page.nesa?.outcomes.map((o) => {
          const year = yearOfOutcomeCode(o.code) ?? page.nesa?.year ?? undefined;
          return { code: o.code, description: o.description, ...(year ? { year } : {}) };
        }) ?? [];
      const listed = exact.length > 0 ? exact : parseOutcomeList(page.text);
      if (listed.length > 0) {
        absorb(listed, 'on that page');
        setUrl('');
        return;
      }
      if (studioBlocked()) return;
      absorb(await parseOutcomesFromText(page.text.trim()), 'on that page');
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that page. Try again.');
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
    <div className={CREATOR_BACKDROP} onClick={guard.requestCloseFromBackdrop}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outcomes-editor-title"
        className={`${CREATOR_SHELL} max-w-5xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <Target className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>{courseName}</p>
            <h2 id="outcomes-editor-title" className={CREATOR_TITLE}>
              Edit outcomes
            </h2>
          </div>
          <button
            type="button"
            onClick={guard.requestClose}
            aria-label="Close"
            className={CREATOR_CLOSE}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {/* Body. Not CREATOR_BODY: it is two panes from md up, each with its own
            scroll, and CREATOR_BODY's padding would sit around both. On a phone
            the panes stack and this wrapper is the one that scrolls. */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden custom-scrollbar">
          {/* Import panel */}
          <div className="md:w-80 lg:w-96 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/10 flex flex-col bg-slate-50/50 dark:bg-[rgb(var(--color-bg-surface-inset))]/30 md:overflow-y-auto custom-scrollbar">
            <div className="p-5 flex flex-col gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles
                    className="w-4 h-4 text-[rgb(var(--color-accent))]"
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-semibold text-[rgb(var(--color-text-primary))]">
                    From the NESA outcomes page
                  </h3>
                </div>
                <p className="text-xs text-[rgb(var(--color-text-muted))] mb-2.5">
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
                <h3 className="text-sm font-semibold text-[rgb(var(--color-text-primary))] mb-2">
                  Or paste the text
                </h3>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  aria-label="Outcomes text to parse"
                  // NESA puts the year in the middle of every outcome code, so
                  // the example follows the tab on screen — pasting Year 11
                  // outcomes under a placeholder reading SE-12-01 invites the
                  // wrong list.
                  placeholder={`e.g.\nSE-${stem}-01 Describes methods used to plan, develop…\nSE-${stem}-02 Applies appropriate development…`}
                  className={`${CREATOR_INPUT} flex-grow resize-none min-h-[100px] md:min-h-[140px] leading-relaxed`}
                />
                <button
                  type="button"
                  onClick={handleParseText}
                  disabled={isBusy || !pastedText.trim()}
                  className={`${CREATOR_SECONDARY_BUTTON} mt-3 w-full flex items-center justify-center gap-2 text-[rgb(var(--color-accent))]`}
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  {isParsing ? 'Reading…' : 'Read outcomes'}
                </button>
                <p className="mt-2 text-[11px] text-[rgb(var(--color-text-muted))]">
                  Lines that start with an outcome code are read as they are. Only text without
                  codes is sent to the AI.
                </p>
              </div>

              <p className="text-[10px] text-[rgb(var(--color-text-muted))]">{NESA_HOST_HINT}</p>
            </div>
          </div>

          {/* Manual editor, one tab per year */}
          <div className="flex-1 flex flex-col min-h-0 md:overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex-shrink-0 border-b border-slate-200 dark:border-white/10 space-y-3">
              <div
                role="tablist"
                aria-label="Outcome year"
                className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[rgb(var(--color-bg-surface-inset))]/50"
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
                      className={`min-h-11 sm:min-h-0 flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        selected
                          ? 'bg-white border-slate-300 text-slate-900 shadow-sm dark:bg-[rgb(var(--color-bg-surface-light))] dark:border-white/15 dark:text-[rgb(var(--color-text-primary))]'
                          : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-[rgb(var(--color-text-muted))] dark:hover:text-[rgb(var(--color-text-primary))]'
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[rgb(var(--color-text-muted))]">
                  {validCount} valid {yearShortLabel(activeYear)} outcome
                  {validCount === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={handleAddOutcome}
                  className="min-h-11 sm:min-h-0 py-1.5 px-3.5 rounded-lg text-xs font-semibold text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10 hover:bg-[rgb(var(--color-accent))]/20 transition flex items-center gap-1.5 border border-[rgb(var(--color-accent))]/20"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add row
                </button>
              </div>
              {/* Says what the footer used to say, now that the footer is the
                  dialog's action row and holds only the buttons. */}
              <p className="text-[11px] text-[rgb(var(--color-text-muted))]">
                Incomplete rows are ignored on save. Both years are saved together.
              </p>
            </div>

            <div
              role="tabpanel"
              id="outcomes-editor-panel"
              aria-labelledby={`outcomes-editor-tab-${activeYear}`}
              className="flex-1 min-h-0 overflow-y-auto px-5 py-4"
            >
              <div className="space-y-3">
                {outcomes.map((outcome, index) => (
                  <div
                    key={index}
                    className="group flex items-start gap-2.5 p-3 sm:p-4 rounded-xl bg-slate-50/80 dark:bg-[rgb(var(--color-bg-surface-inset))]/40 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/15 transition-colors"
                  >
                    <span className="hidden sm:flex items-center justify-center w-6 h-6 rounded-lg bg-slate-200/80 dark:bg-[rgb(var(--color-bg-surface-inset))] text-[10px] font-bold text-slate-500 dark:text-[rgb(var(--color-text-muted))]/60 flex-shrink-0 mt-1.5">
                      {index + 1}
                    </span>
                    <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                      <input
                        type="text"
                        value={outcome.code}
                        onChange={(e) => handleOutcomeChange(index, 'code', e.target.value)}
                        placeholder={`e.g., SE-${stem}-01`}
                        aria-label={`Outcome ${index + 1} code`}
                        className={`${CREATOR_INPUT} font-mono font-semibold w-full sm:w-40 flex-shrink-0`}
                      />
                      <textarea
                        value={outcome.description}
                        onChange={(e) => handleOutcomeChange(index, 'description', e.target.value)}
                        placeholder="Outcome description…"
                        aria-label={`Outcome ${index + 1} description`}
                        rows={2}
                        className={`${CREATOR_INPUT} resize-y min-h-[56px] leading-relaxed`}
                      />
                      {repeatedRows.has(index) && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          {outcome.code.trim()} is already listed above — this row will be ignored.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteOutcome(index)}
                      className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 flex items-center justify-center text-slate-500 dark:text-[rgb(var(--color-text-muted))] hover:text-red-500 dark:hover:text-red-400 transition rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 flex-shrink-0 -mt-1 sm:mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      title="Delete outcome"
                      aria-label={`Delete outcome ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddOutcome}
                  className="min-h-11 sm:min-h-0 w-full py-3 px-4 rounded-xl text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/5 hover:bg-[rgb(var(--color-accent))]/10 transition text-sm font-semibold border border-dashed border-[rgb(var(--color-accent))]/30 hover:border-[rgb(var(--color-accent))]/50"
                >
                  <Plus className="inline w-4 h-4 mr-1" aria-hidden="true" /> Add{' '}
                  {yearShortLabel(activeYear)} outcome
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
          <div className={CREATOR_FOOTER}>
            <button type="button" onClick={guard.requestClose} className={CREATOR_SECONDARY_BUTTON}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} className={CREATOR_PRIMARY_BUTTON}>
              Save outcomes
            </button>
          </div>
        )}

        <AiBusyOverlay show={isBusy}>
          <LoadingIndicator
            task="enrichment"
            message={isFetching ? 'Reading the outcomes page' : 'Parsing the outcomes'}
            messages={
              isFetching
                ? ['Fetching the page', 'Picking out each outcome and the year it belongs to']
                : [
                    'Reading the outcomes text',
                    'Picking out each outcome and the year it belongs to',
                  ]
            }
          />
        </AiBusyOverlay>
      </div>
    </div>
  );
};

export default OutcomesEditorModal;
