
import React, { useState, useRef, useEffect, useMemo } from 'react';
import PromptSelector from './PromptSelector';
import Workspace from './Workspace';
import Toast from './Toast';
import ApiHealthIndicator from './ApiHealthIndicator';
import ApiMonitorDisplay from './ApiMonitorDisplay';
import ApiStatusIndicator from './ApiStatusIndicator';
import BackgroundTaskIndicator from './BackgroundTaskIndicator';
import GlobalLoadingOverlay from './GlobalLoadingOverlay';
import AppModals from './AppModals';
import LoginPage from './LoginPage';
import ContentAuditModal from './admin/ContentAuditModal';
import { useNavigation } from '../hooks/useNavigation';
import { useSyllabusData } from '../hooks/useSyllabusData';
import { useGemini } from '../hooks/useGemini';
import { useModalManager } from '../hooks/useModalManager';
import { useToast } from '../hooks/useToast';
import { useDebounce } from '../hooks/useDebounce';
import { useApiStatus } from '../hooks/useApiStatus';
import { authService } from '../services/authService';
import { User } from '../types';
import { Compass, Sparkles, Database, Layers, Sun, Moon, HardDrive, Activity } from 'lucide-react';
import { apiMonitor, ApiStatus } from '../services/geminiService';
import CommandVerbHierarchy from './CommandVerbHierarchy';
import { loadUserProfile } from '../utils/storageUtils';

const AnimatedBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
      `}</style>
      <div className="absolute inset-0 bg-[rgb(var(--color-bg-base))]" />
      <div className="absolute inset-0 light:hidden">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-[80px] opacity-30" style={{ animation: 'blob 10s infinite ease-in-out' }} />
        <div className="absolute top-0 -right-4 w-96 h-96 bg-indigo-500 rounded-full mix-blend-screen filter blur-[80px] opacity-30" style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '2s' }} />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-[80px] opacity-30" style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '4s' }} />
        <div className="absolute -bottom-40 -right-20 w-80 h-80 bg-pink-600 rounded-full mix-blend-screen filter blur-[80px] opacity-20" style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '6s' }} />
      </div>
      <div className="absolute inset-0 hidden light:block">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-[60px] opacity-60" style={{ animation: 'blob 10s infinite ease-in-out' }} />
        <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-[60px] opacity-60" style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '2s' }} />
        <div className="absolute -bottom-32 left-20 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-[60px] opacity-60" style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '4s' }} />
      </div>
      <div className="absolute inset-0 opacity-[0.03] light:opacity-[0.02] mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }} />
    </div>
  );
};

const MeshOverlay = ({ opacity = "opacity-[0.03]" }: { opacity?: string }) => (
  <div 
      className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")` }}
  />
);

