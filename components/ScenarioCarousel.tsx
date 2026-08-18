import React, { useEffect, useState } from 'react';
import { Loader2, Quote } from 'lucide-react';
import { PromptVerb, ScenarioImageRef } from '../types';
import { renderFormattedText } from '../utils/renderUtils';
import { loadScenarioImage } from '../utils/scenarioImageStorage';
import { syncScenarioImageDown } from '../services/scenarioImageSyncService';

interface ScenarioCarouselProps {
  scenarioText?: string;
  scenarioImage?: ScenarioImageRef;
  keywords?: string[];
  verb?: PromptVerb;
  fontSize: number;
}

type Slide = 'text' | 'image';

/**
 * Renders a question's scenario as one or two "slides" — the existing text
 * treatment, and (when present) a diagram/image — with a small toggle
 * between them.
 *
 * Only reached when `scenarioImage` is set; `PromptDisplay` keeps rendering
 * its original text-only block for every prompt without one, so this never
 * changes what an existing question without an image looks like.
 */
const ScenarioCarousel: React.FC<ScenarioCarouselProps> = ({
  scenarioText,
  scenarioImage,
  keywords,
  verb,
  fontSize,
}) => {
  const hasText = !!scenarioText;
  const hasImage = !!scenarioImage;
  const showToggle = hasText && hasImage;

  const [activeSlide, setActiveSlide] = useState<Slide>(hasText ? 'text' : 'image');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(hasImage);

  // Keeps the active slide valid if which slides exist changes under the
  // component (text cleared, image removed) rather than showing nothing.
  useEffect(() => {
    if (activeSlide === 'image' && !hasImage && hasText) setActiveSlide('text');
    if (activeSlide === 'text' && !hasText && hasImage) setActiveSlide('image');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasText, hasImage]);

  useEffect(() => {
    if (!scenarioImage) {
      setImageDataUrl(null);
      return;
    }
    let cancelled = false;
    setIsLoadingImage(true);
    (async () => {
      let row = await loadScenarioImage(scenarioImage.id);
      // Not cached locally yet, but Supabase Storage has it (e.g. viewing a
      // prompt someone else contributed, on a fresh device/browser) — fetch
      // and cache it, then re-read. Fails soft to "Image unavailable."
      if (!row && scenarioImage.storagePath) {
        await syncScenarioImageDown(scenarioImage.id, scenarioImage);
        row = await loadScenarioImage(scenarioImage.id);
      }
      if (cancelled) return;
      setImageDataUrl(row?.dataUrl ?? null);
      setIsLoadingImage(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioImage?.id, scenarioImage?.updatedAt, scenarioImage?.storagePath]);

  const TextSlide = (
    <div key="text" className="relative animate-fade-in">
      {/* Decorative Quote Icon */}
      <Quote className="absolute -top-3 -left-2 w-6 h-6 text-slate-500/20 light:text-slate-500/30 transform rotate-180" />
      <p
        className="text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-relaxed font-serif italic pl-6 pr-2 break-words"
        style={{ fontSize: `${fontSize}px` }}
      >
        {renderFormattedText(scenarioText ?? '', keywords, verb)}
      </p>
    </div>
  );

  const ImageSlide = (
    <div key="image" className="animate-fade-in flex items-center justify-center min-h-[8rem]">
      {isLoadingImage ? (
        <div className="flex flex-col items-center gap-3 text-indigo-500 dark:text-indigo-400 py-6">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-[10px] font-black uppercase tracking-[0.25em]">Loading image…</span>
        </div>
      ) : imageDataUrl ? (
        <img
          src={imageDataUrl}
          alt={scenarioImage?.alt || 'Scenario diagram'}
          className="max-w-full max-h-96 rounded-xl object-contain"
        />
      ) : (
        <p className="text-xs text-slate-500 font-medium py-6">Image unavailable.</p>
      )}
    </div>
  );

  return (
    <div>
      {activeSlide === 'text' && hasText ? TextSlide : null}
      {activeSlide === 'image' && hasImage ? ImageSlide : null}

      {showToggle && (
        <div
          role="tablist"
          aria-label="Scenario slide"
          className="flex items-center justify-center gap-2 mt-4"
        >
          {(['text', 'image'] as Slide[]).map((slide) => (
            <button
              key={slide}
              type="button"
              role="tab"
              aria-selected={activeSlide === slide}
              onClick={() => setActiveSlide(slide)}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                activeSlide === slide
                  ? 'bg-[rgb(var(--color-accent))] text-white shadow-md'
                  : 'bg-white/5 light:bg-slate-100 text-slate-500 hover:text-slate-300 light:hover:text-slate-700'
              }`}
            >
              {slide === 'text' ? 'Text' : 'Image'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScenarioCarousel;
