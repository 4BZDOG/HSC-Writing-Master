import React, { useState } from 'react';
import { CourseOutcome } from '../types';
import { BookOpen, Plus, Trash2, X } from 'lucide-react';

interface CourseCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCourseCreated: (newCourseName: string, outcomes: CourseOutcome[]) => void;
}

const CourseCreatorModal: React.FC<CourseCreatorModalProps> = ({
  isOpen,
  onClose,
  onCourseCreated,
}) => {
  const [courseName, setCourseName] = useState('');
  const [outcomes, setOutcomes] = useState<CourseOutcome[]>([{ code: '', description: '' }]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim()) {
      setError('Please enter a course name.');
      return;
    }
    const validOutcomes = outcomes.filter(
      (o) => o.code.trim() !== '' && o.description.trim() !== ''
    );
    onCourseCreated(courseName.trim(), validOutcomes);
    handleClose();
  };

  const handleAddOutcome = () => {
    setOutcomes([...outcomes, { code: '', description: '' }]);
  };

  const handleDeleteOutcome = (index: number) => {
    setOutcomes(outcomes.filter((_, i) => i !== index));
  };

  const handleOutcomeChange = (index: number, field: keyof CourseOutcome, value: string) => {
    const newOutcomes = [...outcomes];
    newOutcomes[index][field] = value;
    setOutcomes(newOutcomes);
  };

  const handleClose = () => {
    setCourseName('');
    setOutcomes([{ code: '', description: '' }]);
    setError(null);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50">
          {/* Cubic Mesh Texture Overlay */}
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Create New Course
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  Define a course and its syllabus outcomes.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900" />
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-grow flex flex-col overflow-hidden bg-[rgb(var(--color-bg-surface))] light:bg-white"
        >
          <div className="p-6 space-y-6 flex-grow overflow-y-auto">
            <div>
              <label
                htmlFor="course-name"
                className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-700 mb-2"
              >
                Course Name
              </label>
              <input
                type="text"
                id="course-name"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                className="block w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg shadow-sm py-3 px-4 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                placeholder="e.g., HSC Chemistry"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] light:text-slate-700 mb-2">
                Syllabus Outcomes
              </label>
              <div className="space-y-3">
                {outcomes.map((outcome, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-2 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 p-3 rounded-lg border border-[rgb(var(--color-border-secondary))] light:border-slate-200"
                  >
                    <input
                      type="text"
                      value={outcome.code}
                      onChange={(e) => handleOutcomeChange(index, 'code', e.target.value)}
                      placeholder="Code (e.g., SE-12-01)"
                      className="bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-md py-2 px-3 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-1/3 font-mono text-sm"
                    />
                    <textarea
                      value={outcome.description}
                      onChange={(e) => handleOutcomeChange(index, 'description', e.target.value)}
                      placeholder="Outcome description..."
                      rows={1}
                      className="bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-md py-2 px-3 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-2/3 text-sm resize-y min-h-[42px]"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteOutcome(index)}
                      className="p-2 text-gray-500 hover:text-red-400 transition rounded-md h-full flex items-center bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-200 hover:bg-red-500/10"
                      title="Delete Outcome"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddOutcome}
                  className="w-full py-2 px-4 rounded-lg text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10 hover:bg-[rgb(var(--color-accent))]/20 transition text-sm font-semibold border border-dashed border-[rgb(var(--color-accent))]/30 hover:border-[rgb(var(--color-accent))]/50"
                >
                  <Plus className="inline w-4 h-4 mr-1" /> Add Outcome
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p className="px-6 text-red-400 light:text-red-600 text-sm bg-red-900/30 light:bg-red-50 p-3 rounded-md mx-6 border border-red-500/20 light:border-red-200">
              {error}
            </p>
          )}

          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!courseName.trim()}
              className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50"
            >
              Create Course
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CourseCreatorModal;
