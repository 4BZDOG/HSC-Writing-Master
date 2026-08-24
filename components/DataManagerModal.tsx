import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Course, Topic } from '../types';
import ImportFlow from './dataManager/ImportFlow';
import ExportFlow from './dataManager/ExportFlow';
import TopicReorderList from './dataManager/TopicReorderList';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import {
  Database,
  X,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Activity,
  AlertTriangle,
  ShieldAlert,
  ListOrdered,
  Cpu,
  Zap,
  Gauge,
  Settings,
  ShieldCheck,
  Box,
  type LucideIcon,
} from 'lucide-react';

interface DataManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  onImportCourses: (courses: Course[], resolutions: Map<string, 'merge' | 'skip'>) => void;
  onImportTopic: (courseId: string, topic: Topic) => void;
  onClearAll: () => void;
  onResetToDefault: () => void;
  onResetApiStats: () => void;
  onMoveTopic: (courseId: string, topicId: string, direction: 'up' | 'down') => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type Tab = 'maintenance' | 'import' | 'export';

const MeshOverlay = ({ opacity = 'opacity-[0.03]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const InstrumentMetric = ({
  label,
  value,
  subValue,
  colorClass,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  colorClass: string;
}) => (
  <div className="flex flex-col gap-1 px-8 py-4 border-r border-white/5 light:border-slate-200 last:border-r-0">
    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 light:text-slate-500">
      {label}
    </span>
    <div className="flex items-baseline gap-2">
      <span className={`text-4xl font-black tracking-tighter tabular-nums ${colorClass}`}>
        {value}
      </span>
      {subValue && (
        <span className="text-xs font-bold text-white/10 light:text-slate-500 uppercase tracking-widest">
          {subValue}
        </span>
      )}
    </div>
  </div>
);

/**
 * A vault tab button, at module scope on purpose.
 *
 * Declared inside the modal it would be a new component type on every render,
 * so React would unmount and remount all three tabs whenever anything in the
 * vault changed — losing focus for anyone driving it from the keyboard. The
 * active tab and the setter come in as props.
 */
const NavButton = ({
  tab,
  icon: Icon,
  label,
  activeTab,
  onSelect,
}: {
  tab: Tab;
  icon: LucideIcon;
  label: string;
  activeTab: Tab;
  onSelect: (tab: Tab) => void;
}) => (
  <button
    onClick={() => onSelect(tab)}
    aria-current={activeTab === tab ? 'page' : undefined}
    className={`
            w-auto md:w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] whitespace-nowrap transition-all duration-300
            ${
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-900/20 scale-[1.02] border border-white/20'
                : 'text-slate-500 hover:text-slate-300 light:hover:text-slate-700 hover:bg-white/5 light:hover:bg-slate-100 border border-transparent'
            }
        `}
  >
    {Icon && <Icon className="w-4 h-4" />}
    {label}
  </button>
);

