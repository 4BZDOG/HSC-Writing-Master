import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DiscoveredDoc } from '../hooks/useSyllabusData';
import {
  CheckSquare,
  Square,
  Download,
  FileJson,
  Sparkles,
  Loader2,
  AlertCircle,
  Cpu,
  Beaker,
  BookOpen,
  Globe,
  Calculator,
  Palette,
  Activity,
  Layers,
  ChevronDown,
  Lock,
  Search,
  X,
  Library,
  Check,
  Filter,
  Database,
} from 'lucide-react';

interface ManifestImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  discoveredDocs: DiscoveredDoc[];
  onImport: (docs: DiscoveredDoc[]) => Promise<boolean>;
}

// Subject Identity Configuration
const SubjectIcons: Record<string, React.ElementType> = {
  Science: Beaker,
  TAS: Cpu,
  HSIE: Globe,
  English: BookOpen,
  Mathematics: Calculator,
  'Creative Arts': Palette,
  PDHPE: Activity,
  Other: Layers,
};

const SubjectColors: Record<string, string> = {
  Science:
    'text-emerald-400 light:text-emerald-700 bg-emerald-500/10 light:bg-emerald-100 border-emerald-500/20 light:border-emerald-200',
  TAS: 'text-blue-400 light:text-blue-700 bg-blue-500/10 light:bg-blue-100 border-blue-500/20 light:border-blue-200',
  HSIE: 'text-amber-400 light:text-amber-700 bg-amber-500/10 light:bg-amber-100 border-amber-500/20 light:border-amber-200',
  English:
    'text-purple-400 light:text-purple-700 bg-purple-500/10 light:bg-purple-100 border-purple-500/20 light:border-purple-200',
  Mathematics:
    'text-sky-400 light:text-sky-700 bg-sky-500/10 light:bg-sky-100 border-sky-500/20 light:border-sky-200',
  'Creative Arts':
    'text-pink-400 light:text-pink-700 bg-pink-500/10 light:bg-pink-100 border-pink-500/20 light:border-pink-200',
  PDHPE:
    'text-red-400 light:text-red-700 bg-red-500/10 light:bg-red-100 border-red-500/20 light:border-red-200',
  Other:
    'text-gray-400 light:text-slate-600 bg-gray-500/10 light:bg-slate-100 border-gray-500/20 light:border-slate-200',
};

const PLACEHOLDERS: Record<string, string[]> = {
  English: ['English Extension 1', 'English Extension 2'],
  Mathematics: ['Mathematics Standard 2', 'Mathematics Extension 1'],
  Science: ['Physics', 'Earth and Environmental Science'],
  HSIE: ['Modern History', 'Ancient History', 'Business Studies', 'Legal Studies', 'Economics'],
  TAS: ['Design and Technology', 'Engineering Studies', 'Industrial Technology'],
  'Creative Arts': ['Visual Arts', 'Music 1', 'Drama'],
  PDHPE: ['Community and Family Studies'],
};

const AvailableSubjects = Object.keys(SubjectIcons);

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

    AvailableSubjects.forEach((s) => {
      const subjectDocs = localDocs.filter((doc) => {
        const docSubject = doc.subject || 'Other';
        const matchesSubject =
          docSubject === s || (s === 'Other' && !AvailableSubjects.includes(docSubject));
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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl flex items-center justify-center z-[200] p-6 transition-all duration-700 animate-fade-in">
      <div className="bg-[rgb(var(--color-bg-surface))]/90 light:bg-white/95 rounded-[48px] shadow-[0_64px_128px_-24px_rgba(0,0,0,0.7)] w-full max-w-[1200px] border border-white/10 light:border-slate-200 animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh] relative group">
        <MeshOverlay opacity="opacity-[0.03]" />

        {/* Global Banner Glow */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

        {/* Dynamic Header */}
        <div className="px-12 pt-12 pb-10 flex flex-col md:flex-row md:items-center justify-between gap-10 relative z-10">
          <div className="flex items-center gap-8">
            <div className="relative group/icon">
              <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 group-hover/icon:opacity-40 transition-opacity duration-700" />
              <div className="relative w-20 h-20 rounded-[28px] bg-gradient-to-br from-indigo-500 to-sky-500 border border-white/20 shadow-2xl flex items-center justify-center transform transition-transform duration-500 group-hover/icon:scale-105">
                <Library className="w-10 h-10 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-indigo-400 opacity-80">
                  Content Library
                </span>
                <div className="h-px w-8 bg-indigo-500/30" />
              </div>
              <h2 className="text-4xl font-black text-white light:text-slate-900 tracking-tight leading-none">
                Content Library
              </h2>
              <p className="text-slate-400 light:text-slate-500 text-sm font-medium mt-3 max-w-lg leading-relaxed">
                Synthesise your workspace with specialized NESA syllabus models. Select your core
                curriculum units below.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group/search min-w-[320px]">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 transition-colors group-focus-within/search:text-indigo-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-12 py-4 bg-black/20 light:bg-slate-50 border border-white/5 light:border-slate-200 rounded-2xl text-white light:text-slate-900 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-inner font-medium"
                placeholder="Filter syllabus units..."
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Catalog */}
        <div className="flex-1 overflow-y-auto px-12 pb-12 custom-scrollbar bg-black/10 light:bg-slate-50/50 relative">
          <div className="sticky top-0 z-20 py-6 flex justify-between items-center bg-[rgb(var(--color-bg-surface))]/60 backdrop-blur-md -mx-12 px-12 border-b border-white/5 mb-8">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <Filter className="w-3.5 h-3.5" /> Filter Content
              </div>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-xs font-bold text-slate-500">
                Showing{' '}
                <span className="text-white light:text-slate-900">
                  {filteredGroupedDocs.allVisibleDocIds.length}
                </span>{' '}
                units
              </span>
            </div>

            <button
              onClick={toggleSelectAll}
              disabled={isImporting}
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-400 hover:text-indigo-300 transition-colors py-2 px-4 rounded-xl hover:bg-indigo-500/5"
            >
              {filteredGroupedDocs.allVisibleDocIds.every((id) => selectedIds.has(id))
                ? 'Deselect Collection'
                : 'Select All Visible'}
            </button>
          </div>

          {!hasResults ? (
            <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
              <div className="w-24 h-24 rounded-[32px] bg-white/5 flex items-center justify-center mb-8 border border-white/5">
                <Search className="w-10 h-10 text-slate-600" />
              </div>
              <p className="text-xl font-black text-slate-500 tracking-tight">
                No matches found in standard registry
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-6 text-sm font-bold text-indigo-400 hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="space-y-16">
              {AvailableSubjects.map((subject) => {
                const group = filteredGroupedDocs.groups[subject];
                if (!group) return null;

                const { docs, placeholders } = group;
                const Icon = SubjectIcons[subject];
                const colorClass = SubjectColors[subject];

                return (
                  <section key={subject} className="animate-fade-in">
                    <div className="flex items-center gap-5 mb-8 px-2">
                      <div
                        className={`p-2.5 rounded-[14px] ${colorClass.split(' ')[1]} ${colorClass.split(' ')[2]} border ${colorClass.split(' ')[3]} shadow-lg`}
                      >
                        <Icon className={`w-5 h-5 ${colorClass.split(' ')[0]}`} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-black text-white light:text-slate-900 uppercase italic tracking-tight">
                          {subject}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="h-1 w-1 rounded-full bg-slate-700" />
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            {docs.length} Active Records
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {docs.map((doc) => {
                        const isSelected = selectedIds.has(doc.id);
                        return (
                          <div
                            key={doc.id}
                            className={`
                                                    relative flex flex-col p-6 rounded-[32px] border transition-all duration-500 group cursor-pointer overflow-hidden
                                                    ${
                                                      isSelected
                                                        ? 'bg-indigo-500/10 border-indigo-500/40 shadow-2xl shadow-indigo-900/20 scale-[1.03]'
                                                        : 'bg-white/[0.03] light:bg-white border-white/5 light:border-slate-200 hover:border-white/20 light:hover:border-slate-300 hover:bg-white/[0.05] light:hover:bg-slate-50 hover:-translate-y-1'
                                                    }
                                                    ${isImporting ? 'opacity-40 grayscale pointer-events-none' : ''}
                                                `}
                            onClick={() => toggleSelect(doc.id)}
                          >
                            {/* Selection Pulse Glow */}
                            {isSelected && (
                              <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-500/20 blur-3xl animate-pulse" />
                            )}
                            <MeshOverlay
                              opacity={isSelected ? 'opacity-[0.06]' : 'opacity-[0.02]'}
                            />

                            <div className="flex justify-between items-start mb-6 relative z-10">
                              <div
                                className={`p-2 rounded-xl bg-black/20 border border-white/5 ${isSelected ? 'text-indigo-400' : 'text-slate-600'}`}
                              >
                                <FileJson className="w-5 h-5" />
                              </div>
                              <div
                                className={`
                                                        w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 border
                                                        ${
                                                          isSelected
                                                            ? 'bg-indigo-500 border-white/20 text-white shadow-lg'
                                                            : 'bg-white/5 border-white/5 text-transparent group-hover:border-white/20'
                                                        }
                                                     `}
                              >
                                <Check className="w-4 h-4" />
                              </div>
                            </div>

                            <div className="relative z-10 flex-1">
                              <h4
                                className={`text-lg font-black leading-tight tracking-tight mb-3 ${isSelected ? 'text-white' : 'text-slate-300 light:text-slate-800'}`}
                              >
                                {doc.name}
                              </h4>
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                                  {doc.type === 'topic' ? 'Topic JSON' : 'Course JSON'}
                                </span>
                                {doc.type === 'topic' &&
                                  (doc.targetCourseName || doc.targetCourseId) && (
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-sky-300 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20">
                                      Target {doc.targetCourseName || doc.targetCourseId}
                                    </span>
                                  )}
                              </div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <Database className="w-3 h-3" /> {doc.source}
                              </p>
                            </div>

                            {/* Dynamic Categorisation */}
                            <div
                              className={`mt-6 pt-5 border-t border-white/5 relative z-10 ${isSelected ? 'block' : 'opacity-0 group-hover:opacity-100 transition-opacity duration-500'}`}
                            >
                              <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={doc.subject || 'Other'}
                                  onChange={(e) => handleSubjectChange(doc.id, e.target.value)}
                                  className="w-full bg-black/30 light:bg-slate-100 border border-white/5 light:border-slate-200 text-slate-400 light:text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-xl py-2.5 px-4 appearance-none cursor-pointer hover:border-indigo-500/30 transition-colors focus:outline-none"
                                >
                                  {AvailableSubjects.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Locked Placeholders */}
                      {placeholders.map((ph, i) => (
                        <div
                          key={`ph-${i}`}
                          className="relative flex items-center justify-between p-6 rounded-[32px] border border-dashed border-white/5 light:border-slate-200 bg-black/10 light:bg-slate-50/50 opacity-40 cursor-not-allowed select-none transition-opacity hover:opacity-50"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-700">
                              <Lock className="w-5 h-5" />
                            </div>
                            <span className="text-sm font-black text-slate-500 uppercase tracking-tight italic">
                              {ph}
                            </span>
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400/50 bg-indigo-500/5 px-2.5 py-1 rounded-full border border-indigo-500/10">
                            Coming Soon
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Studio Footer Controls */}
        <div className="px-12 py-10 bg-[rgb(var(--color-bg-surface))]/95 light:bg-white/95 border-t border-white/5 light:border-slate-200 flex flex-col sm:flex-row justify-between items-center backdrop-blur-3xl z-30 gap-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="px-10 py-4 rounded-[20px] text-xs font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-white light:hover:text-slate-900 transition-all disabled:opacity-30"
            >
              Skip Import
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
                    min-w-[280px] py-4 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] text-white shadow-2xl transition-all flex items-center justify-center gap-4
                    ${
                      selectedIds.size > 0 && !isImporting
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 hover:scale-105 active:scale-95 shadow-indigo-500/20'
                        : 'bg-white/5 text-slate-600 cursor-not-allowed border border-white/5'
                    }
                `}
          >
            {isImporting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Import {selectedIds.size} Items
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
