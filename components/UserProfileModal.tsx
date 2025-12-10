
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, UserPreferences } from '../types';
import { authService } from '../services/authService';
import { X, User as UserIcon, Settings, Award, TrendingUp, LogOut, Shield, Save, Edit2, Lock, Check, Flame, Sun, Moon } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (user: User) => void;
  onLogout: () => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onUpdateUser, onLogout }) => {
  // 1. All Hooks must be declared at the top level, unconditionally.
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'settings'>('overview');
  const [tempPrefs, setTempPrefs] = useState<UserPreferences>({ ...user.preferences });
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isEditingName, setIsEditingName] = useState(false);

  // Calculate Level Progress
  const xpForNextLevel = user.stats.level * 1000;
  const progressPercent = Math.min(100, (user.stats.xp / xpForNextLevel) * 100);

  // Theme config based on level
  const levelTier = Math.min(6, Math.ceil(user.stats.level / 5)); 
  const bandConfig = getBandConfig(levelTier);

  // --- Dynamic Achievements (useMemo Hook) ---
  const achievements = useMemo(() => {
      const list = [
          {
              id: 'first-steps',
              title: 'First Steps',
              description: 'Complete your first evaluation',
              icon: '🚀',
              unlocked: user.stats.questionsAnswered >= 1,
              color: 'text-blue-400 light:text-blue-700 bg-blue-500/20 light:bg-blue-100 border-blue-500/30 light:border-blue-300'
          },
          {
              id: 'dedicated',
              title: 'Dedicated Scholar',
              description: 'Complete 10 evaluations',
              icon: '📚',
              unlocked: user.stats.questionsAnswered >= 10,
              color: 'text-purple-400 light:text-purple-700 bg-purple-500/20 light:bg-purple-100 border-purple-500/30 light:border-purple-300'
          },
          {
              id: 'wordsmith',
              title: 'Word Smith',
              description: 'Write over 1,000 words total',
              icon: '✍️',
              unlocked: user.stats.totalWordsWritten >= 1000,
              color: 'text-green-400 light:text-green-700 bg-green-500/20 light:bg-green-100 border-green-500/30 light:border-green-300'
          },
          {
              id: 'high-performer',
              title: 'High Performer',
              description: 'Maintain an Average Band of 5.0+ (min 5 Qs)',
              icon: '🏆',
              unlocked: user.stats.averageBand >= 5.0 && user.stats.questionsAnswered >= 5,
              color: 'text-yellow-400 light:text-yellow-700 bg-yellow-500/20 light:bg-yellow-100 border-yellow-500/30 light:border-yellow-300'
          },
          {
              id: 'veteran',
              title: 'Veteran',
              description: 'Reach Level 5',
              icon: '⭐',
              unlocked: user.stats.level >= 5,
              color: 'text-red-400 light:text-red-700 bg-red-500/20 light:bg-red-100 border-red-500/30 light:border-red-300'
          },
          {
              id: 'streaker',
              title: 'On Fire',
              description: 'Reach a 3-day login streak',
              icon: '🔥',
              unlocked: user.stats.streakDays >= 3,
              color: 'text-orange-400 light:text-orange-700 bg-orange-500/20 light:bg-orange-100 border-orange-500/30 light:border-orange-300'
          }
      ];
      return list;
  }, [user.stats]);
  
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  // Reset state when modal opens to ensure latest user data is reflected (useEffect Hook)
  useEffect(() => {
    if (isOpen) {
        setTempPrefs({ ...user.preferences });
        setDisplayName(user.displayName);
        setIsEditingName(false);
        setActiveTab('overview'); 
    }
  }, [isOpen, user]);

  // CRITICAL: Early return MUST happen after all hooks are called to prevent React Error #310
  if (!isOpen) return null;

  const handleSaveSettings = () => {
    const updatedUser = {
        ...user,
        displayName,
        preferences: tempPrefs
    };
    onUpdateUser(updatedUser);
    setIsEditingName(false);
    authService.updateUser(updatedUser);
    
    // Apply theme immediately if changed in modal
    if (tempPrefs.theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
  };

  const togglePref = (key: keyof UserPreferences) => {
      setTempPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] p-4" onClick={onClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-3xl border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden flex flex-col max-h-[85vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`relative px-8 py-6 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 overflow-hidden`}>
            {/* Background Glow */}
            <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${bandConfig.gradient} opacity-10 blur-[80px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3`} />
            
            <div className="flex justify-between items-start relative z-10">
                <div className="flex items-center gap-5">
                    <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${bandConfig.gradient} flex items-center justify-center shadow-lg border-2 border-white/10`}>
                        <span className="text-3xl font-black text-white">{user.displayName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            {isEditingName ? (
                                <div className="flex items-center gap-2">
                                    <input 
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        className="bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded px-2 py-1 text-lg font-bold text-[rgb(var(--color-text-primary))] focus:outline-none focus:border-[rgb(var(--color-accent))]"
                                        autoFocus
                                    />
                                    <button onClick={handleSaveSettings} className="p-1 hover:bg-green-500/20 text-green-400 rounded"><Save className="w-4 h-4"/></button>
                                </div>
                            ) : (
                                <h2 className="text-2xl font-bold text-[rgb(var(--color-text-primary))] tracking-tight flex items-center gap-2">
                                    {user.displayName}
                                    <button onClick={() => setIsEditingName(true)} className="opacity-0 group-hover:opacity-100 hover:text-[rgb(var(--color-accent))] transition-opacity">
                                        <Edit2 className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
                                    </button>
                                </h2>
                            )}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border border-white/10 bg-white/5 uppercase tracking-wider ${user.role === 'admin' ? 'text-purple-300' : 'text-blue-300'}`}>
                                {user.role}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-[rgb(var(--color-text-muted))]">
                            <span className="flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5" /> Level {user.stats.level} Scholar
                            </span>
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
        </div>

        {/* Navigation */}
        <div className="flex border-b border-[rgb(var(--color-border-secondary))] px-6 bg-[rgb(var(--color-bg-surface))]/80">
            <button 
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'overview' ? `border-[rgb(var(--color-accent))] text-[rgb(var(--color-accent))]` : 'border-transparent text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-secondary))]'}`}
            >
                <UserIcon className="w-4 h-4" /> Overview
            </button>
            <button 
                onClick={() => setActiveTab('achievements')}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'achievements' ? `border-[rgb(var(--color-accent))] text-[rgb(var(--color-accent))]` : 'border-transparent text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-secondary))]'}`}
            >
                <Award className="w-4 h-4" /> Achievements <span className="ml-1 text-[9px] bg-[rgb(var(--color-bg-surface-inset))] px-1.5 rounded-full border border-[rgb(var(--color-border-secondary))]">{unlockedCount}/{achievements.length}</span>
            </button>
            <button 
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'settings' ? `border-[rgb(var(--color-accent))] text-[rgb(var(--color-accent))]` : 'border-transparent text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-secondary))]'}`}
            >
                <Settings className="w-4 h-4" /> Preferences
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-[rgb(var(--color-bg-surface))]/50">
            
            {activeTab === 'overview' && (
                <div className="space-y-8 animate-fade-in">
                    {/* XP Progress */}
                    <div className="bg-[rgb(var(--color-bg-surface-inset))]/50 p-5 rounded-xl border border-[rgb(var(--color-border-secondary))]">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">Experience</span>
                            <span className="text-xs font-mono font-bold text-[rgb(var(--color-text-primary))]">{user.stats.xp} / {xpForNextLevel} XP</span>
                        </div>
                        <div className="h-3 w-full bg-[rgb(var(--color-bg-surface))] rounded-full overflow-hidden border border-[rgb(var(--color-border-secondary))]">
                            <div 
                                className={`h-full bg-gradient-to-r ${bandConfig.gradient} transition-all duration-1000 ease-out relative`} 
                                style={{ width: `${progressPercent}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-shimmer" />
                            </div>
                        </div>
                        <p className="text-xs text-[rgb(var(--color-text-dim))] mt-2">
                            Earn XP by evaluating answers, completing topics, and generating content.
                        </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                         <div className="p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 border border-[rgb(var(--color-border-secondary))] flex flex-col items-center text-center hover:border-[rgb(var(--color-accent))]/30 transition-colors group">
                             <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                 <Edit2 className="w-5 h-5" />
                             </div>
                             <span className="text-2xl font-black text-[rgb(var(--color-text-primary))]">{user.stats.questionsAnswered}</span>
                             <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mt-1">Answered</span>
                         </div>
                         
                         <div className="p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 border border-[rgb(var(--color-border-secondary))] flex flex-col items-center text-center hover:border-[rgb(var(--color-accent))]/30 transition-colors group">
                             <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                 <Award className="w-5 h-5" />
                             </div>
                             <span className="text-2xl font-black text-[rgb(var(--color-text-primary))]">{user.stats.averageBand > 0 ? user.stats.averageBand.toFixed(1) : '-'}</span>
                             <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mt-1">Avg. Band</span>
                         </div>
                         
                         <div className="p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 border border-[rgb(var(--color-border-secondary))] flex flex-col items-center text-center hover:border-[rgb(var(--color-accent))]/30 transition-colors group">
                             <div className="w-10 h-10 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                 <TrendingUp className="w-5 h-5" />
                             </div>
                             <span className="text-2xl font-black text-[rgb(var(--color-text-primary))]">{(user.stats.totalWordsWritten / 1000).toFixed(1)}k</span>
                             <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mt-1">Words</span>
                         </div>

                         <div className="p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 border border-[rgb(var(--color-border-secondary))] flex flex-col items-center text-center hover:border-[rgb(var(--color-accent))]/30 transition-colors group">
                             <div className="w-10 h-10 rounded-full bg-orange-500/10 text-orange-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                 <Flame className="w-5 h-5" />
                             </div>
                             <span className="text-2xl font-black text-[rgb(var(--color-text-primary))]">{user.stats.streakDays}</span>
                             <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mt-1">Day Streak</span>
                         </div>
                    </div>
                </div>
            )}

            {activeTab === 'achievements' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {achievements.map(ach => (
                            <div 
                            key={ach.id}
                            className={`
                                flex items-start gap-4 p-4 rounded-xl border transition-all duration-300
                                ${ach.unlocked 
                                    ? `bg-[rgb(var(--color-bg-surface-inset))]/50 border-[rgb(var(--color-border-secondary))]` 
                                    : `bg-[rgb(var(--color-bg-surface-inset))]/20 border-transparent opacity-50 grayscale-[0.8]`
                                }
                            `}
                            >
                                <div className={`
                                w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-sm border flex-shrink-0
                                ${ach.unlocked ? ach.color : 'bg-gray-700/50 text-gray-500 border-gray-600/30'}
                                `}>
                                    {ach.unlocked ? ach.icon : <Lock className="w-5 h-5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className={`text-sm font-bold ${ach.unlocked ? 'text-[rgb(var(--color-text-primary))]' : 'text-gray-400'}`}>{ach.title}</h4>
                                        {ach.unlocked && <Check className="w-4 h-4 text-green-400" />}
                                    </div>
                                    <p className="text-xs text-[rgb(var(--color-text-muted))] leading-relaxed">{ach.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    {unlockedCount === 0 && (
                        <p className="text-center text-[rgb(var(--color-text-dim))] text-sm italic pt-8">
                            Keep working to unlock your first achievement!
                        </p>
                    )}
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="space-y-6 animate-fade-in">
                     <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 rounded-xl border border-[rgb(var(--color-border-secondary))] overflow-hidden">
                         <div className="px-6 py-4 border-b border-[rgb(var(--color-border-secondary))]/50 bg-[rgb(var(--color-bg-surface-elevated))]/30">
                             <h3 className="font-bold text-[rgb(var(--color-text-primary))]">Application Settings</h3>
                         </div>
                         <div className="divide-y divide-[rgb(var(--color-border-secondary))]/30">
                             
                             <label className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-[rgb(var(--color-bg-surface-light))]/20 transition-colors">
                                 <div>
                                     <div className="text-sm font-medium text-[rgb(var(--color-text-primary))]">Default Focus Mode</div>
                                     <div className="text-xs text-[rgb(var(--color-text-muted))] mt-0.5">Start the workspace in focus mode automatically.</div>
                                 </div>
                                 <input 
                                    type="checkbox" 
                                    checked={tempPrefs.defaultFocusMode}
                                    onChange={() => togglePref('defaultFocusMode')}
                                    className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]"
                                 />
                             </label>

                             <label className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-[rgb(var(--color-bg-surface-light))]/20 transition-colors">
                                 <div>
                                     <div className="text-sm font-medium text-[rgb(var(--color-text-primary))]">Auto-Save</div>
                                     <div className="text-xs text-[rgb(var(--color-text-muted))] mt-0.5">Automatically save your work to local storage every few seconds.</div>
                                 </div>
                                 <input 
                                    type="checkbox" 
                                    checked={tempPrefs.autoSave}
                                    onChange={() => togglePref('autoSave')}
                                    className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]"
                                 />
                             </label>

                             {/* Theme Selection in Settings */}
                             <div className="flex items-center justify-between px-6 py-4 hover:bg-[rgb(var(--color-bg-surface-light))]/20 transition-colors">
                                 <div>
                                     <div className="text-sm font-medium text-[rgb(var(--color-text-primary))]">Appearance</div>
                                     <div className="text-xs text-[rgb(var(--color-text-muted))] mt-0.5">Choose your preferred visual theme.</div>
                                 </div>
                                 <div className="flex gap-2 p-1 bg-[rgb(var(--color-bg-surface-inset))] rounded-lg border border-[rgb(var(--color-border-secondary))]">
                                     <button
                                        onClick={() => setTempPrefs(prev => ({ ...prev, theme: 'light' }))}
                                        className={`p-2 rounded-md transition-all flex items-center gap-2 text-xs font-bold ${tempPrefs.theme === 'light' ? 'bg-white text-slate-900 shadow-sm' : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]'}`}
                                     >
                                         <Sun className="w-3.5 h-3.5" /> Light
                                     </button>
                                     <button
                                        onClick={() => setTempPrefs(prev => ({ ...prev, theme: 'dark' }))}
                                        className={`p-2 rounded-md transition-all flex items-center gap-2 text-xs font-bold ${tempPrefs.theme === 'dark' || !tempPrefs.theme ? 'bg-slate-700 text-white shadow-sm' : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]'}`}
                                     >
                                         <Moon className="w-3.5 h-3.5" /> Dark
                                     </button>
                                 </div>
                             </div>

                             <label className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-[rgb(var(--color-bg-surface-light))]/20 transition-colors">
                                 <div>
                                     <div className="text-sm font-medium text-[rgb(var(--color-text-primary))]">High Contrast UI</div>
                                     <div className="text-xs text-[rgb(var(--color-text-muted))] mt-0.5">Increase contrast for better readability (Beta).</div>
                                 </div>
                                 <input 
                                    type="checkbox" 
                                    checked={tempPrefs.highContrast}
                                    onChange={() => togglePref('highContrast')}
                                    className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]"
                                 />
                             </label>

                             <label className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-[rgb(var(--color-bg-surface-light))]/20 transition-colors">
                                 <div>
                                     <div className="text-sm font-medium text-[rgb(var(--color-text-primary))]">Show Tips</div>
                                     <div className="text-xs text-[rgb(var(--color-text-muted))] mt-0.5">Display helpful hints in the writing workspace.</div>
                                 </div>
                                 <input 
                                    type="checkbox" 
                                    checked={tempPrefs.showTips}
                                    onChange={() => togglePref('showTips')}
                                    className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]"
                                 />
                             </label>

                         </div>
                     </div>

                     <div className="flex justify-end pt-4">
                         <button 
                            onClick={handleSaveSettings} 
                            className="px-6 py-2.5 rounded-lg font-bold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition-all flex items-center gap-2"
                        >
                             <Save className="w-4 h-4" /> Save Changes
                         </button>
                     </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex justify-between items-center">
             <button onClick={() => { onClose(); onLogout(); }} className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-2 transition-colors px-3 py-2 rounded hover:bg-red-900/20">
                 <LogOut className="w-4 h-4" /> Sign Out
             </button>
             
             <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-bold text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-light))] transition-colors">
                 Close
             </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UserProfileModal;