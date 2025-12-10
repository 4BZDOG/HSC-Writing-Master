
import React from 'react';

interface CognitiveSpectrumProps {
  tier: number;
  term?: string;
  className?: string;
  showLabel?: boolean;
}

const CognitiveSpectrum: React.FC<CognitiveSpectrumProps> = ({ tier, term, className = '', showLabel = true }) => {
    const tiers = [1, 2, 3, 4, 5, 6];
    
    const getTierColor = (t: number, active: boolean) => {
        if (!active) return 'bg-[rgb(var(--color-bg-surface-inset))] border-transparent opacity-30';
        switch(t) {
            case 1: return 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]';
            case 2: return 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]';
            case 3: return 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]';
            case 4: return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]';
            case 5: return 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]';
            case 6: return 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.4)]';
            default: return 'bg-gray-500';
        }
    };

    return (
        <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/30 border border-[rgb(var(--color-border-secondary))]/50 ${className}`}>
            {showLabel && term && (
                <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-widest leading-none mb-1">
                        Syllabus Scope
                    </span>
                    <span className="text-xs font-black text-white leading-none tracking-tight">
                        {term}
                    </span>
                </div>
            )}
            <div className="flex gap-0.5 items-end h-4">
                {tiers.map(t => (
                    <div 
                        key={t}
                        className={`
                            w-1.5 rounded-sm transition-all duration-300
                            ${getTierColor(t, t <= tier)}
                        `}
                        style={{ 
                            height: t <= tier ? `${40 + (t * 10)}%` : '30%',
                        }}
                        title={t <= tier ? `Tier ${t}: Within Scope` : `Tier ${t}: Beyond Scope`}
                    />
                ))}
            </div>
        </div>
    );
};

export default CognitiveSpectrum;