const DataManagerModal: React.FC<DataManagerModalProps> = ({
  isOpen,
  onClose,
  courses,
  onImportCourses,
  onImportTopic,
  onClearAll,
  onResetToDefault,
  onResetApiStats,
  onMoveTopic,
  showToast,
}) => {
  // Escape closes this modal like every other modal surface.
  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);
  const [activeTab, setActiveTab] = useState<Tab>('maintenance');

  const totalQuestions = useMemo(() => {
    return courses.reduce(
      (acc, c) =>
        acc +
        c.topics.reduce(
          (acc2, t) =>
            acc2 +
            t.subTopics.reduce(
              (acc3, st) => acc3 + st.dotPoints.reduce((acc4, dp) => acc4 + dp.prompts.length, 0),
              0
            ),
          0
        ),
      0
    );
  }, [courses]);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Data vault"
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[500] p-3 sm:p-6 animate-fade-in"
    >
      <div
        className="bg-[rgb(var(--color-bg-base))] light:bg-white rounded-[32px] sm:rounded-[48px] shadow-[0_64px_128px_-24px_rgba(0,0,0,0.8)] w-full max-w-6xl border border-white/10 light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col md:flex-row h-[92vh] md:h-[85vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        <MeshOverlay opacity="opacity-[0.05]" />

        {/* Studio Sidebar — compact strip on phones so the working pane keeps
            most of the modal height; full-height rail from md up. */}
        <div className="w-full md:w-72 bg-black/40 light:bg-slate-50 border-b md:border-b-0 md:border-r border-white/5 light:border-slate-200 flex flex-col flex-shrink-0 z-10 relative">
          <div className="p-5 md:p-10 border-b border-white/5 light:border-slate-200">
            <div className="flex items-center gap-4 md:mb-2">
              <div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl border border-white/10">
                <Database className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-black text-white light:text-slate-900 tracking-tighter italic uppercase leading-none">
                  Studio
                </h2>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em]">
                  Vault
                </span>
              </div>
              {/* Phones have no Escape key and the Disconnect footer is hidden
                  below md, so the compact header carries the close control. */}
              <button
                onClick={onClose}
                aria-label="Close Data Vault"
                className="md:hidden p-2.5 rounded-xl bg-white/5 light:bg-slate-100 hover:bg-white/10 light:hover:bg-slate-200 text-slate-400 hover:text-white light:hover:text-slate-900 transition-colors border border-white/5 light:border-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4 md:p-6 md:flex-1 flex flex-row md:flex-col gap-2 md:gap-3 overflow-x-auto md:overflow-x-visible md:overflow-y-auto scrollbar-hide md:custom-scrollbar">
            <NavButton
              tab="maintenance"
              icon={Activity}
              label="Maintenance"
              activeTab={activeTab}
              onSelect={setActiveTab}
            />
            <NavButton
              tab="import"
              icon={Upload}
              label="Sync In"
              activeTab={activeTab}
              onSelect={setActiveTab}
            />
            <NavButton
              tab="export"
              icon={Download}
              label="Archive Out"
              activeTab={activeTab}
              onSelect={setActiveTab}
            />
          </div>

          <div className="hidden md:block p-8 border-t border-white/5 light:border-slate-200 bg-black/20 light:bg-slate-50">
            <button
              onClick={onClose}
              className="w-full py-4 rounded-2xl bg-white/5 light:bg-slate-100 hover:bg-white/10 light:hover:bg-slate-200 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 hover:text-white light:hover:text-slate-900 transition-all flex items-center justify-center gap-3 border border-white/5 light:border-slate-200 shadow-lg"
            >
              <X className="w-4 h-4" /> Disconnect
            </button>
          </div>
        </div>

        {/* Main Interface */}
        <div className="flex-1 bg-[rgb(var(--color-bg-base))]/30 relative overflow-hidden flex flex-col z-10">
          {/* Telemetry Header */}
          <div className="px-5 md:px-10 py-5 md:py-8 border-b border-white/5 light:border-slate-200 bg-black/20 light:bg-slate-50 flex flex-col lg:flex-row justify-between items-center gap-4 md:gap-8">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 opacity-40">
                <Zap className="w-3 h-3 text-indigo-400" />
                <span className="text-[9px] font-black uppercase tracking-[0.5em] text-white light:text-slate-500">
                  System Diagnostics
                </span>
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-white light:text-slate-900 tracking-tighter uppercase italic leading-none">
                {activeTab === 'maintenance'
                  ? 'Storage Calibrator'
                  : activeTab === 'import'
                    ? 'Inbound Data Stream'
                    : 'Archive Engine'}
              </h3>
            </div>

            <div className="flex bg-black/40 light:bg-slate-100 rounded-3xl border border-white/5 light:border-slate-200 p-1 shadow-inner">
              <InstrumentMetric
                label="Logical Units"
                value={courses.length}
                subValue="Courses"
                colorClass="text-white"
              />
              <InstrumentMetric
                label="Knowledge Payload"
                value={totalQuestions}
                subValue="Units"
                colorClass="text-indigo-400"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            <div className="p-5 md:p-10 max-w-4xl mx-auto w-full">
              {activeTab === 'maintenance' && (
                <div className="space-y-12 animate-fade-in">
                  <section>
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                        <ListOrdered className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white light:text-slate-900 uppercase tracking-widest italic">
                          Sequence Manager
                        </h4>
                        <p className="text-xs text-slate-500 font-bold">
                          Reorder curriculum hierarchy for optimal session flow and NESA alignment.
                        </p>
                      </div>
                    </div>
                    <TopicReorderList courses={courses} onMoveTopic={onMoveTopic} />
                  </section>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-12 border-t border-white/5 light:border-slate-200">
                    <section className="p-8 rounded-[40px] bg-blue-500/5 border border-blue-500/10 group hover:border-blue-500/30 transition-all">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400">
                          <Gauge className="w-6 h-6" />
                        </div>
                        <h4 className="text-xs font-black text-white light:text-slate-900 uppercase tracking-[0.2em]">
                          Sensor Reset
                        </h4>
                      </div>
                      <p className="text-sm text-slate-400 light:text-slate-600 font-medium leading-relaxed mb-8">
                        Purge session and lifetime telemetry from the AI monitor. This recalibrates
                        usage readings without affecting core data.
                      </p>
                      <button
                        onClick={onResetApiStats}
                        className="w-full py-4 rounded-2xl bg-blue-600/10 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-600/20 hover:bg-blue-600 hover:text-white transition-all shadow-xl shadow-blue-900/10"
                      >
                        Reset Telemetry
                      </button>
                    </section>

                    <section className="p-8 rounded-[40px] bg-red-500/5 border border-red-500/10 group hover:border-red-500/30 transition-all">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 rounded-2xl bg-red-500/20 text-red-400">
                          <ShieldAlert className="w-6 h-6" />
                        </div>
                        <h4 className="text-xs font-black text-white light:text-slate-900 uppercase tracking-[0.2em]">
                          Engine Wipe
                        </h4>
                      </div>
                      <p className="text-sm text-slate-400 light:text-slate-600 font-medium leading-relaxed mb-8">
                        Permanently discard all curriculum and session data. Revert the local
                        database to factory defaults.
                      </p>
                      <div className="flex gap-4">
                        <button
                          onClick={onClearAll}
                          className="flex-1 py-4 rounded-2xl bg-red-600/10 text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-600/20 hover:bg-red-600 hover:text-white transition-all"
                        >
                          Purge All
                        </button>
                        <button
                          onClick={onResetToDefault}
                          className="flex-1 py-4 rounded-2xl bg-slate-800/40 light:bg-slate-100 text-slate-400 light:text-slate-600 text-[10px] font-black uppercase tracking-widest border border-white/5 light:border-slate-200 hover:bg-white/10 light:hover:bg-slate-200 hover:text-white light:hover:text-slate-900 transition-all"
                        >
                          Defaults
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {activeTab === 'import' && (
                <div className="animate-fade-in">
                  <ImportFlow
                    existingCourses={courses}
                    onImport={onImportCourses}
                    onImportTopic={onImportTopic}
                    onClose={onClose}
                  />
                </div>
              )}

              {activeTab === 'export' && (
                <div className="animate-fade-in">
                  <ExportFlow courses={courses} onClose={onClose} showToast={showToast} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DataManagerModal;
