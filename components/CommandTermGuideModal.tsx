import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CommandTermInfo } from '../types';
import { X, Info, Award, Target, Hash, Zap, ChevronRight } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface CommandTermGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  termInfo: CommandTermInfo;
}

const CommandTermGuideModal: React.FC<CommandTermGuideModalProps> = ({ isOpen, onClose, termInfo }) => {
  const bandConfig = getBandConfig(termInfo.tier);

  useEffect(() => {
    if (!isOpen) return;
    
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose, isOpen]);

  if (!isOpen) return null;
  
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleCloseKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-term-title"
    >
      <div className={`
        w-full max-w-3xl rounded-2xl
        border-2 ${bandConfig.border} ${bandConfig.glow}
        bg-[rgb(var(--color-bg-surface))]/95
        animate-fade-in-up
        overflow-hidden flex flex-col max-h-[90vh]
      `} onClick={e => e.stopPropagation()}>
        
        {/* Hero Header - Matching PromptGeneratorModal Style */}
        <div className={`
          px-6 py-5 border-b-2 ${bandConfig.border} border-opacity-40
          bg-gradient-to-r ${bandConfig.gradient} relative overflow-hidden flex-shrink-0
        `}>
            <div className="absolute inset-0 bg-white/10 mix-blend-overlay opacity-20"></div>
            
            <div className="flex justify-between items-center relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner border border-white/30">
                    <Info className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h2 id="command-term-title" className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                        {termInfo.term}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5 text-white/90 font-medium text-sm">
                        <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Tier {termInfo.tier}</span>
                        <span>•</span>
                        <span>{termInfo.markRange.join('-')} Marks</span>
                    </div>
                </div>
              </div>
              
              <button 
                onClick={onClose}
                onKeyDown={handleCloseKeyDown}
                className="w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 transition-all duration-200 flex items-center justify-center group backdrop-blur-sm"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Definition */}
          <div className={`
            p-5 rounded-xl border-2 ${bandConfig.border} border-opacity-30 
            bg-[rgb(var(--color-bg-surface-inset))]/30
            transition-all duration-200 hover:border-opacity-50 hover:shadow-md ${bandConfig.glow}
          `}>
            <div className="flex items-center gap-3 mb-3">
              <Zap className={`w-5 h-5 ${bandConfig.text}`} />
              <h3 className="text-sm font-bold text-[rgb(var(--color-text-primary))] uppercase tracking-wider">
                Definition
              </h3>
            </div>
            <p className="text-lg text-[rgb(var(--color-text-secondary))] italic leading-relaxed font-serif">
              "{termInfo.definition}"
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`
              p-4 rounded-xl border ${bandConfig.border} bg-[rgb(var(--color-bg-surface-inset))]/50
              text-center transition-all duration-200 hover:border-opacity-100
            `}>
              <div className={`w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center ${bandConfig.iconBg} border ${bandConfig.border}`}>
                <Target className={`w-5 h-5 ${bandConfig.text}`} />
              </div>
              <p className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1">Cognitive Tier</p>
              <p className={`font-black text-2xl ${bandConfig.text}`}>{termInfo.tier}</p>
            </div>
            
            <div className={`
              p-4 rounded-xl border ${bandConfig.border} bg-[rgb(var(--color-bg-surface-inset))]/50
              text-center transition-all duration-200 hover:border-opacity-100
            `}>
              <div className={`w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center ${bandConfig.iconBg} border ${bandConfig.border}`}>
                <Hash className={`w-5 h-5 ${bandConfig.text}`} />
              </div>
              <p className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1">Mark Range</p>
              <p className={`font-black text-2xl ${bandConfig.text}`}>{termInfo.markRange.join('-')}</p>
            </div>
            
            <div className={`
              p-4 rounded-xl border ${bandConfig.border} bg-[rgb(var(--color-bg-surface-inset))]/50
              text-center transition-all duration-200 hover:border-opacity-100
            `}>
              <div className={`w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center ${bandConfig.iconBg} border ${bandConfig.border}`}>
                <Award className={`w-5 h-5 ${bandConfig.text}`} />
              </div>
              <p className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1">Target Bands</p>
              <p className={`font-black text-2xl ${bandConfig.text}`}>{termInfo.targetBands}</p>
            </div>
          </div>

          {/* Band Discrimination */}
          <div className={`
            p-5 rounded-xl border ${bandConfig.border} bg-[rgb(var(--color-bg-surface-inset))]/30
          `}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] uppercase tracking-wider mb-3">
              <ChevronRight className={`w-4 h-4 ${bandConfig.text}`} />
              Discrimination Factors
            </h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed pl-6 border-l-2 border-[rgb(var(--color-border-secondary))]">
              {termInfo.bandDiscrimination}
            </p>
          </div>

          {/* Generic Marking Guide */}
          <div className={`
            p-5 rounded-xl border ${bandConfig.border} bg-[rgb(var(--color-bg-surface-inset))]/30
          `}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-[rgb(var(--color-text-primary))] uppercase tracking-wider mb-3">
              <Award className={`w-4 h-4 ${bandConfig.text}`} />
              NESA Marking Guide
            </h3>
            <ul className="space-y-2">
              {termInfo.genericMarkingGuide.map((criterion, index) => (
                <li 
                  key={index} 
                  className={`
                    flex items-start gap-3 p-3 rounded-lg
                    bg-[rgb(var(--color-bg-surface))]/80
                    border-l-4 ${bandConfig.border} border-opacity-60
                    transition-all duration-200 hover:translate-x-1 shadow-sm
                  `}
                >
                  <span className={`text-xs font-bold ${bandConfig.text} mt-0.5 min-w-[20px]`}>{(index + 1).toString().padStart(2, '0')}</span>
                  <span className="text-sm text-[rgb(var(--color-text-secondary))] leading-relaxed font-medium">
                    {criterion}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/30 border-t border-[rgb(var(--color-border-secondary))] flex justify-end">
            <button 
                onClick={onClose}
                className={`
                    px-6 py-2.5 rounded-xl font-bold text-white shadow-lg
                    bg-gradient-to-r ${bandConfig.gradient}
                    hover:shadow-lg hover:brightness-110 active:scale-95 transition-all
                `}
            >
                Done
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandTermGuideModal;