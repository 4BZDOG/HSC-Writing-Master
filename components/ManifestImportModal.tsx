import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DiscoveredDoc } from '../hooks/useSyllabusData';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { SUBJECT_AREAS, SUBJECT_AREA_ICON, SUBJECT_AREA_TILE } from '../utils/subjectAreas';
import {
  ChevronDown,
  Download,
  Loader2,
  AlertCircle,
  Lock,
  Search,
  X,
  Library,
} from 'lucide-react';

interface ManifestImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  discoveredDocs: DiscoveredDoc[];
  onImport: (docs: DiscoveredDoc[]) => Promise<boolean>;
}

const PLACEHOLDERS: Record<string, string[]> = {
  English: ['English Extension 1', 'English Extension 2'],
  Mathematics: ['Mathematics Standard 2', 'Mathematics Extension 1'],
  Science: ['Physics', 'Earth and Environmental Science'],
  HSIE: ['Modern History', 'Ancient History', 'Business Studies', 'Legal Studies', 'Economics'],
  TAS: ['Design and Technology', 'Engineering Studies', 'Industrial Technology'],
  'Creative Arts': ['Visual Arts', 'Music 1', 'Drama'],
  PDHPE: ['Community and Family Studies'],
};

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const ManifestImportModal: React.FC<ManifestImportModalProps> = ({
  isOpen,
  onClose,
  discoveredDocs,
  onImport,
}) => {
  const [localDocs, setLocalDocs] = useState<DiscoveredDoc[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  // Escape closes this modal like every other modal surface (but never mid-operation).
  useEscapeKey(isOpen && !isImporting, onClose);
  useScrollLock(isOpen);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLocalDocs([...discoveredDocs]);
      const initialSelected = new Set<string>();
      discoveredDocs.forEach((d) => {
        if (d.selected) initialSelected.add(d.id);
      });
      setSelectedIds(initialSelected);
      setError(null);
      setSearchQuery('');
    }
  }, [isOpen, discoveredDocs]);

  const toggleSelect = (id: string) => {
    if (isImporting) return;
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSubjectChange = (docId: string, newSubject: string) => {
    setLocalDocs((prev) =>
      prev.map((doc) => (doc.id === docId ? { ...doc, subject: newSubject } : doc))
    );
  };

  const handleImportClick = async () => {
    if (selectedIds.size === 0) return;
    setIsImporting(true);
    setError(null);
    try {
      const docsToImport = localDocs.filter((d) => selectedIds.has(d.id));
      const success = await onImport(docsToImport);
      if (success) onClose();
      else setError('Import sequence failed. Re-initiating discovery...');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Internal system fault during data synthesis.');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredGroupedDocs = useMemo(() => {
    const groups: Record<string, { docs: DiscoveredDoc[]; placeholders: string[] }> = {};
    const allVisibleDocIds: string[] = [];
    const query = searchQuery.toLowerCase();

    SUBJECT_AREAS.forEach((s) => {
      const subjectDocs = localDocs.filter((doc) => {
        const docSubject = doc.subject || 'Other';
        const matchesSubject =
          docSubject === s || (s === 'Other' && !(SUBJECT_AREAS as string[]).includes(docSubject));
        const matchesQuery =
          doc.name.toLowerCase().includes(query) || doc.source.toLowerCase().includes(query);
        return matchesSubject && matchesQuery;
      });

      if (subjectDocs.length > 0) {
        subjectDocs.forEach((d) => allVisibleDocIds.push(d.id));
      }

      const subjectPlaceholders = (PLACEHOLDERS[s] || []).filter((ph) =>
        ph.toLowerCase().includes(query)
      );

      if (subjectDocs.length > 0 || subjectPlaceholders.length > 0) {
        groups[s] = { docs: subjectDocs, placeholders: subjectPlaceholders };
      }
    });

    return { groups, allVisibleDocIds };
  }, [localDocs, searchQuery]);

  /** The faculties with names the app does not carry yet, in catalogue order. */
  const notCarried = useMemo(
    () =>
      SUBJECT_AREAS.map((subject) => ({
        subject,
        placeholders: filteredGroupedDocs.groups[subject]?.placeholders ?? [],
      })).filter((entry) => entry.placeholders.length > 0),
    [filteredGroupedDocs]
  );

  /**
   * Fix: Added type assertion to Object.values to prevent 'unknown' type errors during placeholder checking.
   */
  const hasResults = useMemo(
    () =>
      filteredGroupedDocs.allVisibleDocIds.length > 0 ||
      (Object.values(filteredGroupedDocs.groups) as { placeholders: string[] }[]).some(
        (g) => g.placeholders.length > 0
      ),
    [filteredGroupedDocs]
  );

  const unresolvedTopicCount = useMemo(
    () =>
      localDocs.filter(
        (doc) => doc.type === 'topic' && !doc.targetCourseId && !doc.targetCourseName
      ).length,
    [localDocs]
  );

  const toggleSelectAll = () => {
    if (isImporting) return;
    const visibleDocIds = filteredGroupedDocs.allVisibleDocIds;
    const allVisibleSelected = visibleDocIds.every((id) => selectedIds.has(id));
    const newSet = new Set(selectedIds);
    if (allVisibleSelected) {
      visibleDocIds.forEach((id) => newSet.delete(id));
    } else {
      visibleDocIds.forEach((id) => newSet.add(id));
    }
    setSelectedIds(newSet);
  };
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      /* Named by its own heading rather than by a second, separate string.
         The hand-written name was "Import a course pack" while the heading
         read "Add syllabuses", so a screen reader announced the dialog as one
         thing and then read out another — and the two had already drifted
         once. `aria-labelledby` cannot drift. */
      aria-labelledby="manifest-import-title"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-modal-elevated p-3 sm:p-6 animate-fade-in"
    >
      <div className="bg-[rgb(var(--color-bg-surface))]/90 light:bg-white/95 rounded-surface shadow-[0_64px_128px_-24px_rgba(0,0,0,0.7)] w-full max-w-[1200px] border border-white/10 light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[90vh] relative group">
        <MeshOverlay opacity="opacity-[0.03]" />

        {/* Global Banner Glow */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

        {/* Dynamic Header */}
        <div className="px-5 sm:px-12 pt-6 sm:pt-12 pb-6 sm:pb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-10 relative z-10">
          <div className="flex items-center gap-4 sm:gap-8">
            <div className="relative group/icon shrink-0">
              <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 group-hover/icon:opacity-40 transition-opacity duration-700" />
              <div className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-tile bg-gradient-to-br from-indigo-500 to-sky-500 tile-bevel flex items-center justify-center transform transition-transform duration-500 group-hover/icon:scale-105">
                <Library className="w-7 h-7 sm:w-10 sm:h-10 text-white" />
              </div>
            </div>
            {/* The eyebrow above the heading read "Content Library" and the
                heading read "Content Library". A label that repeats the thing
                it labels is not a label. */}
            <div className="min-w-0">
              <h2
                id="manifest-import-title"
                className="text-2xl sm:text-4xl font-black text-white light:text-slate-900 tracking-tight leading-none"
              >
                Add syllabuses
              </h2>
              <p className="text-slate-400 light:text-slate-500 text-sm font-medium mt-3 max-w-lg leading-relaxed">
                Tick the NESA syllabuses you teach. You can add more at any time from the curriculum
                tools.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative group/search w-full md:w-auto md:min-w-[320px]">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 transition-colors group-focus-within/search:text-indigo-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-12 py-4 bg-black/20 light:bg-slate-50 border border-white/5 light:border-slate-200 rounded-2xl text-white light:text-slate-900 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-inner font-medium"
                placeholder="Search syllabuses"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/10 light:hover:bg-slate-200 text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Catalogue */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-12 pb-8 sm:pb-12 custom-scrollbar bg-black/10 light:bg-slate-50/50 relative">
          <div className="sticky top-0 z-20 py-4 sm:py-6 flex flex-wrap justify-between items-center gap-3 bg-[rgb(var(--color-bg-surface))]/60 light:bg-white/80 backdrop-blur-md -mx-5 sm:-mx-12 px-5 sm:px-12 border-b border-white/5 light:border-slate-200 mb-8">
            {/* A chip reading "Filter Content" sat here, styled exactly like
                a button and doing nothing — the search field above is the
                filter. The count is what this row is for. */}
            <div className="flex items-center gap-5 flex-wrap">
              <span className="text-xs font-bold text-slate-500">
                <span className="text-white light:text-slate-900">
                  {filteredGroupedDocs.allVisibleDocIds.length}
                </span>{' '}
                {filteredGroupedDocs.allVisibleDocIds.length === 1 ? 'syllabus' : 'syllabuses'}
                {selectedIds.size > 0 && (
                  <span className="text-indigo-400 light:text-indigo-600">
                    {' '}
                    · {selectedIds.size} ticked
                  </span>
                )}
              </span>
              {unresolvedTopicCount > 0 && (
                <div className="t-label flex items-center gap-2.5 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 light:text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {unresolvedTopicCount === 1
                    ? '1 topic names no course to add itself to'
                    : `${unresolvedTopicCount} topics name no course to add themselves to`}
                </div>
              )}
            </div>

            <button
              onClick={toggleSelectAll}
              disabled={isImporting}
              className="t-label text-indigo-400 hover:text-indigo-300 transition-colors py-2 px-4 rounded-xl hover:bg-indigo-500/5"
            >
              {filteredGroupedDocs.allVisibleDocIds.every((id) => selectedIds.has(id))
                ? 'Clear selection'
                : 'Select all'}
            </button>
          </div>

          {!hasResults ? (
            <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
              <div className="w-24 h-24 rounded-tile bg-white/5 light:bg-slate-100 flex items-center justify-center mb-8 border border-white/5 light:border-slate-200">
                <Search className="w-10 h-10 text-slate-600" />
              </div>
              <p className="text-xl font-black text-slate-500 tracking-tight">
                No syllabus matches “{searchQuery}”
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-6 text-sm font-bold text-indigo-400 hover:underline"
              >
                Show all syllabuses
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {SUBJECT_AREAS.map((subject) => {
                const group = filteredGroupedDocs.groups[subject];
                // A faculty with nothing to tick is not a section. Five of the
                // eight rendered as a full heading — coloured icon tile, 20px
                // black title, "0 available" and an empty bordered list — to
                // say the app does not carry them yet. Measured on the shipped
                // manifest, those five took 41% of the scroll height of a
                // screen whose entire job is choosing between the other three.
                // Everything they had to say is one line, and it is now at the
                // bottom with the rest of it.
                if (!group || group.docs.length === 0) return null;

                const { docs } = group;
                const Icon = SUBJECT_AREA_ICON[subject];

                return (
                  <section key={subject} className="animate-fade-in">
                    <div className="flex items-center gap-4 mb-3 px-1">
                      <div
                        className={`p-2.5 rounded-xl border shadow-lg ${SUBJECT_AREA_TILE[subject]}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-black text-white light:text-slate-900 tracking-tight">
                          {subject}
                        </h3>
                        <span className="text-[11px] font-medium text-slate-500">
                          {docs.length} available
                        </span>
                      </div>
                    </div>

                    {/*
                      A checklist, not a gallery.

                      These were cards in a three-up grid: 280px each to carry
                      one thing the reader is actually choosing between — the
                      syllabus name — alongside a file icon identical on every
                      card, a "Course JSON" pill naming a file format, and the
                      source filename. Eight syllabuses filled two and a half
                      screens, so picking the three you teach meant scrolling
                      past the ones you don't.

                      The content is a list of names to tick. So it is a list
                      of names to tick, and all eight fit above the fold.
                    */}
                    <ul className="rounded-panel border border-white/5 light:border-slate-200 bg-white/[0.02] light:bg-white overflow-hidden divide-y divide-white/5 light:divide-slate-200">
                      {docs.map((doc) => {
                        const isSelected = selectedIds.has(doc.id);
                        const orphanTopic =
                          doc.type === 'topic' && !doc.targetCourseName && !doc.targetCourseId;
                        return (
                          <li
                            key={doc.id}
                            className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 sm:px-5 py-3.5 transition-colors ${
                              isSelected
                                ? 'bg-indigo-500/[0.07] light:bg-indigo-50/70'
                                : 'hover:bg-white/[0.03] light:hover:bg-slate-50'
                            } ${isImporting ? 'opacity-40 pointer-events-none' : ''}`}
                          >
                            {/*
                              The checkbox is a checkbox. It used to be a
                              decorative circle inside a clickable `<div>`, with
                              no tab stop, no role and no key handler, so
                              choosing what to import — the only thing this
                              screen does — could not be done from a keyboard
                              at all. The label covers the name and the empty
                              space beside it, giving a large target without
                              swallowing the subject picker to its right.
                            */}
                            <input
                              type="checkbox"
                              id={`doc-${doc.id}`}
                              checked={isSelected}
                              onChange={() => toggleSelect(doc.id)}
                              disabled={isImporting}
                              className="w-4 h-4 shrink-0 accent-indigo-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--color-bg-surface))]"
                            />
                            {/* Capped, so the picker to its right stays beside
                                the name it belongs to. Uncapped it was pushed
                                to the far edge of an 1150px row — the name at
                                x=140, the subject that names it at x=995, with
                                nothing in between and every select in the
                                section reading the same word. */}
                            <label
                              htmlFor={`doc-${doc.id}`}
                              className="flex-1 min-w-0 sm:max-w-sm cursor-pointer select-none"
                              title={doc.source}
                            >
                              <span
                                className={`block text-sm font-bold leading-snug ${
                                  isSelected
                                    ? 'text-white light:text-slate-900'
                                    : 'text-slate-300 light:text-slate-800'
                                }`}
                              >
                                {doc.name}
                              </span>
                              {/* What a topic attaches to, as a sentence. It
                                  was a pill reading "Target HSC Biology" —
                                  a label and a value with no verb between
                                  them, sitting at the same weight as a pill
                                  naming the file format. */}
                              {doc.type === 'topic' && !orphanTopic && (
                                <span className="block text-[11px] text-slate-500 light:text-slate-500 mt-0.5">
                                  adds to {doc.targetCourseName || doc.targetCourseId}
                                </span>
                              )}
                              {orphanTopic && (
                                <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500 light:text-amber-600 mt-0.5">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  No course named — this one has nowhere to go
                                </span>
                              )}
                            </label>

                            {/* `appearance-none` and a drawn chevron, like
                                every other select in the app — left native, it
                                rendered an OS control in the middle of the
                                app's own surfaces. Full width on a phone so it
                                takes its own line instead of squeezing the
                                name it belongs to into two. */}
                            <div className="relative w-full sm:w-auto order-last sm:order-none">
                              <select
                                value={doc.subject || 'Other'}
                                onChange={(e) => handleSubjectChange(doc.id, e.target.value)}
                                disabled={isImporting}
                                aria-label={`Subject area for ${doc.name}`}
                                className="t-label w-full sm:w-[11rem] appearance-none bg-black/20 light:bg-slate-100 border border-white/5 light:border-slate-300 text-slate-400 light:text-slate-600 rounded-lg py-2 pl-3 pr-9 cursor-pointer hover:border-indigo-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                              >
                                {SUBJECT_AREAS.map((area) => (
                                  <option key={area} value={area}>
                                    {area}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}

              {/* Everything the app does not carry yet, once, at the end.
                  These were full dashed cards the same size as a real choice,
                  then a line under each faculty — which still meant a faculty
                  with nothing in it wore a heading. A teacher does want to
                  know whether Drama is coming, so no name is dropped; it is
                  simply not laid out like something you can tick. */}
              {notCarried.length > 0 && (
                <section className="pt-8 border-t border-white/5 light:border-slate-200">
                  <h3 className="t-label flex items-center gap-2 text-slate-500 light:text-slate-500">
                    <Lock className="w-3 h-3" />
                    Not carried yet
                  </h3>
                  <dl className="mt-3 space-y-1.5">
                    {notCarried.map(({ subject, placeholders }) => (
                      <div
                        key={subject}
                        className="flex flex-wrap gap-x-2 text-[11px] leading-relaxed"
                      >
                        {/* A fixed column so seven faculty names scan down
                            the left edge rather than ragging against their
                            own lengths. Drops back to flow on a phone, where
                            the names wrap anyway. */}
                        <dt className="font-bold text-slate-400 light:text-slate-600 sm:w-32 sm:shrink-0">
                          {subject}
                        </dt>
                        <dd className="text-slate-500 light:text-slate-500">
                          {placeholders.join(', ')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Studio Footer Controls */}
        <div className="px-5 sm:px-12 py-5 sm:py-10 bg-[rgb(var(--color-bg-surface))]/95 light:bg-white/95 border-t border-white/5 light:border-slate-200 flex flex-col sm:flex-row justify-between items-center backdrop-blur-3xl z-30 gap-3 sm:gap-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="t-label px-6 sm:px-10 py-3 sm:py-4 rounded-panel text-slate-500 hover:text-white light:hover:text-slate-900 transition-all disabled:opacity-30"
            >
              Skip for now
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-bold">{error}</span>
            </div>
          )}

          <button
            onClick={handleImportClick}
            disabled={selectedIds.size === 0 || isImporting}
            className={`
 w-full sm:w-auto sm:min-w-[280px] px-6 py-4 rounded-panel font-bold text-sm text-white shadow-lg transition-all flex items-center justify-center gap-4
                    ${
                      selectedIds.size > 0 && !isImporting
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:scale-105 active:scale-[0.98] shadow-indigo-500/20'
                        : 'bg-white/5 light:bg-slate-100 text-slate-600 cursor-not-allowed border border-white/5 light:border-slate-200'
                    }
                `}
          >
            {isImporting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Adding…
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                {selectedIds.size === 1 ? 'Add 1 syllabus' : `Add ${selectedIds.size} syllabuses`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ManifestImportModal;
