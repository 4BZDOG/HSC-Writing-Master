import React from 'react';
import { Course } from '../../types';
import { ActionButtons } from './common';
import { GitMerge, SkipForward, AlertTriangle, ArrowLeft } from 'lucide-react';

interface ConflictResolutionViewProps {
  conflicts: Course[];
  onResolve: (resolutions: Map<string, 'merge' | 'skip'>) => void;
  onBack: () => void;
}

const ConflictResolutionView = ({
  conflicts,
  onResolve,
  onBack,
}: ConflictResolutionViewProps) => {
  const [resolutions, setResolutions] = React.useState<Map<string, 'merge' | 'skip'>>(() =>
    new Map(conflicts.map(c => [c.id, 'skip']))
  );

  const handleResolutionChange = (courseId: string, resolution: 'merge' | 'skip') => {
    setResolutions(prev => new Map(prev).set(courseId, resolution));
  };

  const handleResolveAll = (resolution: 'merge' | 'skip') => {
    setResolutions(new Map(conflicts.map(c => [c.id, resolution])));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-6 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex-shrink-0 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[rgb(var(--color-text-primary))] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Conflict Resolution
            </h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mt-1">{conflicts.length} items already exist.</p>
          </div>
          <button onClick={onBack} className="text-xs font-bold text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back
          </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-6">
          <div className="flex justify-end gap-3 mb-4">
                <button onClick={() => handleResolveAll('merge')} className="text-xs font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/20 transition-all flex items-center gap-2">
                <GitMerge className="w-3.5 h-3.5" /> Merge All
                </button>
                <button onClick={() => handleResolveAll('skip')} className="text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-all flex items-center gap-2">
                <SkipForward className="w-3.5 h-3.5" /> Skip All
                </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
            {conflicts.map(course => {
                const action = resolutions.get(course.id);
                return (
                    <div key={course.id} className={`p-4 rounded-xl border transition-all ${action === 'merge' ? 'bg-blue-500/5 border-blue-500/30' : 'bg-amber-500/5 border-amber-500/30'}`}>
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-bold text-[rgb(var(--color-text-primary))] text-sm">{course.name}</p>
                                <p className="text-xs text-[rgb(var(--color-text-muted))] font-mono mt-0.5">{course.id}</p>
                            </div>
                            <div className="flex items-center bg-[rgb(var(--color-bg-surface))] rounded-lg p-1 border border-[rgb(var(--color-border-secondary))]">
                                <button
                                    onClick={() => handleResolutionChange(course.id, 'merge')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${action === 'merge' ? 'bg-blue-500 text-white shadow-sm' : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]'}`}
                                >
                                    <GitMerge className="w-3 h-3" /> Merge
                                </button>
                                <button
                                    onClick={() => handleResolutionChange(course.id, 'skip')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${action === 'skip' ? 'bg-amber-500 text-white shadow-sm' : 'text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]'}`}
                                >
                                    <SkipForward className="w-3 h-3" /> Skip
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 text-xs opacity-80">
                            {action === 'merge' 
                                ? <span className="text-blue-400">Update existing course with new content.</span> 
                                : <span className="text-amber-400">Ignore imported data for this course.</span>
                            }
                        </div>
                    </div>
                );
            })}
          </div>
      </div>
      
      <ActionButtons
        onCancel={onBack}
        onConfirm={() => onResolve(resolutions)}
        confirmText="Confirm Resolution"
      />
    </div>
  );
};

export default ConflictResolutionView;