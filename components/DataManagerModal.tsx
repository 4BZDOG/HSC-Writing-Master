
import React, { useState } from 'react';
import { Course, Topic } from '../types';
import ImportFlow from './dataManager/ImportFlow';
import ExportFlow from './dataManager/ExportFlow';
import TopicReorderList from './dataManager/TopicReorderList';
import { Database, X, Download, Upload, Trash2, RotateCcw, Activity, AlertTriangle, ShieldAlert, ListOrdered } from 'lucide-react';

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

type Tab = 'import' | 'export' | 'manage';

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
  const [activeTab, setActiveTab] = useState<Tab>('manage');

  if (!isOpen) return null;

  const NavButton = ({ tab, icon: Icon, label }: { tab: Tab; icon: any; label: string }) => (
    <button 
        onClick={() => setActiveTab(tab)}
        className={`
            w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200
            ${activeTab === tab 
                ? 'bg-gradient-to-r from-[rgb(var(--color-primary))]/20 to-[rgb(var(--color-accent))]/20 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/20 shadow-sm' 
                : 'text-[rgb(var(--color-text-secondary))] hover:bg-[rgb(var(--color-bg-surface-light))] hover:text-[rgb(var(--color-text-primary))] border border-transparent'
            }
        `}
    >
        <Icon className={`w-4 h-4 ${activeTab === tab ? 'text-[rgb(var(--color-accent))]' : 'opacity-70'}`} />
        {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] rounded-3xl shadow-2xl w-full max-w-5xl border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden flex flex-col md:flex-row h-[85vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-[rgb(var(--color-bg-surface-inset))]/50 border-b md:border-b-0 md:border-r border-[rgb(var(--color-border-secondary))] flex flex-col flex-shrink-0">
            <div className="p-6 border-b border-[rgb(var(--color-border-secondary))]/50">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg text-white ring-1 ring-white/10">
                        <Database className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[rgb(var(--color-text-primary))] leading-tight">Data Manager</h2>
                        <p className="text-[10px] font-medium text-[rgb(var(--color-text-muted))] uppercase tracking-wider">System Control</p>
                    </div>
                 </div>
            </div>
            
            <div className="p-4 flex-1 flex flex-col gap-2 overflow-y-auto">
                 <NavButton tab="manage" icon={Activity} label="Maintenance" />
                 <NavButton tab="import" icon={Upload} label="Import Data" />
                 <NavButton tab="export" icon={Download} label="Export Data" />
            </div>

            <div className="p-4 border-t border-[rgb(var(--color-border-secondary))]/50">
                <button 
                    onClick={onClose} 
                    className="w-full py-2.5 rounded-xl border border-[rgb(var(--color-border-secondary))] text-xs font-bold text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-light))] transition-colors flex items-center justify-center gap-2"
                >
                    <X className="w-3.5 h-3.5" /> Close Manager
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-[rgb(var(--color-bg-surface))]/30 relative overflow-hidden flex flex-col">
            
            {activeTab === 'manage' && (
                <div className="flex-1 p-8 overflow-y-auto custom-scrollbar animate-fade-in">
                    <div className="max-w-2xl mx-auto space-y-8">
                        <div>
                            <h3 className="text-xl font-bold text-[rgb(var(--color-text-primary))] mb-2 flex items-center gap-2">
                                <ListOrdered className="w-5 h-5 text-[rgb(var(--color-accent))]" /> 
                                Content Organization
                            </h3>
                            <p className="text-sm text-[rgb(var(--color-text-muted))] mb-4">
                                Reorder topics within your courses to match the syllabus structure.
                            </p>
                            <TopicReorderList courses={courses} onMoveTopic={onMoveTopic} />
                        </div>

                        <div className="border-t border-[rgb(var(--color-border-secondary))]/50 pt-8">
                            <h3 className="text-xl font-bold text-[rgb(var(--color-text-primary))] mb-2 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-400" /> 
                                Diagnostics
                            </h3>
                            <p className="text-sm text-[rgb(var(--color-text-muted))] mb-4">
                                Manage application telemetry and performance metrics.
                            </p>
                            
                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-5 flex items-center justify-between gap-4">
                                <div>
                                    <h4 className="font-bold text-blue-400 text-sm">Reset API Usage Stats</h4>
                                    <p className="text-xs text-blue-400/70 mt-1">Clear the session and lifetime token counters. Does not affect data.</p>
                                </div>
                                <button onClick={onResetApiStats} className="px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all text-xs font-bold flex items-center gap-2 border border-blue-500/20 hover:border-blue-500 whitespace-nowrap">
                                    <RotateCcw className="w-3.5 h-3.5" /> Reset Stats
                                </button>
                            </div>
                        </div>

                        <div className="border-t border-[rgb(var(--color-border-secondary))]/50 pt-8">
                            <h3 className="text-xl font-bold text-[rgb(var(--color-text-primary))] mb-2 flex items-center gap-2">
                                <ShieldAlert className="w-5 h-5 text-red-400" /> 
                                Danger Zone
                            </h3>
                            <p className="text-sm text-[rgb(var(--color-text-muted))] mb-4">
                                Destructive actions that affect your entire database. Proceed with caution.
                            </p>
                            
                            <div className="bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden divide-y divide-red-500/10">
                                <div className="p-5 flex items-center justify-between gap-4">
                                    <div>
                                        <h4 className="font-bold text-red-400 text-sm">Clear All Data</h4>
                                        <p className="text-xs text-red-400/70 mt-1">Permanently delete all courses, topics, and questions. This cannot be undone.</p>
                                    </div>
                                    <button onClick={onClearAll} className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs font-bold flex items-center gap-2 border border-red-500/20 hover:border-red-500 whitespace-nowrap">
                                        <Trash2 className="w-3.5 h-3.5" /> Clear Everything
                                    </button>
                                </div>
                                
                                <div className="p-5 flex items-center justify-between gap-4">
                                    <div>
                                        <h4 className="font-bold text-orange-400 text-sm">Reset to Defaults</h4>
                                        <p className="text-xs text-orange-400/70 mt-1">Wipe current data and restore the original sample courses.</p>
                                    </div>
                                    <button onClick={onResetToDefault} className="px-4 py-2 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500 hover:text-white transition-all text-xs font-bold flex items-center gap-2 border border-orange-500/20 hover:border-orange-500 whitespace-nowrap">
                                        <RotateCcw className="w-3.5 h-3.5" /> Factory Reset
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'import' && (
                <div className="h-full flex flex-col animate-fade-in">
                    <ImportFlow 
                        existingCourses={courses} 
                        onImport={onImportCourses} 
                        onImportTopic={onImportTopic}
                        onClose={onClose} 
                    />
                </div>
            )}

            {activeTab === 'export' && (
                <div className="h-full flex flex-col animate-fade-in">
                    <ExportFlow 
                        courses={courses} 
                        onClose={onClose} 
                        showToast={showToast} 
                    />
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default DataManagerModal;
