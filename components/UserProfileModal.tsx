import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, UserPreferences } from '../types';
import { authService } from '../services/authService';
import { X, User as UserIcon, Settings, Award, TrendingUp, LogOut, Shield, Save, Edit2, Check, Flame, Sun, Moon, Zap, Cpu, MousePointer2, Lock } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (user: User) => void;
  onLogout: () => void;
}

const MeshOverlay = ({ opacity = "opacity-[0.05]" }: { opacity?: string }) => (
  <div 
      className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0`}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")` }}
  />
);

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onUpdateUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'settings'>('overview');
  const [tempPrefs, setTempPrefs] = useState<UserPreferences>({ ...user.preferences });
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isEditingName, setIsEditingName] = useState(false);

  const xpForNextLevel = user.stats.level * 1000;
  const progressPercent = Math.min(100, (user.stats.xp / xpForNextLevel) * 100);
  const levelTier = Math.min(6, Math.ceil(user.stats.level / 5)); 
  const bandConfig = getBandConfig(levelTier);

  const achievements = useMemo(() => {
      return [
          { id: 'first-steps', title: 'First Steps', description: 'Initial eval successful.', icon: '🚀', unlocked: user.stats.questionsAnswered >= 1, accent: 'blue' },
          { id: 'dedicated', title: 'Scholar', description: '10 evaluations deep.', icon: '🎓', unlocked: user.stats.questionsAnswered >= 10, accent: 'purple' },
          { id: 'wordsmith', title: 'Eloquent', description: '1,000 words written.', icon: '✒️', unlocked: user.stats.totalWordsWritten >= 1000, accent: 'emerald' },
          { id: 'streaker', title: 'Persistent', description: '3-day login streak.', icon: '🔥', unlocked: user.stats.streakDays >= 3, accent: 'orange' }
      ];
  }, [user.stats]);
  
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  useEffect(() => {
    if (isOpen) {
        setTempPrefs({ ...user.preferences });
        setDisplayName(user.displayName);
        setIsEditingName(false);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSaveSettings = () => {
    const updatedUser = { ...user, displayName, preferences: tempPrefs };
    onUpdateUser(updatedUser);
    setIsEditingName(false);
    authService.updateUser(updatedUser);
    if (tempPrefs.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  };

  const togglePref = (key: keyof UserPreferences) => {
      setTempPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[2000] p-4" onClick={onClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))]/90 light:bg-white/95 backdrop-blur-3xl rounded-[48px] shadow-[0_64px_128px_-24px_rgba(0,0,0,0.7)] w-full max-w-4xl border border-white/10 light:border-slate-200 animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        <MeshOverlay opacity="opacity-[0.03]" />

        {/* Profile Identity Header */}
        <div className="px-12 py-10 flex flex-col md:flex-row items-center gap-10 border-b border-white/5 light:border-slate-100 relative overflow-hidden">
             <div className="relative group">
                <div className={`absolute inset-0 bg-gradient-to-br ${bandConfig.gradient} blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-700`} />
                <div className={`relative w-28 h-28 rounded-[36px] bg-gradient-to-br ${bandConfig.gradient} flex items-center justify-center shadow-2xl border-4 border-white/10 transform group-hover:scale-105 transition-transform duration-500`}>
                    <span className="text-5xl font-black text-white">{user.displayName.charAt(0).toUpperCase()}</span>
                </div>
                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-black border border-white/10 flex items-center justify-center shadow-xl">
                    <span className={`text-xs font-black ${bandConfig.text}`}>{user.stats.level}</span>
                </div>
             </div>

             <div className="flex-1 text-center md:text-left">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-3">
                    {isEditingName ? (
                        <div className="flex items-center gap-2">
                            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="bg-white/5 border-b-2 border-indigo-500 text-3xl font-black text-white focus:outline-none px-2" autoFocus />
                            <button onClick={handleSaveSettings} className="p-2 bg-indigo-500 text-white rounded-xl"><Save className="w-5 h-5"/></button>
                        </div>
                    ) : (
                        <h2 onClick={() => setIsEditingName(true)} className="text-4xl font-black text-white light:text-slate-900 tracking-tight cursor-pointer hover:text-indigo-400 transition-colors">{user.displayName}</h2>
                    )}
                    <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-indigo-400">{user.role}</span>
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 text-slate-400 text-sm font-medium">
                    <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-indigo-500" /> User Level</span>
                    <span className="flex items-center gap-2"><Flame className="w-4 h-4 text-orange-500" /> {user.stats.streakDays} Day Active Streak</span>
                </div>
             </div>

             <div className="flex-shrink-0 flex flex-col items-end gap-2 hidden lg:flex">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Level Progress</span>
                    <span className="text-xs font-mono font-bold text-indigo-400">{Math.round(progressPercent)}%</span>
                </div>
                <div className="w-48 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div className={`h-full bg-gradient-to-r ${bandConfig.gradient}`} style={{ width: `${progressPercent}%` }} />
                </div>
             </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/5 light:border-slate-100 px-10 bg-black/10 light:bg-slate-50/50">
            {[
                { id: 'overview', icon: Zap, label: 'Stats' },
                { id: 'achievements', icon: Award, label: 'Achievements' },
                { id: 'settings', icon: Settings, label: 'Settings' }
            ].map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-6 py-5 text-xs font-bold uppercase tracking-[0.1em] border-b-2 transition-all flex items-center gap-3 ${activeTab === tab.id ? `border-indigo-500 text-white` : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-400' : ''}`} /> {tab.label}
                </button>
            ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
            
            {activeTab === 'overview' && (
                <div className="space-y-12 animate-fade-in">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                         {[
                             { label: 'Completed', val: user.stats.questionsAnswered, icon: Check, color: 'text-emerald-400' },
                             { label: 'Avg Band', val: user.stats.averageBand.toFixed(1), icon: Award, color: 'text-indigo-400' },
                             { label: 'Word Count', val: `${(user.stats.totalWordsWritten/1000).toFixed(1)}k`, icon: TrendingUp, color: 'text-sky-400' },
                             { label: 'Credits', val: user.stats.xp, icon: Zap, color: 'text-amber-400' }
                         ].map(stat => (
                             <div key={stat.label} className="p-6 rounded-[32px] bg-white/[0.03] light:bg-slate-100 border border-white/5 light:border-slate-200 flex flex-col items-center text-center group hover:bg-white/[0.05] transition-colors">
                                 <div className={`p-3 rounded-2xl bg-white/5 mb-4 group-hover:rotate-6 transition-transform ${stat.color}`}>
                                     <stat.icon className="w-5 h-5" />
                                 </div>
                                 <span className="text-3xl font-black text-white light:text-slate-900 tracking-tighter">{stat.val}</span>
                                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">{stat.label}</span>
                             </div>
                         ))}
                    </div>

                    <div className="p-8 rounded-[32px] bg-indigo-500/5 border border-indigo-500/20 flex items-start gap-6">
                        <div className="p-4 rounded-3xl bg-indigo-500/20 text-indigo-400">
                             <Cpu className="w-8 h-8" />
                        </div>
                        <div>
                            <h4 className="text-lg font-bold text-white uppercase tracking-tight mb-2">Performance Summary</h4>
                            <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
                                Your activity has increased by <span className="text-emerald-400 font-bold">12%</span> this week. Continue practising to maintain your streak.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'achievements' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                    {achievements.map(ach => (
                        <div key={ach.id} className={`flex items-center gap-6 p-6 rounded-[32px] border transition-all duration-500 ${ach.unlocked ? 'bg-white/[0.03] border-white/10' : 'bg-black/20 border-transparent opacity-40 grayscale'}`}>
                            <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center text-3xl shadow-2xl border ${ach.unlocked ? 'bg-white/5 border-white/10 shadow-indigo-500/10' : 'bg-transparent border-white/5'}`}>
                                {ach.unlocked ? ach.icon : <Lock className="w-6 h-6 text-slate-600" />}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-white light:text-slate-900 uppercase tracking-wide mb-1">{ach.title}</h4>
                                <p className="text-xs text-slate-500 font-medium">{ach.description}</p>
                            </div>
                            {ach.unlocked && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]" />}
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="bg-white/[0.02] light:bg-slate-100 rounded-[40px] border border-white/5 light:border-slate-200 overflow-hidden">
                        {[
                            { id: 'theme', icon: Sun, label: 'Light Theme', desc: 'Switch to light mode.', isTheme: true },
                            { id: 'defaultFocusMode', icon: MousePointer2, label: 'Default Focus Mode', desc: 'Automatically hide menus on entry.' },
                            { id: 'autoSave', icon: Save, label: 'Auto-Save', desc: 'Automatically save your drafts.' },
                            { id: 'highContrast', icon: Zap, label: 'High Contrast', desc: 'Increase text legibility.' }
                        ].map((pref, i) => (
                            <div key={pref.id} className={`flex items-center justify-between px-10 py-6 hover:bg-white/[0.02] transition-colors ${i !== 3 ? 'border-b border-white/5' : ''}`}>
                                <div className="flex items-center gap-6">
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500">
                                        <pref.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white light:text-slate-900 uppercase tracking-widest">{pref.label}</h4>
                                        <p className="text-xs text-slate-500 font-medium mt-1">{pref.desc}</p>
                                    </div>
                                </div>
                                
                                {pref.isTheme ? (
                                    <button 
                                        onClick={() => setTempPrefs(p => ({ ...p, theme: p.theme === 'light' ? 'dark' : 'light' }))}
                                        className={`w-14 h-8 rounded-full relative transition-colors duration-500 ${tempPrefs.theme === 'light' ? 'bg-indigo-500' : 'bg-slate-800'}`}
                                    >
                                        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all duration-500 flex items-center justify-center ${tempPrefs.theme === 'light' ? 'left-7' : 'left-1'}`}>
                                            {tempPrefs.theme === 'light' ? <Sun className="w-3 h-3 text-indigo-500" /> : <Moon className="w-3 h-3 text-slate-800" />}
                                        </div>
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => togglePref(pref.id as any)}
                                        className={`w-14 h-8 rounded-full relative transition-colors duration-500 ${tempPrefs[pref.id as keyof UserPreferences] ? 'bg-emerald-500' : 'bg-slate-800'}`}
                                    >
                                        <div className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-all duration-500 ${tempPrefs[pref.id as keyof UserPreferences] ? 'translate-x-6' : ''}`} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    
                    <div className="flex justify-end pt-4">
                        <button onClick={handleSaveSettings} className="px-10 py-4 rounded-[20px] font-bold text-sm uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 shadow-2xl active:scale-95 transition-all flex items-center gap-3">
                            <Save className="w-4 h-4" /> Save Settings
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Modular Footer */}
        <div className="px-12 py-8 border-t border-white/5 light:border-slate-100 bg-black/20 light:bg-slate-50 flex justify-between items-center z-10">
             <button onClick={() => { onClose(); onLogout(); }} className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-500 hover:text-red-400 transition-colors flex items-center gap-2 group">
                 <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Log Out
             </button>
             <button onClick={onClose} className="px-8 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors">
                 Close
             </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UserProfileModal;