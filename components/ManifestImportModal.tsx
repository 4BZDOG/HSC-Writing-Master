
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DiscoveredDoc } from '../hooks/useSyllabusData';
import { CheckSquare, Square, Download, FileJson, Sparkles, Loader2, AlertCircle } from 'lucide-react';

interface ManifestImportModalProps {
  isOpen: boolean;
  onClose: () => void; // Allows closing without import (empty state)
  discoveredDocs: DiscoveredDoc[];
  onImport: (selectedIds: Set<string>) => Promise<boolean>;
}

const ManifestImportModal: React.FC<ManifestImportModalProps> = ({
  isOpen,
  onClose,
  discoveredDocs,
  onImport
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize selection with all docs that were pre-flagged as selected
  useEffect(() => {
      if (isOpen && discoveredDocs.length > 0) {
          const initialSelected = new Set<string>();
          discoveredDocs.forEach(d => {
              if (d.selected) initialSelected.add(d.id);
          });
          setSelectedIds(initialSelected);
          setError(null);
      }
  }, [isOpen, discoveredDocs]);

  const toggleSelect = (id: string) => {
      if (isImporting) return;
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
      if (isImporting) return;
      if (selectedIds.size === discoveredDocs.length) {
          setSelectedIds(new Set());
      } else {
          const newSet = new Set<string>();
          discoveredDocs.forEach(d => newSet.add(d.id));
          setSelectedIds(newSet);
      }
  };
  
  const handleImportClick = async () => {
      if (selectedIds.size === 0) return;
      
      setIsImporting(true);
      setError(null);
      
      try {
          const success = await onImport(selectedIds);
          if (success) {
              // Only close on success. The hook will clear the data which might unmount this if controlled by parent,
              // but explicit close ensures UI consistency.
              onClose();
          } else {
              setError("Import failed. Please try again.");
          }
      } catch (e) {
          setError(e instanceof Error ? e.message : "An unexpected error occurred.");
      } finally {
          setIsImporting(false);
      }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
      <div className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-2xl border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg">
                    <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-[rgb(var(--color-text-primary))]">Welcome to HSC AI Evaluator</h2>
                    <p className="text-sm text-[rgb(var(--color-text-muted))] mt-1">Select the courses you would like to load to get started.</p>
                </div>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-[rgb(var(--color-text-secondary))] uppercase tracking-wider">Available Courses ({discoveredDocs.length})</span>
                <button 
                    onClick={toggleSelectAll}
                    disabled={isImporting}
                    className={`text-xs font-semibold transition-colors ${isImporting ? 'text-[rgb(var(--color-text-muted))] opacity-50 cursor-not-allowed' : 'text-[rgb(var(--color-accent))] hover:text-white'}`}
                >
                    {selectedIds.size === discoveredDocs.length ? 'Deselect All' : 'Select All'}
                </button>
            </div>

            <div className="space-y-3">
                {discoveredDocs.map(doc => {
                    const isSelected = selectedIds.has(doc.id);
                    return (
                        <div 
                            key={doc.id}
                            onClick={() => toggleSelect(doc.id)}
                            className={`
                                flex items-start gap-4 p-4 rounded-xl border transition-all duration-200 cursor-pointer group
                                ${isSelected 
                                    ? 'bg-[rgb(var(--color-bg-surface-inset))] border-[rgb(var(--color-accent))] shadow-sm' 
                                    : 'bg-transparent border-[rgb(var(--color-border-secondary))] hover:bg-[rgb(var(--color-bg-surface-light))]/50'
                                }
                                ${isImporting ? 'opacity-60 pointer-events-none' : ''}
                            `}
                        >
                            <div className={`mt-1 text-[rgb(var(--color-text-muted))] ${isSelected ? 'text-[rgb(var(--color-accent))]' : ''}`}>
                                {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className={`text-base font-bold ${isSelected ? 'text-white' : 'text-[rgb(var(--color-text-primary))]'}`}>
                                    {doc.name}
                                </h4>
                                <div className="flex items-center gap-2 mt-1 text-xs text-[rgb(var(--color-text-muted))]">
                                    <FileJson className="w-3.5 h-3.5" />
                                    <span className="truncate">{doc.source}</span>
                                    <span className="w-1 h-1 rounded-full bg-[rgb(var(--color-border-secondary))]"></span>
                                    <span>{doc.data.topics?.length || 0} Topics</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm animate-fade-in">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 bg-[rgb(var(--color-bg-surface-inset))]/30 border-t border-[rgb(var(--color-border-secondary))] flex justify-between items-center">
            <button 
                onClick={onClose}
                disabled={isImporting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[rgb(var(--color-text-muted))] hover:text-white transition-colors hover:bg-[rgb(var(--color-bg-surface-light))] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Skip (Start Empty)
            </button>
            <button 
                onClick={handleImportClick}
                disabled={selectedIds.size === 0 || isImporting}
                className={`
                    px-6 py-2.5 rounded-xl font-bold text-white shadow-lg transition-all flex items-center gap-2
                    ${selectedIds.size > 0 && !isImporting
                        ? 'bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] hover:shadow-[rgb(var(--color-primary))/0.3] hover:scale-[1.02] active:scale-95' 
                        : 'bg-[rgb(var(--color-bg-surface-light))] text-opacity-50 cursor-not-allowed'
                    }
                `}
            >
                {isImporting ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing...
                    </>
                ) : (
                    <>
                        <Download className="w-4 h-4" />
                        Import {selectedIds.size} Course{selectedIds.size !== 1 ? 's' : ''}
                    </>
                )}
            </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ManifestImportModal;
