
import React, { useMemo } from 'react';
import { Course } from '../../types';
import SelectionTree from '../SelectionTree';
import { useSelectionTree } from '../../hooks/useSelectionTree';
import { buildTree, filterDataBySelection } from '../../utils/dataManagerUtils';
import { ActionButtons } from './common';

interface ExportFlowProps {
  courses: Course[];
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ExportFlow: React.FC<ExportFlowProps> = ({ courses, onClose, showToast }) => {
  const treeData = useMemo(() => buildTree(courses), [courses]);
  const {
    selectedIds,
    expandedIds,
    handleToggleSelect,
    handleToggleExpand,
    selectAll,
    deselectAll
  } = useSelectionTree(treeData);

  const handleExport = () => {
    const dataToExport = filterDataBySelection(courses, selectedIds);
    
    // Generate User-Friendly Filename
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateStr = `${day}${month}${year}`;

    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '');

    let filename = `HSCExport_${dateStr}`;

    if (dataToExport.length === 1) {
        const course = dataToExport[0];
        const courseName = sanitize(course.name);
        if (course.topics.length === 1) {
            const topicName = sanitize(course.topics[0].name);
            filename = `${courseName}${topicName}${dateStr}`;
        } else {
            filename = `${courseName}${dateStr}`;
        }
    } else if (dataToExport.length > 1) {
        filename = `HSCMultipleCourses${dateStr}`;
    }

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Export started successfully.", "success");
    onClose();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-6 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex-shrink-0">
          <h3 className="text-lg font-bold text-[rgb(var(--color-text-primary))]">Export Content</h3>
          <p className="text-sm text-[rgb(var(--color-text-secondary))]">Select data to export to a JSON file.</p>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-6">
          <div className="px-4 py-3 bg-[rgb(var(--color-bg-surface-elevated))]/50 border border-[rgb(var(--color-border-secondary))] rounded-t-xl flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">{selectedIds.size} items selected</span>
                <div className="flex gap-2">
                <button onClick={selectAll} className="text-[10px] font-bold text-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent-glow))]">All</button>
                <span className="text-[rgb(var(--color-border-secondary))]">|</span>
                <button onClick={deselectAll} className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-secondary))]">None</button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto border-x border-b border-[rgb(var(--color-border-secondary))] rounded-b-xl bg-[rgb(var(--color-bg-surface))]/30 p-4 custom-scrollbar">
                <SelectionTree
                items={treeData}
                selectedIds={selectedIds}
                expandedIds={expandedIds}
                onToggleSelect={handleToggleSelect}
                onToggleExpand={handleToggleExpand}
                />
            </div>
      </div>

      <ActionButtons 
        onCancel={onClose}
        onConfirm={handleExport}
        confirmText="Export JSON"
        isConfirmDisabled={selectedIds.size === 0}
      />
    </div>
  );
};

export default ExportFlow;
