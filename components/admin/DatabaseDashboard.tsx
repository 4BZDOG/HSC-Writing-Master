
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Database, HardDrive, RefreshCw, CheckCircle, AlertTriangle, 
  Trash2, Archive, Server, Eye, Copy, ArrowLeft, History, 
  Download, RotateCcw, Calendar, FileJson, Search, UploadCloud, 
  BookOpen, Layers 
} from 'lucide-react';
import { 
  getDatabaseStats, clearStore, DBStats, saveCoursesToDB, 
  getStoreData, getBackupsList, restoreBackup, deleteBackup, 
  createBackup, importDataFromJSON
} from '../../utils/storageUtils';
import { Course } from '../../types';
import LoadingIndicator from '../LoadingIndicator';

interface DatabaseDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type DashboardView = 'overview' | 'snapshots' | 'inspector';

// Helper to render the preview of a snapshot
const SnapshotPreview: React.FC<{ data: Course[] | null }> = ({ data }) => {
    if (!data) return null;
    return (
        <div className="mt-3 p-4 bg-[rgb(var(--color-bg-surface-inset))] rounded-xl border border-[rgb(var(--color-border-secondary))] animate-fade-in">
            <h4 className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-3 flex items-center gap-2">
                <Eye className="w-3 h-3" /> Snapshot Contents Preview
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                {data.map(course => (
                    <div key={course.id} className="bg-[rgb(var(--color-bg-surface))] p-3 rounded-lg border border-[rgb(var(--color-border-secondary))]/50">
                        <div className="flex items-center gap-2 mb-1">
                            <BookOpen className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                            <span className="font-bold text-sm text-[rgb(var(--color-text-primary))]">{course.name}</span>
                        </div>
                        <div className="pl-6">
                             {course.topics.map(topic => (
                                 <div key={topic.id} className="flex items-center gap-2 text-xs text-[rgb(var(--color-text-secondary))] py-0.5">
                                     <Layers className="w-3 h-3 opacity-50" />
                                     <span>{topic.name}</span>
                                     <span className="opacity-50">({topic.subTopics.length} sub-topics)</span>
                                 </div>
                             ))}
                             {course.topics.length === 0 && <span className="text-xs text-[rgb(var(--color-text-dim))] italic">No topics</span>}
                        </div>
                    </div>
                ))}
                {data.length === 0 && <p className="text-sm text-[rgb(var(--color-text-muted))] italic">Empty database snapshot.</p>}
            </div>
        </div>
    );
};

