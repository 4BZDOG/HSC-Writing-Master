import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastType } from '../hooks/useToast';
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { ScenarioImageRef } from '../types';
import {
  deleteScenarioImage,
  loadScenarioImage,
  saveScenarioImage,
} from '../utils/scenarioImageStorage';
import { isImageMimeType, prepareScenarioImage } from '../utils/scenarioImageCodec';
import { deleteScenarioImageFromStorage } from '../services/scenarioImageSyncService';

type ToastFn = (message: string, type: ToastType) => void;

interface ScenarioImageUploaderProps {
  promptId: string;
  existingImage?: ScenarioImageRef;
  onImageChange: (ref: ScenarioImageRef | undefined) => void;
  showToast?: ToastFn;
}

/**
 * Paste/upload panel for a question's scenario image.
 *
 * This commits immediately — pasting or choosing an image writes it to the
 * `scenario_images_store` IDB store and updates `Prompt.scenarioImage` the
 * moment it lands, independent of the "Save Scenario" button that governs
 * the text field beside it. A multi-hundred-KB data URL never sits in this
 * component's own state waiting for a separate save action.
 */
const ScenarioImageUploader: React.FC<ScenarioImageUploaderProps> = ({
  promptId,
  existingImage,
  onImageChange,
  showToast,
}) => {
  const [isBusy, setIsBusy] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Opening the panel on a prompt that already has a saved image shows its
  // thumbnail from IDB — the reference on `Prompt` never carries the bytes.
  useEffect(() => {
    let cancelled = false;
    if (!existingImage) {
      setPreviewDataUrl(null);
      return;
    }
    loadScenarioImage(promptId).then((row) => {
      if (!cancelled) setPreviewDataUrl(row?.dataUrl ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [existingImage, promptId]);

  const commitImage = useCallback(
    async (file: File) => {
      setIsBusy(true);
      try {
        const dataUrl = await prepareScenarioImage(file);
        await saveScenarioImage(promptId, dataUrl);
        setPreviewDataUrl(dataUrl);
        onImageChange({ id: promptId, updatedAt: Date.now() });
        showToast?.('Scenario image saved.', 'success');
      } catch (err) {
        showToast?.(
          err instanceof Error ? err.message : 'Failed to save the scenario image.',
          'error'
        );
      } finally {
        setIsBusy(false);
      }
    },
    [promptId, onImageChange, showToast]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => isImageMimeType(item.type));
      if (!imageItem) {
        showToast?.('Paste an image to use as the scenario diagram.', 'info');
        return;
      }
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      void commitImage(file);
    },
    [commitImage, showToast]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void commitImage(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [commitImage]
  );

  const handleRemove = useCallback(async () => {
    setIsBusy(true);
    try {
      await deleteScenarioImage(promptId);
      // Fail-soft and fire-and-forget: a Storage delete failure (no config,
      // network, or the still-unapplied RLS policy) must not block removing
      // the image locally — but without this call the uploaded bytes would
      // never be cleaned up at all. See scenarioImageSyncService.ts.
      void deleteScenarioImageFromStorage(existingImage?.storagePath);
      setPreviewDataUrl(null);
      onImageChange(undefined);
      showToast?.('Scenario image removed.', 'success');
    } catch (err) {
      showToast?.(
        err instanceof Error ? err.message : 'Failed to remove the scenario image.',
        'error'
      );
    } finally {
      setIsBusy(false);
    }
  }, [promptId, existingImage, onImageChange, showToast]);

  const hasImage = !!existingImage || !!previewDataUrl;

  return (
    <div className="animate-fade-in space-y-3 p-4 bg-[rgb(var(--color-bg-surface-inset))] light:bg-white rounded-2xl border border-white/10 light:border-slate-300">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 light:text-slate-600">
        <ImagePlus className="w-3.5 h-3.5" /> Scenario Image
      </div>

      {hasImage && (
        <div className="flex items-center gap-3">
          {previewDataUrl && (
            <img
              src={previewDataUrl}
              alt="Scenario diagram preview"
              className="w-20 h-20 object-cover rounded-xl border border-white/10 light:border-slate-300"
            />
          )}
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={isBusy}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove image
          </button>
        </div>
      )}

      <div
        tabIndex={0}
        onPaste={handlePaste}
        role="group"
        aria-label="Paste an image here, or use the upload button"
        className="relative flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border border-dashed border-slate-500/40 light:border-slate-300 text-center focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/40 transition-colors"
      >
        {isBusy ? (
          <Loader2 className="w-5 h-5 text-[rgb(var(--color-accent))] animate-spin" />
        ) : (
          <>
            <p className="text-xs text-slate-500 font-medium">
              Click here and paste an image, or upload one below.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 hover:bg-[rgb(var(--color-accent))]/25 transition-all"
            >
              <UploadCloud className="w-3.5 h-3.5" /> Upload image
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ScenarioImageUploader;
