
import React, { useState, useMemo } from 'react';
import { Topic, DataValidationResult } from '../types';
import { analyzeAndSanitizeImportData, generateValidationReport, buildTree, regenerateTopicIds } from '../utils/dataManagerUtils';
import FileDropzone from './dataManager/FileDropzone';
import ValidationSummary from './dataManager/ValidationSummary';
import { ModalHeader, ActionButtons } from './dataManager/common';
import { UploadCloud, X, Award } from 'lucide-react';

interface TopicImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (topic: Topic) => void;
  courseName: string;
}

const TopicImportModal: React.FC<TopicImportModalProps> = ({ isOpen, onClose, onImport, courseName }) => {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [importedTopic, setImportedTopic] = useState<Topic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validationReport, setValidationReport] = useState<DataValidationResult | null>(null);
  
  // Bulk Settings
  const [markAsPastHSC, setMarkAsPastHSC] = useState(false);
  const [bulkYear, setBulkYear] = useState('');

  const resetState = () => {
    setStep('upload');
    setImportedTopic(null);
    setError(null);
    setFileName(null);
    setValidationReport(null);
    setMarkAsPastHSC(false);
    setBulkYear('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileDrop = (file: File) => {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rawData = JSON.parse(text);
        
        const analysis = analyzeAndSanitizeImportData(rawData);

        if (analysis.type !== 'topic' || analysis.error) {
            setError(analysis.error || 'The imported file is not a valid single topic object.');
            setFileName(null);
            return;
        }
        
        const validatedTopic = analysis.data as Topic;
        const tempCourseWrapper = { id: 'temp-course', name: 'Import Preview', outcomes: [], topics: [validatedTopic] };
        const report = generateValidationReport([tempCourseWrapper]);
        
        if (!report.isValid) {
            setError(`The file has structural errors: ${report.errors.join(', ')}`);
            setFileName(null);
            return;
        }

        setImportedTopic(validatedTopic);
        setValidationReport(report);
        setStep('preview');
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse JSON file.');
        setFileName(null);
      }
    };
    reader.onerror = () => setError('Error reading file.');
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (importedTopic) {
      let finalTopic = importedTopic;
      
      if (markAsPastHSC) {
          const year = bulkYear ? parseInt(bulkYear) : undefined;
          finalTopic = {
              ...finalTopic,
              subTopics: finalTopic.subTopics.map(st => ({
                  ...st,
                  dotPoints: st.dotPoints.map(dp => ({
                      ...dp,
                      prompts: dp.prompts.map(p => ({
                          ...p,
                          isPastHSC: true,
                          hscYear: year || p.hscYear
                      }))
                  }))
              }))
          };
      }
      
      onImport(finalTopic);
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-2xl border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <UploadCloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">Import Topic</h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">into "{courseName}"</p>
              </div>
            </div>
            <button onClick={handleClose} className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group">
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
            </button>
          </div>
        </div>

        <div className="flex-grow p-6 flex flex-col overflow-hidden">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">Select a single topic JSON file to add to the current course.</p>
              <FileDropzone onFileDrop={handleFileDrop} />
              {fileName && <p className="text-center text-sm text-gray-400 mt-2">Selected file: {fileName}</p>}
              {error && <p className="text-center text-sm text-red-400 mt-2 bg-red-900/20 p-3 rounded-lg">{error}</p>}
            </div>
          )}

          {step === 'preview' && validationReport && importedTopic && (
            <div className="space-y-4 h-full flex flex-col overflow-hidden">
                <p className="text-sm text-[rgb(var(--color-text-secondary))]">Review the contents of "{fileName}" before importing.</p>
                
                 {/* Bulk Settings */}
                <div className="p-4 bg-[rgb(var(--color-bg-surface-inset))]/30 rounded-xl border border-[rgb(var(--color-border-secondary))]">
                    <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-2 text-sm text-[rgb(var(--color-text-primary))]">
                            <Award className="w-4 h-4 text-amber-400" />
                            <span>Mark as Past HSC Questions</span>
                        </div>
                        <input 
                            type="checkbox" 
                            checked={markAsPastHSC}
                            onChange={e => setMarkAsPastHSC(e.target.checked)}
                            className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-[rgb(var(--color-accent))]"
                        />
                    </label>
                    {markAsPastHSC && (
                         <div className="mt-3 flex items-center gap-2 animate-fade-in pl-2 border-l-2 border-[rgb(var(--color-border-secondary))]">
                             <span className="text-xs text-[rgb(var(--color-text-muted))]">Year:</span>
                             <input 
                                type="number" 
                                value={bulkYear}
                                onChange={e => setBulkYear(e.target.value)}
                                placeholder="e.g. 2023"
                                className="w-24 bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded px-2 py-1 text-sm focus:outline-none focus:border-[rgb(var(--color-accent))]"
                             />
                         </div>
                    )}
                </div>

                <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                    <ValidationSummary result={validationReport} />
                </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3">
          {step === 'preview' ? (
            <>
              <button onClick={resetState} className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition">
                Back
              </button>
              <button onClick={handleConfirmImport} className="py-2.5 px-5 rounded-lg text-white font-semibold bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg transition">
                Import "{importedTopic?.name}"
              </button>
            </>
          ) : (
            <button onClick={handleClose} className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopicImportModal;
