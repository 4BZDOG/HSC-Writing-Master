import React from 'react';
import { DataValidationResult } from '../../types';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  Folder,
  Hash,
  BookOpen,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';

interface ValidationSummaryProps {
  result: DataValidationResult;
}

interface StatItemProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
}

const StatItem = ({ label, value, icon: Icon, color }: StatItemProps) => (
  <div className="flex items-center justify-between p-5 rounded-panel bg-white/[0.03] light:bg-slate-50 border border-white/5 light:border-slate-200 w-full transition-all duration-300 hover:bg-white/[0.05] light:hover:bg-slate-100 hover:border-white/10 light:hover:border-slate-300 group">
    <div className="flex items-center gap-4">
      <div
        className={`p-2.5 rounded-xl bg-black/40 light:bg-slate-100 border border-white/5 light:border-slate-200 ${color} transition-transform group-hover:-rotate-6 shadow-inner`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <span className="t-label text-slate-500 light:text-slate-500 group-hover:text-slate-300 light:group-hover:text-slate-700 transition-colors">
        {label}
      </span>
    </div>
    <span className="text-2xl font-black text-white light:text-slate-900 tracking-tighter tabular-nums">
      {value}
    </span>
  </div>
);

const ValidationSummary = ({ result }: ValidationSummaryProps) => {
  const isHealthy = result.isValid && result.warnings.length === 0;

  return (
    <div
      className={`p-8 rounded-panel border transition-all duration-700 animate-fade-in ${result.isValid ? 'border-emerald-500/10 bg-emerald-500/[0.02]' : 'border-red-500/10 bg-red-500/[0.02]'}`}
    >
      <div className="flex items-center gap-6 mb-10">
        <div
          className={`p-4 rounded-panel shadow-lg flex items-center justify-center relative overflow-hidden group/status ${result.isValid ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse opacity-0 group-hover/status:opacity-100 transition-opacity" />
          {result.isValid ? (
            <CheckCircle className="h-8 w-8 relative z-10" />
          ) : (
            <XCircle className="h-8 w-8 relative z-10" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className={`t-label ${result.isValid ? 'text-emerald-500' : 'text-red-500'}`}>
              Validation
            </span>
            <div
              className={`h-1 w-1 rounded-full ${result.isValid ? 'bg-emerald-500' : 'bg-red-500'}`}
            />
          </div>
          <h4 className="text-2xl font-black text-white light:text-slate-900 tracking-tight italic">
            {result.isValid
              ? result.warnings.length > 0
                ? 'Valid with Warnings'
                : 'All Valid'
              : 'Validation Failed'}
          </h4>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <StatItem
          label="Courses"
          value={result.stats.totalCourses}
          icon={BookOpen}
          color="text-sky-400"
        />
        <StatItem
          label="Topics"
          value={result.stats.totalTopics}
          icon={Folder}
          color="text-purple-400"
        />
        <StatItem
          label="Dot Points"
          value={result.stats.totalDotPoints}
          icon={Hash}
          color="text-indigo-400"
        />
        <StatItem
          label="Questions"
          value={result.stats.totalPrompts}
          icon={FileText}
          color="text-emerald-400"
        />
      </div>

      {result.errors.length > 0 && (
        <div className="mb-6 bg-red-500/5 rounded-panel p-6 border border-red-500/20">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-1.5 rounded-lg bg-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
            <h5 className="t-label text-red-500">Errors</h5>
          </div>
          <ul className="space-y-3">
            {result.errors.slice(0, 5).map((err, i) => (
              <li
                key={i}
                className="text-xs text-red-300 light:text-red-700 flex items-start gap-4 bg-black/20 light:bg-red-50 p-4 rounded-2xl border border-red-500/10 light:border-red-200"
              >
                <span className="text-red-500 font-mono font-bold">[{i + 1}]</span>
                <span className="leading-relaxed font-medium">{err}</span>
              </li>
            ))}
            {result.errors.length > 5 && (
              <li className="text-xs text-red-500/60 light:text-red-400 font-semibold pl-4">
                +{result.errors.length - 5} more error{result.errors.length - 5 === 1 ? '' : 's'}
              </li>
            )}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="bg-amber-500/5 rounded-panel p-6 border border-amber-500/20">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-1.5 rounded-lg bg-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <h5 className="t-label text-amber-500">Warnings</h5>
          </div>
          <ul className="space-y-3">
            {result.warnings.slice(0, 5).map((warn, i) => (
              <li
                key={i}
                className="text-xs text-amber-200 light:text-amber-800 flex items-start gap-4 bg-black/20 light:bg-amber-50 p-4 rounded-2xl border border-amber-500/10 light:border-amber-200"
              >
                <span className="text-amber-500 font-mono font-bold">[{i + 1}]</span>
                <span className="leading-relaxed font-medium">{warn}</span>
              </li>
            ))}
            {result.warnings.length > 5 && (
              <li className="text-xs text-amber-500/60 light:text-amber-400 font-semibold pl-4">
                +{result.warnings.length - 5} more warning
                {result.warnings.length - 5 === 1 ? '' : 's'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ValidationSummary;
