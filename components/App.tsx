
// ... (keeping previous imports)
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
import { Compass, Sparkles, ArrowUp, Database, Layers, Sun, Moon, HardDrive } from 'lucide-react';
import { apiMonitor, ApiStatus } from '../services/geminiService';
import CommandVerbHierarchy from './CommandVerbHierarchy';
import { loadUserProfile } from '../utils/storageUtils';

// ... (keeping AnimatedBackground component unchanged)
const AnimatedBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Embedded Styles to Guarantee Animation Definition */}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
      `}</style>

      {/* Base Layer */}
      <div className="absolute inset-0 bg-[rgb(var(--color-bg-base))]" />

      {/* Animated Nebula Blobs - Dark Mode (Screen Blend for Glow) */}
      <div className="absolute inset-0 light:hidden">
        <div 
            className="absolute top-0 -left-4 w-96 h-96 bg-purple-500 rounded-full mix-blend-screen filter blur-[80px] opacity-30"
            style={{ animation: 'blob 10s infinite ease-in-out' }}
        />
        <div 
            className="absolute top-0 -right-4 w-96 h-96 bg-indigo-500 rounded-full mix-blend-screen filter blur-[80px] opacity-30"
            style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '2s' }}
        />
        <div 
            className="absolute -bottom-32 -left-20 w-96 h-96 bg-blue-600 rounded-full mix-blend-screen filter blur-[80px] opacity-30"
            style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '4s' }}
        />
        <div 
            className="absolute -bottom-40 -right-20 w-80 h-80 bg-pink-600 rounded-full mix-blend-screen filter blur-[80px] opacity-20"
            style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '6s' }}
        />
      </div>

      {/* Animated Nebula Blobs - Light Mode (Multiply Blend for Watercolor) */}
      <div className="absolute inset-0 hidden light:block">
        <div 
            className="absolute top-0 -left-4 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-[60px] opacity-60"
            style={{ animation: 'blob 10s infinite ease-in-out' }}
        />
        <div 
            className="absolute top-0 -right-4 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-[60px] opacity-60"
            style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '2s' }}
        />
        <div 
            className="absolute -bottom-32 left-20 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-[60px] opacity-60"
            style={{ animation: 'blob 10s infinite ease-in-out', animationDelay: '4s' }}
        />
      </div>

      {/* Noise Texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] light:opacity-[0.02] mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }} 
      />
    </div>
  );
};

// --- AuthenticatedApp Component ---
interface AuthenticatedAppProps {
  user: User;
  onUpdateUser: (user: User) => void;
  handleLogout: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  apiStatus: ApiStatus;
}

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({ user, onUpdateUser, handleLogout, showToast, apiStatus }) => {
  const {
    courses,
    updateCourses,
    storageStatus,
    libraryItems,
    discoveredDocs,
    importDiscoveredDocs,
    handleCreateCourse,
    handleCreateTopic,
    handleCreateSubTopic,
    handleAddDotPoints,
    handleGeneratePrompt,
    confirmRename,
    confirmDelete,
    handleUpdateOutcomes,
    handleSampleAnswerGenerated,
    handleUpdateSampleAnswer,
    handleDeleteSampleAnswer,
    handleImportCourses,
    handleImportTopic,
    handleClearAllData,
    handleResetToDefault,
    handlePublishToLibrary,
    handleImportFromLibrary,
    handleDeleteFromLibrary
  } = useSyllabusData({ showToast });

  // Navigation
  const {
    statePath,
    setStatePath,
    handlePathChange,
    currentCourse,
    currentTopic,
    currentSubTopic,
    currentDotPoint,
    currentPrompt,
  } = useNavigation(courses);

  const currentSelection = { currentCourse, currentTopic, currentSubTopic, currentDotPoint, currentPrompt };
  
  // Focus Mode State
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Modal Manager
  const {
    activeModals,
    modalProps,
    openModal,
    closeModal,
    isModalOpen,
    requestRename,
    confirmRename: onConfirmRename,
    cancelRename,
    requestDelete,
    confirmDelete: onConfirmDelete,
    cancelDelete,
    showConfirmation,
    handleConfirmAction,
    cancelConfirmation,
    showQualityCheck
  } = useModalManager({
    onRename: confirmRename,
    onDelete: (target) => {
        const newPath = confirmDelete(statePath, target);
        setStatePath(newPath);
    }
  });

  // Auto-open Manifest Import if docs are discovered and DB is empty
  useEffect(() => {
      if (discoveredDocs.length > 0 && courses.length === 0) {
          openModal('manifestImport');
      }
  }, [discoveredDocs, courses.length, openModal]);

  // Gemini Integration
  const {
    evaluationResult,
    setEvaluationResult,
    isEvaluating,
    evaluationError,
    evaluate,
    isEnriching,
    enrichError,
    setEnrichError,
    isImproving,
    improveAnswerError,
    improveAnswer,
    improvedAnswer,
    setImprovedAnswer,
    originalAnswerForImprovement,
    setOriginalAnswerForImprovement,
    activeBackgroundTask,
    handleGenerateScenario,
    isGeneratingScenario,
    generateScenarioError,
    handleRegenerateKeywords,
    isRegeneratingKeywords,
    regenerateKeywordsError,
    handleSuggestKeywords,
    isSuggestingKeywords,
    suggestKeywordsError,
    generateDotPointsForSubTopic,
    handleStartFullSyllabusImport,
    resetEvaluation
  } = useGemini({
    showToast,
    updateCourses,
    statePath,
    currentPrompt,
    currentCourse,
    onApiKeyInvalid: () => showToast("API Key is invalid. Please check configuration.", "error"),
    user,
    onUpdateUser
  });

  // Determine if we need to show the global loading overlay
  const globalLoadingMessage = useMemo(() => {
      if (isEvaluating) return "Evaluating response...";
      if (isImproving) return "Drafting improved response...";
      if (isEnriching) return "Enriching question context...";
      if (isGeneratingScenario) return "Generating scenario...";
      if (isRegeneratingKeywords) return "Analyzing syllabus keywords...";
      if (isSuggestingKeywords) return "Discovering new keywords...";
      return null;
  }, [isEvaluating, isImproving, isEnriching, isGeneratingScenario, isRegeneratingKeywords, isSuggestingKeywords]);

  // Detect if we hit a quota limit to show specific error UI
  const quotaError = useMemo(() => {
      const errors = [
          evaluationError, 
          enrichError, 
          improveAnswerError, 
          generateScenarioError, 
          regenerateKeywordsError, 
          suggestKeywordsError
      ];
      return errors.find(e => e && e.includes("Usage Limit Reached")) || null;
  }, [evaluationError, enrichError, improveAnswerError, generateScenarioError, regenerateKeywordsError, suggestKeywordsError]);

  // User Input State
  const [userAnswer, setUserAnswer] = useState('');
  const debouncedUserAnswer = useDebounce(userAnswer, 1000);
  const editorRef = useRef<{ getText: () => string; setText: (text: string) => void; insertText: (text: string) => void }>(null);
  const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());

  const handleEvaluate = () => {
    if (currentPrompt && userAnswer.trim()) {
      evaluate(userAnswer, currentPrompt);
    }
  };

  // Theme Effect: Apply theme to document
  useEffect(() => {
    if (user.preferences.theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
  }, [user.preferences.theme]);

  const toggleTheme = () => {
      const newTheme: 'dark' | 'light' = user.preferences.theme === 'light' ? 'dark' : 'light';
      const updatedUser: User = {
          ...user,
          preferences: {
              ...user.preferences,
              theme: newTheme
          }
      };
      onUpdateUser(updatedUser);
      authService.updateUser(updatedUser);
  };

  // Consolidated handlers for child components
  const modalHandlers = {
    isModalOpen,
    openModal,
    closeModal,
    showConfirmation,
    cancelRename,
    confirmRename: onConfirmRename,
    cancelDelete,
    confirmDelete: onConfirmDelete,
    handleConfirmAction,
    cancelConfirmation,
    requestRename,
    requestDelete,
    showQualityCheck
  };

  const syllabusHandlers = {
    handleCreateCourse,
    handleCreateTopic,
    handleCreateSubTopic,
    handleAddDotPoints,
    handleGeneratePrompt,
    handleUpdateOutcomes,
    handleSampleAnswerGenerated,
    handleUpdateSampleAnswer,
    handleDeleteSampleAnswer,
    handleImportCourses,
    handleImportTopic,
    handleClearAllData,
    handleResetToDefault,
    updateCourses,
    onResetApiStats: () => { 
        apiMonitor.resetAll();
        showToast("API Usage stats reset.", "success");
    },
    confirmDelete,
    handlePublishToLibrary,
    handleImportFromLibrary,
    handleDeleteFromLibrary,
    discoveredDocs,
    importDiscoveredDocs
  };

  const geminiHandlers = {
    evaluationResult,
    setEvaluationResult,
    handleGenerateScenario,
    handleRegenerateKeywords,
    handleSuggestKeywords,
    improveAnswer,
    improvedAnswer,
    setImprovedAnswer,
    originalAnswerForImprovement,
    setOriginalAnswerForImprovement,
    isGeneratingScenario,
    generateScenarioError,
    isRegeneratingKeywords,
    regenerateKeywordsError,
    isSuggestingKeywords,
    suggestKeywordsError,
    generateDotPointsForSubTopic,
    handleStartFullSyllabusImport,
    setEnrichError,
    resetEvaluation
  };

  return (
    <div className={`relative max-w-[1600px] mx-auto ${isFocusMode ? 'p-2 sm:p-4' : 'p-4 sm:p-6 lg:p-8'} flex flex-col gap-6 transition-all duration-500`}>
      
      {!isFocusMode && (
        <header className="sticky top-0 z-[60] -mx-4 sm:-mx-6 lg:-mx-8 mb-6 transition-all duration-200 shadow-lg shadow-indigo-500/20 group/header h-20 flex items-center">
            <div className="absolute inset-0 bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] light:from-indigo-600 light:to-blue-500 opacity-100 shadow-md" />
            
            <div className="relative z-10 px-4 sm:px-6 lg:px-8 w-full flex items-center justify-between">
               <div className="flex items-center gap-4 group cursor-default select-none">
                  <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300">
                         <Sparkles className="w-5 h-5 text-white" />
                      </div>
                  </div>
                  <div className="flex flex-col justify-center h-10">
                      <h1 className="text-xl font-black tracking-tight text-white drop-shadow-sm leading-none light:text-white">
                         HSC AI Evaluator
                      </h1>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold tracking-widest text-white/90 uppercase bg-white/20 px-1.5 py-px rounded border border-white/30">Beta</span>
                      </div>
                  </div>
               </div>
               
               <div className="flex items-center gap-3">
                   {/* AI Status Pill */}
                   <div className={`
                        hidden md:flex items-center gap-2 px-3 h-10 rounded-xl border border-white/10 bg-black/20 backdrop-blur-md transition-all duration-300 hover:bg-black/30
                    `}>
                        <div className="relative flex h-2 w-2">
                          {apiStatus.state === 'HEALTHY' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${
                            apiStatus.state === 'HEALTHY' ? 'bg-emerald-400' : 
                            apiStatus.state === 'DEGRADED' ? 'bg-amber-400' : 'bg-red-400'
                          }`}></span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
                            {apiStatus.state === 'HEALTHY' ? 'AI Online' : 
                             apiStatus.state === 'DEGRADED' ? 'Degraded' : 'Offline'}
                        </span>
                   </div>
  
                   {/* Storage Status Pill */}
                   <div className={`
                        hidden lg:flex items-center gap-2 px-3 h-10 rounded-xl border border-white/10 bg-black/20 backdrop-blur-md transition-all duration-300 hover:bg-black/30
                    `}
                    title={storageStatus === 'IndexedDB' ? 'Using Database' : storageStatus === 'LocalStorage' ? 'Using Local Storage' : 'Storage Error'}
                   >
                        <div className="relative flex h-2 w-2">
                           <span className={`relative inline-flex rounded-full h-2 w-2 ${
                            storageStatus === 'IndexedDB' ? 'bg-blue-400' : 
                            storageStatus === 'LocalStorage' ? 'bg-amber-400' : 
                            storageStatus === 'Error' ? 'bg-red-400' : 'bg-gray-400'
                           }`}></span>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">
                            {storageStatus === 'IndexedDB' ? 'DB Active' : 
                             storageStatus === 'LocalStorage' ? 'Local' : 
                             storageStatus === 'Error' ? 'Error' : 'Loading...'}
                        </span>
                   </div>
  
                   <div className="h-8 w-px bg-white/20 hidden sm:block mx-1" />

                   {/* Theme Toggle */}
                   <button 
                      onClick={toggleTheme}
                      className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/20 text-white/90 hover:text-white transition-colors border border-transparent hover:border-white/30 group"
                      title={user.preferences.theme === 'light' ? "Switch to Dark Mode" : "Switch to Light Mode"}
                   >
                       {user.preferences.theme === 'light' ? (
                           <Moon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                       ) : (
                           <Sun className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                       )}
                   </button>
                  
                  <div className="flex items-center gap-2">
                      <button 
                          onClick={() => openModal('userProfile')}
                          className="flex items-center gap-3 pl-3 pr-1.5 h-10 rounded-xl hover:bg-white/20 transition-colors border border-transparent hover:border-white/30 group"
                      >
                          <div className="flex flex-col items-end mr-1 hidden md:block">
                              <span className="text-xs font-bold text-white group-hover:text-white transition-colors leading-none mb-1">{user.displayName}</span>
                              <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)]"></span>
                                  <span className="text-[9px] text-white/80 uppercase tracking-wider leading-none">Lvl {user.stats.level}</span>
                              </div>
                          </div>
                          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold shadow-sm border border-white/20 text-xs">
                              {user.displayName.charAt(0).toUpperCase()}
                          </div>
                      </button>
                      
                      {user.role === 'admin' && (
                        <div className="flex gap-1 ml-1 pl-2 border-l border-white/10 h-10 items-center">
                            <button 
                                onClick={() => setIsAuditModalOpen(true)}
                                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-colors"
                                title="Audit Content"
                            >
                                <Layers className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => openModal('dataManager')}
                                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-colors"
                                title="Data Manager"
                            >
                                <Database className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => openModal('databaseDashboard')}
                                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-colors"
                                title="Database Dashboard"
                            >
                                <HardDrive className="w-5 h-5" />
                            </button>
                        </div>
                      )}
                  </div>
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
            onEditOutcomes={() => openModal('outcomesEditor')}
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

      {!isFocusMode && currentSelection.currentPrompt && (
          <div className="animate-fade-in relative z-40">
            <CommandVerbHierarchy currentVerb={currentSelection.currentPrompt.verb} />
          </div>
      )}

      {currentSelection.currentPrompt ? (
        <div className="animate-fade-in relative z-0">
          <Workspace
            courses={courses}
            statePath={statePath}
            currentSelection={currentSelection}
            editorRef={editorRef}
            userAnswer={userAnswer}
            debouncedUserAnswer={debouncedUserAnswer}
            setUserAnswer={setUserAnswer}
            evaluationResult={evaluationResult}
            isEvaluating={isEvaluating}
            evaluationError={evaluationError}
            isEnriching={isEnriching}
            enrichError={enrichError}
            isImproving={isImproving}
            improveAnswerError={improveAnswerError}
            evaluatedAnswer={userAnswer}
            handleEvaluate={handleEvaluate}
            geminiHandlers={geminiHandlers}
            modalHandlers={modalHandlers}
            syllabusHandlers={syllabusHandlers}
            userRole={user.role}
            isFocusMode={isFocusMode}
            onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
          />
        </div>
      ) : (
        <div className="min-h-[60vh] flex flex-col items-center justify-center animate-fade-in relative z-0">
          {/* Landing Page Visual */}
          <div className="relative group text-center max-w-xl p-12 rounded-3xl bg-[rgb(var(--color-bg-surface))]/40 light:bg-white/80 backdrop-blur-xl border-2 border-[rgb(var(--color-border-secondary))] light:border-indigo-200 shadow-2xl light:shadow-xl light:shadow-indigo-500/10 transition-all duration-500 hover:border-[rgb(var(--color-accent))]/30 light:hover:border-indigo-300 hover:shadow-[rgb(var(--color-accent))]/10 light:hover:shadow-indigo-500/20 hover:-translate-y-1 hover-lift overflow-hidden">
            {/* Internal glow effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[rgb(var(--color-primary))]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] rounded-3xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
              <div className="relative h-full w-full bg-gradient-to-br from-[rgb(var(--color-bg-surface-elevated))] to-[rgb(var(--color-bg-surface))] light:from-white light:to-indigo-50 rounded-3xl border-2 border-[rgb(var(--color-border-secondary))] light:border-indigo-100 flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform duration-500">
                <Compass className="w-10 h-10 text-[rgb(var(--color-accent))] group-hover:rotate-45 transition-transform duration-700 ease-out" strokeWidth={1.5} />
              </div>
              <div className="absolute -top-2 -right-2 p-2 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-indigo-100 shadow-lg animate-bounce" style={{ animationDuration: '3s' }}>
                  <Sparkles className="w-4 h-4 text-yellow-400" />
              </div>
            </div>

            <h3 className="text-3xl font-black mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-[rgb(var(--color-text-secondary))] light:from-slate-900 light:to-slate-600 relative z-10 tracking-tight">
              Ready to Begin
            </h3>
            <p className="text-[rgb(var(--color-text-muted))] light:text-slate-500 text-base leading-relaxed mb-10 font-medium relative z-10 max-w-md mx-auto">
              Your AI writing coach is standing by. Navigate the syllabus above to select a specific question, or generate a new challenge to begin.
            </p>
            <div className="flex flex-col items-center gap-3 text-[rgb(var(--color-accent))] opacity-60 group-hover:opacity-100 transition-opacity duration-500 relative z-10">
              <span className="text-xs font-bold uppercase tracking-widest">Select a Topic Above</span>
              <ArrowUp className="w-6 h-6 animate-bounce" />
            </div>
          </div>
        </div>
      )}

      <AppModals 
        activeModals={activeModals}
        modalProps={modalProps}
        modalHandlers={modalHandlers}
        syllabusHandlers={syllabusHandlers}
        geminiHandlers={geminiHandlers}
        currentSelection={currentSelection}
        statePath={statePath}
        courses={courses}
        setStatePath={setStatePath}
        showToast={showToast}
        setNewlyAddedIds={setNewlyAddedIds}
        user={user}
        onUpdateUser={onUpdateUser}
        onLogout={handleLogout}
      />
      
      {/* Global Loading Overlay */}
      <GlobalLoadingOverlay message={globalLoadingMessage} error={quotaError} />

      {/* Admin Content Audit Modal */}
      {isAuditModalOpen && (
          <ContentAuditModal
            isOpen={isAuditModalOpen}
            onClose={() => setIsAuditModalOpen(false)}
            courses={courses}
            updateCourses={updateCourses}
            showToast={showToast}
          />
      )}
      
      <BackgroundTaskIndicator task={activeBackgroundTask} />
      {user.role === 'admin' && <ApiMonitorDisplay />}
    </div>
  );
};

