import React, { useState, useMemo } from 'react';
import { Topic, DataValidationResult } from '../types';
import {
  analyzeAndSanitizeImportData,
  generateValidationReport,
  buildTree,
  regenerateTopicIds,
} from '../utils/dataManagerUtils';
import FileDropzone from './dataManager/FileDropzone';
import ValidationSummary from './dataManager/ValidationSummary';
import { ModalHeader, ActionButtons } from './dataManager/common';
import { UploadCloud, X, Award } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface TopicImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (topic: Topic) => void;
  courseName: string;
}

const TopicImportModal: React.FC<TopicImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  courseName,
}) => {
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

  // Escape closes this modal like every other modal surface — through the
  // same reset path as the X/Cancel buttons.
  useEscapeKey(isOpen, handleClose);

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
        const tempCourseWrapper = {
          id: 'temp-course',
          name: 'Import Preview',
          outcomes: [],
          topics: [validatedTopic],
        };
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
          subTopics: finalTopic.subTopics.map((st) => ({
            ...st,
            dotPoints: st.dotPoints.map((dp) => ({
              ...dp,
              prompts: dp.prompts.map((p) => ({
                ...p,
                isPastHSC: true,
                hscYear: year || p.hscYear,
              })),
            })),
          })),
        };
      }

      onImport(finalTopic);
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <UploadCloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Import Topic
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  into "{courseName}"
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        <div className="flex-grow p-6 flex flex-col overflow-hidden bg-[rgb(var(--color-bg-surface))] light:bg-white">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                Select a single topic JSON file to add to the current course.
              </p>
              <FileDropzone onFileDrop={handleFileDrop} />
              {fileName && (
                <p className="text-center text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-2">
                  Selected file: {fileName}
                </p>
              )}
              {error && (
                <p className="text-center text-sm text-red-400 light:text-red-600 mt-2 bg-red-900/20 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200">
                  {error}
                </p>
              )}
            </div>
          )}

          {step === 'preview' && validationReport && importedTopic && (
            <div className="space-y-5 h-full flex flex-col overflow-hidden">
              <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                Review the contents of "{fileName}" before importing.
              </p>

              {/* Bulk Settings */}
              <div
                className={`rounded-xl border transition-colors ${
                  markAsPastHSC
                    ? 'border-amber-500/30 light:border-amber-200 bg-amber-500/5 light:bg-amber-50/50'
                    : 'border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50'
                }`}
              >
                <label className="flex items-center justify-between cursor-pointer p-4">
                  <div className="flex items-center gap-2.5 text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    <Award className="w-4 h-4 text-amber-400 light:text-amber-500" />
                    <span>Mark as Past HSC Questions</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={markAsPastHSC}
                    onChange={(e) => setMarkAsPastHSC(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-700 light:bg-white border-gray-600 light:border-slate-300 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]/50"
                  />
                </label>
                {markAsPastHSC && (
                  <div className="px-4 pb-4 pt-0 flex items-center gap-3 animate-fade-in">
                    <div className="ml-7 pl-3 border-l-2 border-amber-500/30 light:border-amber-200 flex items-center gap-2">
                      <span className="text-xs font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500">
                        Year:
                      </span>
                      <input
                        type="number"
                        value={bulkYear}
                        onChange={(e) => setBulkYear(e.target.value)}
                        placeholder="e.g. 2023"
                        className="w-24 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex-grow overflow-y-auto pr-2 -mr-2">
                <ValidationSummary result={validationReport} />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3 flex-shrink-0">
          {step === 'preview' ? (
            <>
              <button
                onClick={resetState}
                className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
              >
                Back
              </button>
              <button
                onClick={handleConfirmImport}
                className="py-2.5 px-5 rounded-lg text-sm text-white font-semibold bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition"
              >
                Import "{importedTopic?.name}"
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopicImportModal;
