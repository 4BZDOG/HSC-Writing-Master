import React from 'react';
import { DataValidationResult } from '../../types';
import { CheckCircle, AlertTriangle, XCircle, FileText, Folder, Hash, BookOpen, ListTree } from 'lucide-react';

interface ValidationSummaryProps {
  result: DataValidationResult;
}

interface StatItemProps {
  label: string;
  value: string | number;
  icon: any;
}

const StatItem = ({ label, value, icon: Icon }: StatItemProps) => (
    <div className="flex items-center justify-between p-3 rounded-xl bg-[rgb(var(--color-bg-surface-elevated))]/40 border border-[rgb(var(--color-border-secondary))] w-full transition-all duration-200 hover:bg-[rgb(var(--color-bg-surface-elevated))]/60 hover:border-[rgb(var(--color-border-primary))] group">
        <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-accent))] group-hover:bg-[rgb(var(--color-accent))]/10 transition-colors">
                <Icon className="w-4 h-4" />
             </div>
             <span className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-secondary))]">{label}</span>
        </div>
        <span className="text-xl font-black text-[rgb(var(--color-text-primary))] font-mono">{value}</span>
    </div>
);

const ValidationSummary = ({ result }: ValidationSummaryProps) => {
  return (
    <div className={`p-6 rounded-2xl border ${result.isValid ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'} animate-fade-in`}>
      <div className="flex items-center gap-4 mb-6">
        <div className={`p-2.5 rounded-full shadow-sm ${result.isValid ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
             {result.isValid ? <CheckCircle className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
        </div>
        <div>
            <h4 className={`text-base font-bold ${result.isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.isValid ? 'Validation Passed' : 'Validation Failed'}
            </h4>
            <p className="text-xs text-[rgb(var(--color-text-secondary))] mt-0.5">Structure analysis complete.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-6">
        <StatItem label="Courses" value={result.stats.totalCourses} icon={BookOpen} />
        <StatItem label="Topics" value={result.stats.totalTopics} icon={Folder} />
        <StatItem label="Sub-topics" value={result.stats.totalSubTopics} icon={ListTree} />
        <StatItem label="Points" value={result.stats.totalDotPoints} icon={Hash} />
        <StatItem label="Questions" value={result.stats.totalPrompts} icon={FileText} />
      </div>

      {result.errors.length > 0 && (
        <div className="mb-4 bg-red-500/10 rounded-xl p-4 border border-red-500/20">
          <h5 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2"><XCircle className="w-3.5 h-3.5" /> Critical Errors</h5>
          <ul className="space-y-2">
            {result.errors.slice(0, 5).map((err, i) => (
                <li key={i} className="text-xs text-red-300 flex items-start gap-2 bg-red-500/5 p-2 rounded border border-red-500/10">
                    <span className="opacity-50 mt-0.5 select-none">•</span> 
                    <span className="leading-relaxed">{err}</span>
                </li>
            ))}
            {result.errors.length > 5 && <li className="text-xs text-red-400 italic pl-2">...and {result.errors.length - 5} more.</li>}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
          <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> Warnings</h5>
          <ul className="space-y-2">
            {result.warnings.slice(0, 5).map((warn, i) => (
                <li key={i} className="text-xs text-amber-200/80 flex items-start gap-2 bg-amber-500/5 p-2 rounded border border-amber-500/10">
                    <span className="opacity-50 mt-0.5 select-none">•</span> 
                    <span className="leading-relaxed">{warn}</span>
                </li>
            ))}
             {result.warnings.length > 5 && <li className="text-xs text-amber-400 italic pl-2">...and {result.warnings.length - 5} more.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ValidationSummary;