const DatabaseDashboard: React.FC<DatabaseDashboardProps> = ({ isOpen, onClose, courses, showToast }) => {
  const [view, setView] = useState<DashboardView>('overview');
  const [stats, setStats] = useState<DBStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Snapshots State
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [previewData, setPreviewData] = useState<Course[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inspector State
  const [inspectStoreName, setInspectStoreName] = useState<string | null>(null);
  const [inspectData, setInspectData] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Data Fetching ---

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const data = await getDatabaseStats();
      setStats(data);
    } catch (e) {
      console.error(e);
      showToast("Failed to fetch database statistics.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBackups = async () => {
      setIsLoadingBackups(true);
      try {
          const list = await getBackupsList();
          setBackups(list);
      } catch (e) {
          showToast("Failed to load backups.", 'error');
      } finally {
          setIsLoadingBackups(false);
      }
  };

  // --- Effects ---

  useEffect(() => {
    if (isOpen) {
        if (view === 'overview') fetchStats();
        if (view === 'snapshots') fetchBackups();
    }
  }, [isOpen, view]);

  // --- Handlers: Overview ---

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await saveCoursesToDB(courses);
      await fetchStats(); 
      showToast("Database synced successfully.", 'success');
    } catch (e) {
      showToast("Failed to sync database.", 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearStore = async (storeName: string) => {
    if (window.confirm(`Are you sure you want to clear the '${storeName}' store? This action cannot be undone.`)) {
      try {
        await clearStore(storeName);
        await fetchStats();
        showToast(`Store '${storeName}' cleared.`, 'success');
      } catch (e) {
        showToast(`Failed to clear store '${storeName}'.`, 'error');
      }
    }
  };

  // --- Handlers: Snapshots ---

  const handlePreviewBackup = async (key: string) => {
      if (previewId === key) {
          setPreviewId(null);
          setPreviewData(null);
          return;
      }

      setIsLoadingBackups(true);
      try {
          const data = await restoreBackup(key);
          if (data) {
              setPreviewData(data);
              setPreviewId(key);
          }
      } catch (e) {
          showToast("Failed to load preview.", "error");
      } finally {
          setIsLoadingBackups(false);
      }
  };

  const handleRestoreBackup = async (key: string, date: string) => {
      if (window.confirm(`WARNING: Restoring this backup from ${date} will OVERWRITE all current data. This cannot be undone. Are you sure?`)) {
          setIsLoading(true);
          try {
              const data = await restoreBackup(key);
              if (data) {
                  await saveCoursesToDB(data);
                  showToast("Backup restored. Reloading application...", "success");
                  setTimeout(() => window.location.reload(), 1500);
              } else {
                  showToast("Failed to load backup data.", "error");
                  setIsLoading(false);
              }
          } catch (e) {
              showToast("Error during restoration.", "error");
              setIsLoading(false);
          }
      }
  };

  const handleDeleteBackup = async (key: string) => {
      if (window.confirm("Delete this snapshot?")) {
          try {
              await deleteBackup(key);
              await fetchBackups();
              if (previewId === key) {
                  setPreviewId(null);
                  setPreviewData(null);
              }
              showToast("Snapshot deleted.", "success");
          } catch (e) {
              showToast("Failed to delete snapshot.", "error");
          }
      }
  };

  const handleDownloadBackup = async (key: string, date: string) => {
      try {
          const data = await restoreBackup(key);
          if (data) {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `hsc_backup_${date}.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
              showToast("Backup downloaded.", "success");
          }
      } catch (e) {
          showToast("Failed to prepare download.", "error");
      }
  };

  const handleUploadSnapshot = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const json = event.target?.result as string;
              const courses = importDataFromJSON(json);
              // Create a new backup with this data
              await createBackup(courses);
              await fetchBackups();
              showToast("Snapshot imported successfully.", "success");
          } catch (err) {
              showToast("Failed to import snapshot: Invalid file.", "error");
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  // --- Handlers: Inspector ---
  
  const handleInspectStore = async (storeName: string) => {
      setInspectStoreName(storeName);
      setView('inspector');
      setIsLoadingData(true);
      setSearchQuery('');
      try {
          const data = await getStoreData(storeName);
          setInspectData(data);
      } catch (e) {
          setInspectData([]);
          showToast(`Failed to load data for '${storeName}'`, 'error');
      } finally {
          setIsLoadingData(false);
      }
  };
  
  const handleCopyData = () => {
      navigator.clipboard.writeText(JSON.stringify(inspectData, null, 2));
      showToast("Data copied to clipboard.", 'success');
  };

  const handleBackToStats = () => {
      setView('overview');
  };

  // --- Derived State ---
  
  const filteredInspectData = useMemo(() => {
      if (!searchQuery) return JSON.stringify(inspectData, null, 2);
      
      // Simple filter: Check if the item stringified contains the search query
      if (Array.isArray(inspectData)) {
          const filtered = inspectData.filter(item => 
              JSON.stringify(item).toLowerCase().includes(searchQuery.toLowerCase())
          );
          return JSON.stringify(filtered, null, 2);
      }
      return JSON.stringify(inspectData, null, 2);
  }, [inspectData, searchQuery]);

  // --- Render Helpers ---

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg flex items-center justify-center">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">System Database</h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">Storage Management & Recovery</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group">
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900" />
            </button>
          </div>
        </div>

        {/* Layout */}
        <div className="flex flex-1 overflow-hidden">
            
            {/* Sidebar Navigation */}
            <div className="w-64 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border-r border-[rgb(var(--color-border-secondary))] light:border-slate-200 p-4 flex flex-col gap-2 flex-shrink-0">
                <button 
                    onClick={() => setView('overview')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${view === 'overview' ? 'bg-blue-500/10 light:bg-blue-100 text-blue-400 light:text-blue-700' : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200'}`}
                >
                    <Server className="w-4 h-4" /> Overview
                </button>
                <button 
                    onClick={() => setView('snapshots')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${view === 'snapshots' ? 'bg-purple-500/10 light:bg-purple-100 text-purple-400 light:text-purple-700' : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200'}`}
                >
                    <History className="w-4 h-4" /> Time Machine
                </button>
                <button 
                    onClick={() => { setInspectStoreName('main_store'); handleInspectStore('main_store'); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${view === 'inspector' ? 'bg-amber-500/10 light:bg-amber-100 text-amber-400 light:text-amber-700' : 'text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200'}`}
                >
                    <FileJson className="w-4 h-4" /> Data Inspector
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-8 bg-[rgb(var(--color-bg-surface))]/50 light:bg-white relative">
                
                {view === 'overview' && (
                    <>
                        {isLoading && !stats ? (
                            <div className="h-full flex items-center justify-center">
                                <LoadingIndicator messages={['Querying IndexedDB...', 'Calculating Quotas...']} duration={3} band={3} />
                            </div>
                        ) : stats ? (
                            <div className="space-y-8 animate-fade-in">
                                {/* Status Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className={`p-5 rounded-xl border ${stats.isConnected ? 'border-emerald-500/30 bg-emerald-500/10 light:bg-emerald-50 light:border-emerald-200' : 'border-red-500/30 bg-red-500/10 light:bg-red-50'} flex flex-col`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            {stats.isConnected ? <CheckCircle className="w-5 h-5 text-emerald-400 light:text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
                                            <span className={`text-sm font-bold ${stats.isConnected ? 'text-emerald-400 light:text-emerald-700' : 'text-red-400'}`}>Connection</span>
                                        </div>
                                        <p className="text-2xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900">{stats.isConnected ? 'Active' : 'Offline'}</p>
                                        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1">IndexedDB v3</p>
                                    </div>

                                    <div className="p-5 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex flex-col">
                                        <div className="flex items-center gap-2 mb-2">
                                            <HardDrive className="w-5 h-5 text-blue-400 light:text-blue-600" />
                                            <span className="text-sm font-bold text-blue-400 light:text-blue-700">Storage</span>
                                        </div>
                                        <p className="text-2xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900">{stats.quota ? formatBytes(stats.quota.usage) : 'Unknown'}</p>
                                        {stats.quota && (
                                            <div className="w-full bg-gray-700 light:bg-slate-300 h-1.5 rounded-full mt-2 overflow-hidden">
                                                <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${Math.max(1, (stats.quota.usage / stats.quota.quota) * 100)}%` }}></div>
                                            </div>
                                        )}
                                        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1">of {stats.quota ? formatBytes(stats.quota.quota) : 'Unknown'} Available</p>
                                    </div>

                                    <div className="p-5 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex flex-col">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Server className="w-5 h-5 text-purple-400 light:text-purple-600" />
                                            <span className="text-sm font-bold text-purple-400 light:text-purple-700">Stores</span>
                                        </div>
                                        <p className="text-2xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900">{stats.stores.length}</p>
                                        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1">Object Stores</p>
                                    </div>
                                </div>

                                {/* Store List */}
                                <div>
                                    <h3 className="text-lg font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 mb-4 flex items-center gap-2">
                                        <Archive className="w-5 h-5 text-[rgb(var(--color-accent))]" /> Object Stores
                                    </h3>
                                    <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 uppercase text-xs font-bold">
                                                <tr>
                                                    <th className="px-6 py-3">Name</th>
                                                    <th className="px-6 py-3">Items</th>
                                                    <th className="px-6 py-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[rgb(var(--color-border-secondary))]/30 light:divide-slate-200">
                                                {stats.stores.map((store) => (
                                                    <tr key={store.name} className="hover:bg-[rgb(var(--color-bg-surface-light))]/20 light:hover:bg-slate-100 transition-colors">
                                                        <td className="px-6 py-4 font-mono text-[rgb(var(--color-text-primary))] light:text-slate-800">{store.name}</td>
                                                        <td className="px-6 py-4 text-[rgb(var(--color-text-secondary))] light:text-slate-600">{store.count}</td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button 
                                                                    onClick={() => handleInspectStore(store.name)}
                                                                    className="text-blue-400 light:text-blue-600 hover:bg-blue-500/10 light:hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                                                                >
                                                                    <Eye className="w-3.5 h-3.5" /> Inspect
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleClearStore(store.name)}
                                                                    className="text-red-400 light:text-red-600 hover:bg-red-500/10 light:hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" /> Purge
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-red-400 p-8">Database connection failed.</div>
                        )}
                    </>
                )}

                {view === 'snapshots' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex items-center justify-between">
                             <div>
                                <h3 className="text-lg font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 flex items-center gap-2">
                                    <History className="w-5 h-5 text-purple-400" /> Available Snapshots
                                </h3>
                                <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                                    Backups are created automatically every hour during activity.
                                </p>
                             </div>
                             
                             <div className="flex gap-2">
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    className="hidden" 
                                    accept=".json"
                                    onChange={handleUploadSnapshot}
                                />
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 transition-all text-xs font-bold"
                                >
                                    <UploadCloud className="w-4 h-4" /> Upload Snapshot
                                </button>
                             </div>
                        </div>

                        {isLoadingBackups ? (
                             <div className="h-32 flex items-center justify-center">
                                <LoadingIndicator messages={['Scanning timeline...', 'Retrieving snapshots...']} duration={2} band={3} />
                            </div>
                        ) : backups.length === 0 ? (
                            <div className="text-center py-12 bg-[rgb(var(--color-bg-surface-inset))]/20 light:bg-slate-50 rounded-xl border border-dashed border-[rgb(var(--color-border-secondary))] light:border-slate-300">
                                <History className="w-12 h-12 text-[rgb(var(--color-text-muted))] light:text-slate-300 mx-auto mb-3" />
                                <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">No snapshots found.</p>
                                <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">Snapshots will appear here as you work.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {backups.map((backup) => (
                                    <div key={backup.key}>
                                        <div className="flex items-center justify-between p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 hover:border-[rgb(var(--color-accent))] light:hover:border-blue-400 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-purple-500/10 light:bg-purple-100 flex items-center justify-center text-purple-400 light:text-purple-700">
                                                    <Calendar className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">{backup.date}</p>
                                                    <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 font-mono">
                                                        {backup.courseCount} Courses • {formatBytes(backup.size)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                                 <button 
                                                    onClick={() => handlePreviewBackup(backup.key)}
                                                    className={`p-2 rounded-lg transition-colors ${previewId === backup.key ? 'bg-[rgb(var(--color-accent))]/20 text-[rgb(var(--color-accent))]' : 'hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-200 text-[rgb(var(--color-text-secondary))]'}`}
                                                    title="Preview contents"
                                                 >
                                                     <Eye className="w-4 h-4" />
                                                 </button>
                                                 <button 
                                                    onClick={() => handleDownloadBackup(backup.key, backup.date)}
                                                    className="p-2 rounded-lg hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-200 text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:text-[rgb(var(--color-accent))] light:hover:text-blue-600 transition-colors"
                                                    title="Download JSON"
                                                 >
                                                     <Download className="w-4 h-4" />
                                                 </button>
                                                 <button 
                                                    onClick={() => handleRestoreBackup(backup.key, backup.date)}
                                                    className="p-2 rounded-lg hover:bg-blue-500/10 light:hover:bg-blue-100 text-blue-400 light:text-blue-600 transition-colors"
                                                    title="Restore this version"
                                                 >
                                                     <RotateCcw className="w-4 h-4" />
                                                 </button>
                                                 <div className="w-px h-4 bg-[rgb(var(--color-border-secondary))] light:bg-slate-300 mx-1"></div>
                                                 <button 
                                                    onClick={() => handleDeleteBackup(backup.key)}
                                                    className="p-2 rounded-lg hover:bg-red-500/10 light:hover:bg-red-100 text-red-400 light:text-red-600 transition-colors"
                                                    title="Delete snapshot"
                                                 >
                                                     <Trash2 className="w-4 h-4" />
                                                 </button>
                                            </div>
                                        </div>
                                        {previewId === backup.key && (
                                            <SnapshotPreview data={previewData} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {view === 'inspector' && (
                    <div className="flex flex-col h-full animate-fade-in">
                        <div className="flex items-center justify-between mb-4 gap-4">
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={handleBackToStats}
                                    className="p-1.5 rounded-lg hover:bg-[rgb(var(--color-bg-surface-inset))] light:hover:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-500 transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                                <div>
                                    <h3 className="text-lg font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 font-mono tracking-tight">{inspectStoreName}</h3>
                                    <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">Raw Data View</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 flex-1 justify-end">
                                <div className="relative max-w-xs w-full">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                                    <input 
                                        type="text"
                                        placeholder="Search raw data..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] text-sm focus:border-[rgb(var(--color-accent))]"
                                    />
                                </div>
                                <button 
                                    onClick={handleCopyData}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 transition-colors flex-shrink-0"
                                >
                                    <Copy className="w-3.5 h-3.5" /> Copy JSON
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 bg-[#0d1117] light:bg-slate-50 p-4 overflow-auto custom-scrollbar relative shadow-inner">
                            {isLoadingData ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <LoadingIndicator messages={['Fetching records...', 'Formatting JSON...']} duration={1} />
                                </div>
                            ) : (
                                <pre className="text-xs font-mono text-gray-300 light:text-slate-800 whitespace-pre-wrap break-all leading-relaxed">
                                    {filteredInspectData || "No data found matching query."}
                                </pre>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-between items-center">
            <div className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-500">
                Local Database: {isLoading ? 'Busy...' : 'Ready'}
            </div>
            <div className="flex gap-3">
                {view === 'overview' && (
                    <button 
                        onClick={handleForceSync} 
                        disabled={isSyncing}
                        className={`px-4 py-2 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 transition flex items-center gap-2 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Force Sync'}
                    </button>
                )}
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-[rgb(var(--color-text-muted))] light:text-slate-600 hover:text-white light:hover:text-slate-900 transition hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200">
                    Close
                </button>
            </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default DatabaseDashboard;