// ... Main App Component ...
const App: React.FC = () => {
  const { toast, showToast, hideToast } = useToast();
  const apiStatus = useApiStatus();
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  // Auth Check on Mount
  useEffect(() => {
    const storedUser = authService.getCurrentUser();
    if (storedUser) {
        // If we have a stored user, try to load their full profile from IDB to ensure latest stats
        loadUserProfile(storedUser.username).then(fullProfile => {
            if (fullProfile) {
                // Check if streak needs updating (refresh session logic)
                authService.refreshSession(fullProfile).then(refreshedUser => {
                    setUser(refreshedUser);
                    setIsLoadingAuth(false);
                    // Apply stored theme on load
                    if (refreshedUser.preferences.theme === 'light') {
                        document.documentElement.setAttribute('data-theme', 'light');
                    }
                });
            } else {
                setUser(storedUser); // Fallback to localStorage version
                setIsLoadingAuth(false);
                if (storedUser.preferences.theme === 'light') {
                    document.documentElement.setAttribute('data-theme', 'light');
                }
            }
        });
    } else {
        setIsLoadingAuth(false);
    }
  }, []);

  const handleLogout = () => {
      authService.logout();
      setUser(null);
      showToast("Logged out successfully.", "info");
      // Reset theme to dark on logout if desired, or keep user pref? 
      // Usually better to keep it, but let's reset for clean state if they log in as someone else.
      document.documentElement.removeAttribute('data-theme');
  };

  const handleUpdateUser = (updatedUser: User) => {
      setUser(updatedUser);
  };

  if (isLoadingAuth) {
      return null;
  }

  return (
    <div className="min-h-screen text-[rgb(var(--color-text-primary))] font-sans selection:bg-[rgb(var(--color-accent))]/30 selection:text-white relative z-10">
      
      {/* Animated Background - Fixed Z-Indexing */}
      <AnimatedBackground />

      {!user ? (
        <div className="relative z-10">
            <LoginPage onLogin={(u) => { setUser(u); showToast(`Welcome back, ${u.displayName}`, 'success'); }} />
        </div>
      ) : (
        <div className="relative z-10">
          <AuthenticatedApp 
            user={user} 
            onUpdateUser={handleUpdateUser}
            handleLogout={handleLogout} 
            showToast={showToast} 
            apiStatus={apiStatus} 
          />
        </div>
      )}

      {toast && (
        <div className="fixed top-24 right-4 z-[1000] animate-slide-in">
            <Toast message={toast.message} type={toast.type} onClose={hideToast} />
        </div>
      )}
      
      <ApiStatusIndicator />
      <ApiHealthIndicator />
    </div>
  );
};

export default App;