interface AuthenticatedAppProps {
  user: User;
  onUpdateUser: (user: User) => void;
  handleLogout: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  apiStatus: ApiStatus;
}

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({ user, onUpdateUser, handleLogout, showToast, apiStatus }) => {
  const {
    courses, updateCourses, storageStatus, discoveredDocs, isReady, isDiscoveryInProgress,
    importDiscoveredDocs, handleCreateCourse, handleCreateTopic, handleCreateSubTopic,
    handleAddDotPoints, handleGeneratePrompt, confirmRename, confirmDelete,
    handleUpdateOutcomes, handleSampleAnswerGenerated, handleUpdateSampleAnswer,
    handleDeleteSampleAnswer, handleImportCourses, handleImportTopic,
    handleClearAllData, handleResetToDefault, handlePublishToLibrary,
    handleImportFromLibrary, handleDeleteFromLibrary, handleMoveTopic
  } = useSyllabusData({ showToast });

  const { statePath, setStatePath, handlePathChange, currentCourse, currentTopic, currentSubTopic, currentDotPoint, currentPrompt } = useNavigation(courses);
  const currentSelection = { currentCourse, currentTopic, currentSubTopic, currentDotPoint, currentPrompt };
  
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const { 
    activeModals, modalProps, openModal, closeModal, isModalOpen, 
    requestRename, confirmRename: onConfirmRename, cancelRename,
    requestDelete, confirmDelete: onConfirmDelete, cancelDelete,
    showConfirmation, handleConfirmAction, cancelConfirmation, showQualityCheck 
  } = useModalManager({
    onRename: confirmRename,
    onDelete: (target) => {
        const newPath = confirmDelete(statePath, target);
        setStatePath(newPath);
    }
  });

  useEffect(() => {
      if (isReady && !isDiscoveryInProgress && courses.length === 0 && discoveredDocs.length > 0) {
          openModal('manifestImport');
      }
  }, [isReady, isDiscoveryInProgress, courses.length, discoveredDocs.length, openModal]);

  const {
    evaluationResult, setEvaluationResult, isEvaluating, evaluationError, evaluate,
    isEnriching, enrichError, setEnrichError, isImproving, improveAnswerError,
    improveAnswer, improvedAnswer, setImprovedAnswer, originalAnswerForImprovement,
    setOriginalAnswerForImprovement, activeBackgroundTask, handleGenerateScenario,
    isGeneratingScenario, generateScenarioError, handleRegenerateKeywords,
    isRegeneratingKeywords, regenerateKeywordsError, handleSuggestKeywords,
    isSuggestingKeywords, suggestKeywordsError, suggestOutcomesForPrompt, 
    generateDotPointsForSubTopic, handleStartFullSyllabusImport, resetEvaluation, 
    handleFeedbackSubmit 
  } = useGemini({ showToast, updateCourses, statePath, currentPrompt, currentCourse, onApiKeyInvalid: () => showToast("API key mismatch detected.", "error"), user, onUpdateUser });

  const globalLoadingMessage = useMemo(() => {
      if (isEvaluating) return "Synthesising feedback...";
      if (isImproving) return "Drafting upgrade path...";
      if (isEnriching) return "Indexing context...";
      if (isGeneratingScenario) return "Modelling environment...";
      if (isRegeneratingKeywords) return "Analysing syllabus keywords...";
      if (isSuggestingKeywords) return "Discovering terminology...";
      return null;
  }, [isEvaluating, isImproving, isEnriching, isGeneratingScenario, isRegeneratingKeywords, isSuggestingKeywords]);

  const quotaError = useMemo(() => {
      const errors = [evaluationError, enrichError, improveAnswerError, generateScenarioError, regenerateKeywordsError, suggestKeywordsError];
      return errors.find(e => e && e.includes("Usage Limit Reached")) || null;
  }, [evaluationError, enrichError, improveAnswerError, generateScenarioError, regenerateKeywordsError, suggestKeywordsError]);

  const [userAnswer, setUserAnswer] = useState('');
  const debouncedUserAnswer = useDebounce(userAnswer, 1000);
  const editorRef = useRef<{ getText: () => string; setText: (text: string) => void; insertText: (text: string) => void }>(null);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  const handleEvaluate = () => {
    if (currentPrompt && userAnswer.trim()) {
      evaluate(userAnswer, currentPrompt);
    }
  };

  useEffect(() => {
    const isLight = user.preferences.theme === 'light';
    const html = document.documentElement;
    
    if (isLight) {
        html.setAttribute('data-theme', 'light');
        html.classList.remove('dark');
    } else {
        html.removeAttribute('data-theme');
        html.classList.add('dark');
    }
  }, [user.preferences.theme]);

  const modalHandlers = { 
    isModalOpen, openModal, closeModal, showConfirmation, requestRename, requestDelete, 
    confirmRename: onConfirmRename, cancelRename, confirmDelete: onConfirmDelete, cancelDelete,
    handleConfirmAction, cancelConfirmation, showQualityCheck 
  };
  const syllabusHandlers = { 
    handleCreateCourse, handleCreateTopic, handleCreateSubTopic, handleAddDotPoints, handleGeneratePrompt, 
    confirmRename, confirmDelete, handleUpdateOutcomes, handleSampleAnswerGenerated, handleUpdateSampleAnswer, 
    handleDeleteSampleAnswer, handleImportCourses, handleImportTopic, handleClearAllData, handleResetToDefault, 
    updateCourses, discoveredDocs, importDiscoveredDocs, handleMoveTopic, 
    onResetApiStats: () => apiMonitor.resetAll() 
  };
  const geminiHandlers = { evaluationResult, setEvaluationResult, handleGenerateScenario, handleRegenerateKeywords, handleSuggestKeywords, suggestOutcomesForPrompt, improveAnswer, improvedAnswer, setImprovedAnswer, originalAnswerForImprovement, setOriginalAnswerForImprovement, isGeneratingScenario, generateScenarioError, isRegeneratingKeywords, regenerateKeywordsError, isSuggestingKeywords, suggestKeywordsError, generateDotPointsForSubTopic, handleStartFullSyllabusImport, resetEvaluation, handleFeedbackSubmit, setEnrichError };

  return (
    <div className={`relative max-w-[1600px] mx-auto ${isFocusMode ? 'p-2 sm:p-4' : 'p-4 sm:p-6 lg:p-8'} flex flex-col gap-6 transition-all duration-500`}>
      {!isFocusMode && (
        <header className="sticky top-0 z-[60] -mx-4 sm:-mx-6 lg:-mx-8 h-20 flex items-center shadow-2xl shadow-indigo-900/20">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-sky-500 opacity-100" />
            <div className="relative z-10 px-8 w-full flex items-center justify-between">
               <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl group transition-all">
                         <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tighter leading-none italic uppercase">Studio</h1>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50 block mt-1">Specialist AI</span>
                    </div>
               </div>
               <div className="flex items-center gap-4">
                   {user.role === 'admin' && (
                       <div className="flex items-center gap-2 mr-2">
                           <button 
                               onClick={() => openModal('dataManager')}
                               className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                               title="Data Vault (Import/Export/Reorder)"
                           >
                               <Database className="w-4 h-4" />
                           </button>
                           <button 
                               onClick={() => setIsAuditModalOpen(true)}
                               className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                               title="Syllabus Audit Studio"
                           >
                               <Activity className="w-4 h-4" />
                           </button>
                           <button 
                               onClick={() => openModal('databaseDashboard')}
                               className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-lg border border-white/10"
                               title="Internal Database Health"
                           >
                               <HardDrive className="w-4 h-4" />
                           </button>
                       </div>
                   )}
                   <div className="hidden lg:flex items-center gap-6 px-5 py-2 rounded-2xl bg-black/20 backdrop-blur-md border border-white/10">
                        <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${apiStatus.state === 'HEALTHY' ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                             <span className="text-[10px] font-black uppercase tracking-wider text-white/80">API {apiStatus.state}</span>
                        </div>
                        <div className="w-px h-4 bg-white/10" />
                        <div className="flex items-center gap-2">
                             <Database className="w-4 h-4 text-sky-400" />
                             <span className="text-[10px] font-black uppercase tracking-wider text-white/80">{storageStatus} Active</span>
                        </div>
                   </div>
                   <button onClick={() => { const next = user.preferences.theme === 'light' ? 'dark' : 'light'; onUpdateUser({ ...user, preferences: { ...user.preferences, theme: next as any } }); authService.updateUser({ ...user, preferences: { ...user.preferences, theme: next as any } }); }} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all">
                       {user.preferences.theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                   </button>
                   <button onClick={() => openModal('userProfile')} className="flex items-center gap-3 pl-3 pr-1.5 h-11 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all">
                        <span className="text-xs font-bold text-white hidden sm:block">{user.displayName}</span>
                        <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-black text-xs shadow-lg">{user.displayName.charAt(0)}</div>
                   </button>
               </div>
           </div>
        </header>
      )}

      {!isFocusMode && (
        <div className="relative z-50">
            <PromptSelector 
                courses={courses} 
                statePath={statePath} 
                onPathChange={handlePathChange} 
                onAddCourse={() => openModal('courseCreator')} 
                onAddTopic={() => openModal('topicCreator')} 
                onAddSubTopic={() => openModal('subTopicCreator')} 
                onGeneratePrompt={() => openModal('promptGenerator')}
                onManualEntry={() => openModal('manualPrompt')}
                onEditOutcomes={() => openModal('outcomesEditor')} 
                onOpenDataManager={() => openModal('dataManager')}
                onRenameItem={requestRename} 
                onDeleteItem={requestDelete} 
                onAddTopicFromSyllabus={() => openModal('topicSyllabusImport')} 
                onGenerateSuggestedTopic={() => openModal('topicGenerator')} 
                onGenerateDotPoints={() => openModal('dotPointGenerator')} 
                onImportTopic={() => openModal('topicImport')} 
                newlyAddedIds={newlyAddedIds} 
                userRole={user.role} 
            />
        </div>
      )}

      {!isFocusMode && (
          <div className="mb-4">
              <CommandVerbHierarchy currentVerb={currentPrompt?.verb} />
          </div>
      )}

      {currentPrompt ? (
        <Workspace courses={courses} statePath={statePath} currentSelection={currentSelection} editorRef={editorRef} userAnswer={userAnswer} debouncedUserAnswer={debouncedUserAnswer} setUserAnswer={setUserAnswer} evaluationResult={evaluationResult} isEvaluating={isEvaluating} evaluationError={evaluationError} isEnriching={isEnriching} enrichError={enrichError} isImproving={isImproving} improveAnswerError={improveAnswerError} evaluatedAnswer={userAnswer} handleEvaluate={handleEvaluate} geminiHandlers={geminiHandlers} modalHandlers={modalHandlers} syllabusHandlers={syllabusHandlers} userRole={user.role} isFocusMode={isFocusMode} onToggleFocusMode={() => setIsFocusMode(!isFocusMode)} />
      ) : (
        <div className="min-h-[50vh] flex flex-col items-center justify-center animate-fade-in">
            <div className="text-center p-12 rounded-[48px] bg-[rgb(var(--color-bg-surface))]/40 light:bg-white border border-white/5 light:border-slate-300 relative group overflow-hidden">
                <MeshOverlay opacity="opacity-[0.05]" />
                <Compass className="w-20 h-20 text-indigo-500 mx-auto mb-8 opacity-40 group-hover:rotate-45 transition-transform duration-700" />
                <h3 className="text-3xl font-black text-white light:text-slate-900 mb-4 tracking-tighter uppercase italic">Session Idle</h3>
                <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-500 max-w-sm mx-auto font-medium">Select a module from the navigator to begin cognitive evaluation.</p>
                {courses.length === 0 && (
                    <button 
                        onClick={() => openModal('manifestImport')}
                        className="mt-10 px-8 py-3 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 mx-auto"
                    >
                        <Sparkles className="w-4 h-4" /> Load Curriculum Library
                    </button>
                )}
            </div>
        </div>
      )}

      <AppModals activeModals={activeModals} modalProps={modalProps} modalHandlers={modalHandlers} syllabusHandlers={syllabusHandlers} geminiHandlers={geminiHandlers} currentSelection={currentSelection} statePath={statePath} courses={courses} setStatePath={setStatePath} showToast={showToast} setNewlyAddedIds={setNewlyAddedIds} user={user} onUpdateUser={onUpdateUser} onLogout={handleLogout} />
      <GlobalLoadingOverlay message={globalLoadingMessage} error={quotaError} />
      <BackgroundTaskIndicator task={activeBackgroundTask} />
      {user.role === 'admin' && <ApiMonitorDisplay />}
      {isAuditModalOpen && <ContentAuditModal isOpen={isAuditModalOpen} onClose={() => setIsAuditModalOpen(false)} courses={courses} updateCourses={updateCourses} showToast={showToast} />}
    </div>
  );
};

const App: React.FC = () => {
  const { toast, showToast, hideToast } = useToast();
  const apiStatus = useApiStatus();
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  useEffect(() => {
    const storedUser = authService.getCurrentUser();
    if (storedUser) {
        loadUserProfile(storedUser.username).then(fullProfile => {
            authService.refreshSession(fullProfile || storedUser).then(refreshedUser => {
                setUser(refreshedUser);
                setIsLoadingAuth(false);
            });
        });
    } else setIsLoadingAuth(false);
  }, []);

  if (isLoadingAuth) return null;

  return (
    <div className="min-h-screen relative z-10 selection:bg-indigo-500/30 selection:text-white">
      <AnimatedBackground />
      {!user ? (
        <LoginPage onLogin={(u) => { setUser(u); showToast(`Auth session active: ${u.displayName}`, 'success'); }} />
      ) : (
        <AuthenticatedApp user={user} onUpdateUser={setUser} handleLogout={() => { authService.logout(); setUser(null); }} showToast={showToast} apiStatus={apiStatus} />
      )}
      {toast && <div className="fixed top-24 right-4 z-[1000] animate-slide-in"><Toast message={toast.message} type={toast.type} onClose={hideToast} /></div>}
      <ApiStatusIndicator />
      <ApiHealthIndicator />
    </div>
  );
};

export default App;
