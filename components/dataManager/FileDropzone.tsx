import React, { useCallback, useState } from 'react';
import { UploadCloud, FileJson } from 'lucide-react';

interface FileDropzoneProps {
  onFileDrop: (file: File) => void;
  disabled?: boolean;
}

const FileDropzone: React.FC<FileDropzoneProps> = ({ onFileDrop, disabled = false }) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (disabled) return;

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        onFileDrop(e.dataTransfer.files[0]);
      }
    },
    [onFileDrop, disabled]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileDrop(e.target.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`
        relative p-10 rounded-2xl text-center cursor-pointer transition-all duration-300 group
        border-2 border-dashed
        ${
          disabled
            ? 'border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 cursor-not-allowed opacity-50'
            : isDragActive
              ? 'border-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10 scale-[1.02]'
              : 'border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface))] hover:border-[rgb(var(--color-accent))]/50 hover:bg-[rgb(var(--color-bg-surface-light))]'
        }
      `}
    >
      <input
        type="file"
        id="file-upload"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        onChange={handleFileChange}
        accept="application/json"
        disabled={disabled}
      />
      <div className="flex flex-col items-center pointer-events-none">
        <div
          className={`
            w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all duration-300
            ${isDragActive ? 'bg-[rgb(var(--color-accent))] text-white shadow-lg shadow-[rgb(var(--color-accent))]/30' : 'bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))] group-hover:bg-[rgb(var(--color-bg-surface-elevated))]'}
        `}
        >
          {isDragActive ? (
            <FileJson className="w-8 h-8 animate-bounce" />
          ) : (
            <UploadCloud className="w-8 h-8" />
          )}
        </div>

        <p className="text-lg font-bold text-[rgb(var(--color-text-primary))] mb-1">
          {isDragActive ? 'Drop file here' : 'Click or Drag & Drop'}
        </p>
        <p className="text-sm text-[rgb(var(--color-text-muted))]">
          Accepts <span className="font-mono text-[rgb(var(--color-accent))]">.json</span> course
          files
        </p>
      </div>
    </div>
  );
};

export default FileDropzone;
