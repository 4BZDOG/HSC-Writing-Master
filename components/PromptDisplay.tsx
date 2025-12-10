
import React, { useMemo, useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Prompt, CommandTermInfo, CourseOutcome, UserRole } from '../types';
import { Sparkles, HelpCircle, Hash, Target, FileText, Globe, Minus, Plus, Loader2, AlertCircle, Pencil, Check, X, Award, ShieldCheck, Type } from 'lucide-react';
import { getCommandTermInfo, getCommandTermsForMarks } from '../data/commandTerms';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import ErrorBoundary from './ErrorBoundary';

interface PromptDisplayProps {
  prompt: Prompt;
  isEnriching: boolean;
  enrichError?: string | null;
  onVerbClick: () => void;
  onGenerateScenario: () => void;
  onUpdatePrompt: (updates: Partial<Prompt>) => void;
  isGeneratingScenario: boolean;
  generateScenarioError: React.ReactNode | null;
  courseOutcomes: CourseOutcome[];
  onOutcomeClick: (outcome: CourseOutcome) => void;
  userRole: UserRole;
  onDismissEnrichError?: () => void;
  onRunQualityCheck?: (content: string, type: 'question' | 'code') => void;
}

const PromptDisplayContent: React.FC<PromptDisplayProps> = ({ 
  prompt, 
  isEnriching, 
  enrichError,
  onVerbClick, 
  onGenerateScenario, 
  onUpdatePrompt,
  isGeneratingScenario,
  generateScenarioError,
  courseOutcomes,
  onOutcomeClick,
  userRole,
  onDismissEnrichError,
  onRunQualityCheck
}) => {
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const bandConfig = useMemo(() => getBandConfig(commandTermInfo.tier), [commandTermInfo.tier]);
  const [isPressed, setIsPressed] = useState(false);
  const [sizeIndex, setSizeIndex] = useState(1); // 0=Normal, 1=Large (Default), 2=Extra Large
  
  const isAdmin = userRole === 'admin';

  // Editing States
  const [editingField, setEditingField] = useState<'question' | 'scenario' | 'marks' | 'metadata' | null>(null);
  const [tempValue, setTempValue] = useState<string | number>('');
  
  // Metadata temp states
  const [tempIsPastHSC, setTempIsPastHSC] = useState(prompt.isPastHSC || false);
  const [tempHscYear, setTempHscYear] = useState(prompt.hscYear || new Date().getFullYear());
  const [tempHscQuestionNumber, setTempHscQuestionNumber] = useState(prompt.hscQuestionNumber || '');

  const editInputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingField && editInputRef.current) {
        editInputRef.current.focus();
    }
    // Init metadata temps when entering metadata edit mode
    if (editingField === 'metadata') {
        setTempIsPastHSC(prompt.isPastHSC || false);
        setTempHscYear(prompt.hscYear || new Date().getFullYear());
        setTempHscQuestionNumber(prompt.hscQuestionNumber || '');
    }
  }, [editingField, prompt.isPastHSC, prompt.hscYear, prompt.hscQuestionNumber]);

  const startEditing = (field: 'question' | 'scenario' | 'marks', value: string | number) => {
      if (!isAdmin) return;
      setEditingField(field);
      setTempValue(value);
  };
  
  const startEditingMetadata = () => {
      if (!isAdmin) return;
      setEditingField('metadata');
  };

  const saveEdit = () => {
      if (!editingField || !isAdmin) return;
      
      const updates: Partial<Prompt> = {};
      if (editingField === 'marks') {
          const numVal = Number(tempValue);
          if (!isNaN(numVal) && numVal > 0) updates.totalMarks = numVal;
      } else if (editingField === 'metadata') {
          updates.isPastHSC = tempIsPastHSC;
          updates.hscYear = tempHscYear;
          updates.hscQuestionNumber = tempHscQuestionNumber;
      } else {
          // @ts-ignore
          updates[editingField] = tempValue;
      }
      
      onUpdatePrompt(updates);
      setEditingField(null);
  };

  const cancelEdit = () => {
      setEditingField(null);
      setTempValue('');
  };
  
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') cancelEdit();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || editingField === 'marks')) {
          e.preventDefault();
          saveEdit();
      }
  };
  
  // Typography Scales
  const questionSizes = ['text-lg', 'text-xl', 'text-2xl'];
  const scenarioSizes = ['text-base', 'text-lg', 'text-xl'];

  // Render question with keyword highlighting
  const renderedQuestion = useMemo(() => {
    return renderFormattedText(prompt.question, prompt.keywords, prompt.verb);
  }, [prompt.question, prompt.keywords, prompt.verb]);

  // Render scenario with keyword highlighting
  const renderedScenario = useMemo(() => {
    if (!prompt.scenario) return null;
    return renderFormattedText(prompt.scenario, prompt.keywords, prompt.verb);
  }, [prompt.scenario, prompt.keywords, prompt.verb]);
  
  const linkedOutcomes = useMemo(() => {
    if (!prompt.linkedOutcomes || !Array.isArray(prompt.linkedOutcomes)) return [];
    return courseOutcomes.filter(co => prompt.linkedOutcomes!.includes(co.code));
  }, [prompt.linkedOutcomes, courseOutcomes]);

  const handleVerbKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onVerbClick();
    }
  };

  return (
    <div 
      className={`
        relative
        bg-[rgb(var(--color-bg-surface))]/80 rounded-2xl p-6 
        border-2 ${bandConfig.border} border-opacity-40 light:border-opacity-60
        light:bg-white light:shadow-[0_8px_30px_rgb(0,0,0,0.04)]
        shadow-2xl transition-all duration-300 ease-out
        hover:border-opacity-60 light:hover:border-opacity-80 ${bandConfig.glow}
        backdrop-blur-sm hover-lift
      `}
    >
      {/* Enrichment Loading Overlay */}
      {isEnriching && (
        <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10 animate-fade-in">
          <div className="flex flex-col items-center gap-4 text-center p-6">
            <div className="w-12 h-12 rounded-full border-2 border-[rgb(var(--color-accent))]/30 border-t-[rgb(var(--color-accent))] animate-spin"></div>
            <div className="text-[rgb(var(--color-text-secondary))] light:text-slate-600">
              <p className="font-semibold text-lg text-[rgb(var(--color-text-primary))] light:text-slate-900">Enriching Prompt...</p>
              <p className="text-sm">Fetching keywords, scenario, and outcomes with AI.</p>
            </div>
          </div>
        </div>
      )}

      {/* Enrichment Error Banner */}
      {enrichError && (
          <div className="absolute top-0 left-0 right-0 bg-red-900/80 light:bg-red-100 backdrop-blur-md border-b border-red-500/30 light:border-red-200 p-3 rounded-t-2xl z-20 flex items-center justify-between gap-3 animate-slide-in">
              <div className="flex items-center gap-2 text-red-200 light:text-red-800 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Enrichment failed: {enrichError}</span>
              </div>
              {onDismissEnrichError && (
                <button 
                    onClick={onDismissEnrichError}
                    className="p-1 hover:bg-red-800/50 light:hover:bg-red-200/50 rounded transition-colors text-red-300 light:text-red-600 hover:text-white light:hover:text-red-900"
                    title="Dismiss error"
                >
                    <X className="w-4 h-4" />
                </button>
              )}
          </div>
      )}
      
      {/* Header */}
      <div className={`flex justify-between items-start mb-5 gap-4 ${enrichError ? 'mt-8' : ''}`}>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h3 className="text-2xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                    ✍️ Question Details
                </h3>
                {/* NESA PAST HSC Badge */}
                {prompt.isPastHSC && !editingField && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/20 light:bg-amber-100 border border-amber-500/40 light:border-amber-300 text-amber-400 light:text-amber-700 text-[11px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(245,158,11,0.2)] whitespace-nowrap">
                        <Award className="w-4 h-4 fill-amber-400/20 light:fill-amber-600/20" />
                        Past HSC {prompt.hscYear || ''} {prompt.hscQuestionNumber ? `Q${prompt.hscQuestionNumber}` : ''}
                    </span>
                )}
                {/* Admin Edit Metadata Button */}
                {isAdmin && !editingField && (
                     <button 
                        onClick={startEditingMetadata}
                        className="p-1 rounded hover:bg-white/10 light:hover:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-400 hover:text-white light:hover:text-slate-600 transition-colors"
                        title="Edit Question Metadata"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            
            {/* Metadata Editor */}
            {editingField === 'metadata' && isAdmin && (
                 <div className="mb-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 p-3 rounded-lg border border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex flex-wrap items-center gap-4 animate-fade-in">
                     <label className="flex items-center gap-2 text-sm font-medium text-white light:text-slate-800 cursor-pointer select-none">
                         <input 
                             type="checkbox" 
                             checked={tempIsPastHSC}
                             onChange={e => setTempIsPastHSC(e.target.checked)}
                             className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]"
                         />
                         Is Past HSC Question?
                     </label>
                     
                     {tempIsPastHSC && (
                         <>
                             <div className="flex items-center gap-2">
                                 <span className="text-xs text-gray-400 light:text-slate-500">Year:</span>
                                 <input 
                                     type="number" 
                                     value={tempHscYear} 
                                     onChange={e => setTempHscYear(parseInt(e.target.value))}
                                     className="w-20 bg-black/20 light:bg-white border border-gray-600 light:border-slate-300 rounded px-2 py-1 text-sm text-white light:text-slate-900"
                                 />
                             </div>
                             <div className="flex items-center gap-2">
                                 <span className="text-xs text-gray-400 light:text-slate-500">Question #:</span>
                                 <input 
                                     type="text" 
                                     value={tempHscQuestionNumber} 
                                     onChange={e => setTempHscQuestionNumber(e.target.value)}
                                     className="w-20 bg-black/20 light:bg-white border border-gray-600 light:border-slate-300 rounded px-2 py-1 text-sm text-white light:text-slate-900"
                                 />
                             </div>
                         </>
                     )}
                     
                     <div className="ml-auto flex gap-2">
                         <button onClick={cancelEdit} className="text-xs text-red-400 hover:text-white light:hover:text-red-600"><X className="w-4 h-4"/></button>
                         <button onClick={saveEdit} className="text-xs text-green-400 hover:text-white light:hover:text-green-600"><Check className="w-4 h-4"/></button>
                     </div>
                 </div>
            )}

          <div className="flex flex-wrap items-center gap-4 text-sm">
            {/* Marks Display / Editor */}
            {editingField === 'marks' && isAdmin ? (
                <div className="flex items-center gap-2">
                    <input
                        ref={editInputRef as React.RefObject<HTMLInputElement>}
                        type="number"
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={saveEdit}
                        className="w-16 bg-[rgb(var(--color-bg-surface-inset))] light:bg-white border border-[rgb(var(--color-accent))] rounded px-2 py-1 text-white light:text-slate-900 font-mono text-sm focus:outline-none"
                        min="1"
                    />
                    <button onClick={saveEdit} className="text-green-400 hover:text-green-300 light:text-green-600 light:hover:text-green-700 hover-scale"><Check className="w-4 h-4"/></button>
                    <button onClick={cancelEdit} className="text-red-400 hover:text-red-300 light:text-red-600 light:hover:text-red-700 hover-scale"><X className="w-4 h-4"/></button>
                </div>
            ) : (
                <button 
                    onClick={() => startEditing('marks', prompt.totalMarks)}
                    disabled={!isAdmin}
                    className={`flex items-center gap-2 group focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50 rounded px-1 -ml-1 ${isAdmin ? 'hover:bg-[rgb(var(--color-bg-surface-light))]/50 light:hover:bg-slate-100 cursor-pointer hover-scale' : 'cursor-default'} transition-all`}
                    title={isAdmin ? "Click to edit marks" : "Marks"}
                >
                    <Hash className="w-4 h-4 text-[rgb(var(--color-text-dim))] light:text-slate-400" />
                    <span className={`font-mono font-bold ${bandConfig.text} ${isAdmin ? 'group-hover:underline decoration-dashed underline-offset-4' : ''}`}>
                        {prompt.totalMarks} marks
                    </span>
                    {isAdmin && <Pencil className="w-3 h-3 text-[rgb(var(--color-text-muted))] opacity-0 group-hover:opacity-100 transition-opacity" />}
                </button>
            )}

            <span className="w-1 h-1 rounded-full bg-[rgb(var(--color-text-dim))]/30 light:bg-slate-400/50" />
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[rgb(var(--color-accent))]" />
              <span className={`
                font-semibold ${bandConfig.text}
              `}>
                Tier {commandTermInfo.tier}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            {/* Font Size Controls */}
            <div className="flex items-center gap-1 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100 rounded-lg p-1 border border-[rgb(var(--color-border-secondary))] light:border-slate-300">
                <button 
                    onClick={() => setSizeIndex(s => Math.max(s - 1, 0))} 
                    disabled={sizeIndex === 0}
                    className="p-1.5 rounded-md text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 hover:bg-gray-700 light:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition hover-scale"
                    title="Decrease text size"
                >
                    <Type className="w-3 h-3 scale-75" />
                </button>
                <div className="w-px h-3 bg-[rgb(var(--color-border-secondary))] light:bg-slate-300" />
                <button 
                    onClick={() => setSizeIndex(s => Math.min(s + 1, 2))} 
                    disabled={sizeIndex === 2}
                    className="p-1.5 rounded-md text-gray-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 hover:bg-gray-700 light:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition hover-scale"
                    title="Increase text size"
                >
                    <Type className="w-4 h-4" />
                </button>
            </div>

          {prompt.verb && (
            <button 
              onClick={onVerbClick}
              onKeyDown={handleVerbKeyDown}
              onTouchStart={() => setIsPressed(true)}
              onTouchEnd={() => setIsPressed(false)}
              className={`
                text-xs font-bold px-4 py-3 rounded-xl transition-all duration-200
                bg-gradient-to-br ${bandConfig.gradient} text-white
                hover:shadow-lg ${bandConfig.glow} active:scale-[0.98]
                focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50
                flex items-center gap-2 flex-shrink-0 hover-scale
                ${isPressed ? 'scale-95' : ''}
              `}
              title={`${commandTermInfo.definition} (Tier ${commandTermInfo.tier})`}
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">{prompt.verb}</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-5">
        {/* Question - Styled with bandConfig colors to differentiate from scenario */}
        <div className={`
          p-6 rounded-xl border-2 border-opacity-40 light:border-opacity-60 
          ${bandConfig.bg} ${bandConfig.border}
          transition-all duration-200
          hover:border-opacity-60 light:hover:border-opacity-80 hover:shadow-md ${bandConfig.glow}
          relative group
        `}>
            {/* Question Header/Actions */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-[rgb(var(--color-accent))]" />
                    <span className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-800 uppercase tracking-wide">Question</span>
                </div>
                {editingField !== 'question' && isAdmin && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onRunQualityCheck && (
                            <button 
                                onClick={() => onRunQualityCheck(prompt.question, 'question')}
                                className="text-xs flex items-center gap-1 text-emerald-400 light:text-emerald-600 hover:text-emerald-300 light:hover:text-emerald-800 bg-emerald-900/20 light:bg-emerald-100 hover:bg-emerald-900/40 light:hover:bg-emerald-200 px-2 py-1 rounded transition-all hover-scale border border-emerald-500/20"
                                title="Check quality standards"
                            >
                                <ShieldCheck className="w-3 h-3" /> QA
                            </button>
                        )}
                        <button 
                            onClick={() => startEditing('question', prompt.question)}
                            className="text-xs flex items-center gap-1 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 bg-[rgb(var(--color-bg-surface))]/50 light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface))] light:hover:bg-slate-200 px-2 py-1 rounded transition-all hover-scale"
                        >
                            <Pencil className="w-3 h-3" /> Edit
                        </button>
                    </div>
                )}
            </div>

            {/* Question Content */}
            {editingField === 'question' && isAdmin ? (
                 <div className="animate-fade-in">
                    <textarea
                        ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        className="w-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 text-[rgb(var(--color-text-primary))] light:text-slate-900 border border-[rgb(var(--color-accent))] rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50 min-h-[100px] resize-y font-serif leading-relaxed whitespace-pre-wrap"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <button onClick={cancelEdit} className="text-xs px-3 py-1.5 rounded bg-[rgb(var(--color-bg-surface))] light:bg-white hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-600 transition-colors hover-scale">Cancel</button>
                        <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded bg-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent-dark))] text-white transition-colors font-semibold flex items-center gap-1 hover-scale"><Check className="w-3 h-3"/> Save</button>
                    </div>
                </div>
            ) : (
                <div className={`text-[rgb(var(--color-text-secondary))] light:text-slate-800 font-serif leading-relaxed transition-all duration-200 whitespace-pre-wrap ${questionSizes[sizeIndex]}`}>
                    {renderedQuestion}
                </div>
            )}
        </div>
        
        {/* Scenario - Differentiated with dashed border and neutral styling */}
        {(prompt.scenario || (editingField === 'scenario' && isAdmin)) && (
          <div 
            className={`
              p-6 rounded-xl border-2 border-dashed
              border-[rgb(var(--color-border-secondary))] border-opacity-40
              light:border-slate-300 light:bg-slate-50/80
              bg-[rgb(var(--color-bg-surface-inset))]/30
              transition-all duration-200 hover:border-opacity-50 light:hover:border-slate-400
              relative group
            `}
          >
             <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-[rgb(var(--color-accent))]" />
                    <span className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-700 uppercase tracking-wide">Scenario Context</span>
                </div>
                 {editingField !== 'scenario' && isAdmin && (
                   <div className="flex items-center gap-1">
                     <button 
                        onClick={onGenerateScenario}
                        disabled={isGeneratingScenario}
                        className="text-xs flex items-center gap-1 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-[rgb(var(--color-accent))] bg-[rgb(var(--color-bg-surface))]/50 light:bg-white hover:bg-[rgb(var(--color-bg-surface))] light:hover:bg-slate-100 px-2 py-1 rounded transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover-scale"
                        title="Regenerate Scenario"
                    >
                        <Sparkles className={`w-3 h-3 ${isGeneratingScenario ? 'animate-spin' : ''}`} />
                    </button>
                    <button 
                        onClick={() => startEditing('scenario', prompt.scenario || '')}
                        className="text-xs flex items-center gap-1 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 bg-[rgb(var(--color-bg-surface))]/50 light:bg-white hover:bg-[rgb(var(--color-bg-surface))] light:hover:bg-slate-100 px-2 py-1 rounded transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hover-scale"
                    >
                        <Pencil className="w-3 h-3" /> Edit
                    </button>
                   </div>
                )}
            </div>

             {editingField === 'scenario' && isAdmin ? (
                 <div className="animate-fade-in">
                    <textarea
                        ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        className="w-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-white text-[rgb(var(--color-text-secondary))] light:text-slate-900 border border-[rgb(var(--color-accent))] rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50 min-h-[100px] resize-y font-serif leading-relaxed italic whitespace-pre-wrap"
                        placeholder="Enter a scenario..."
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <button onClick={cancelEdit} className="text-xs px-3 py-1.5 rounded bg-[rgb(var(--color-bg-surface))] light:bg-white hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-200 text-[rgb(var(--color-text-muted))] light:text-slate-600 transition-colors hover-scale">Cancel</button>
                        <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded bg-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent-dark))] text-white transition-colors font-semibold flex items-center gap-1 hover-scale"><Check className="w-3 h-3"/> Save</button>
                    </div>
                </div>
            ) : (
                <div className={`text-[rgb(var(--color-text-secondary))] light:text-slate-700 italic leading-relaxed font-serif transition-all duration-200 whitespace-pre-wrap ${scenarioSizes[sizeIndex]}`}>
                    {renderedScenario}
                </div>
            )}
          </div>
        )}
        
        {/* Generate Scenario Button - Only show if no scenario and not editing, AND is admin */}
        {!prompt.scenario && editingField !== 'scenario' && isAdmin && (
          generateScenarioError && !isGeneratingScenario ? (
            <div className="bg-red-900/30 light:bg-red-100 p-3 rounded-lg border border-red-500/50 light:border-red-300 flex items-center justify-between gap-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 light:text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-300 light:text-red-700">{generateScenarioError}</div>
              </div>
              <button 
                onClick={onGenerateScenario} 
                className="text-xs font-semibold text-white bg-red-600/50 hover:bg-red-600 px-4 py-1.5 rounded-md transition flex-shrink-0 hover-scale"
              >
                Retry
              </button>
            </div>
          ) : (
             <div className="flex gap-3">
                 <button 
                  onClick={onGenerateScenario} 
                  disabled={isGeneratingScenario}
                  className={`
                    flex-1 text-sm font-semibold py-4 px-4 rounded-xl
                    bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 text-[rgb(var(--color-text-muted))] light:text-slate-600
                    hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 
                    transition-all duration-200 flex items-center justify-center gap-3
                    border-2 border-dashed border-[rgb(var(--color-border-secondary))] light:border-slate-300
                    hover:border-[rgb(var(--color-accent))] hover:border-solid hover-lift
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${isGeneratingScenario ? 'animate-pulse' : ''}
                  `}
                >
                  {isGeneratingScenario ? (
                    <>
                      <div className="w-5 h-5 rounded-full border-2 border-[rgb(var(--color-text-muted))]/30 border-t-[rgb(var(--color-accent))] animate-spin" />
                      <span>Generating scenario...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-[rgb(var(--color-accent))]" />
                      <span>Enhance with AI Scenario</span>
                    </>
                  )}
                </button>
                 <button 
                  onClick={() => startEditing('scenario', '')}
                  className={`
                    text-sm font-semibold py-4 px-4 rounded-xl
                    bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 text-[rgb(var(--color-text-muted))] light:text-slate-600
                    hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 
                    transition-all duration-200 flex items-center justify-center gap-2
                    border-2 border-dashed border-[rgb(var(--color-border-secondary))] light:border-slate-300
                    hover:border-[rgb(var(--color-accent))] hover:border-solid hover-lift
                  `}
                  title="Manually add scenario"
                >
                    <Pencil className="w-4 h-4" />
                </button>
             </div>
          )
        )}

        {/* Linked Outcomes Section */}
        <div className="pt-6 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 border-opacity-40">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <h4 className="text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider flex items-center gap-2 flex-shrink-0">
                    <Target className="w-3.5 h-3.5 text-[rgb(var(--color-accent))]" />
                    Linked Outcomes
                </h4>
                
                {linkedOutcomes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {linkedOutcomes.map(outcome => (
                            <div key={outcome.code} className="relative group">
                                <button 
                                    onClick={() => onOutcomeClick(outcome)}
                                    className="inline-flex items-center justify-center px-3 py-1 text-xs font-bold rounded-full transition-all duration-200 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-accent))] light:text-sky-700 border border-[rgb(var(--color-accent))]/20 light:border-sky-200 hover:bg-[rgb(var(--color-accent))] light:hover:bg-sky-600 hover:text-white hover:shadow-md cursor-default select-none hover-scale"
                                >
                                    {outcome.code}
                                </button>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 text-xs text-left font-normal leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-700 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg shadow-xl light:shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 backdrop-blur-md">
                                    {outcome.description}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                     <span className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-400 italic">None identified.</span>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

const PromptDisplay: React.FC<PromptDisplayProps> = (props) => (
    <ErrorBoundary>
        <PromptDisplayContent {...props} />
    </ErrorBoundary>
);

export default PromptDisplay;
