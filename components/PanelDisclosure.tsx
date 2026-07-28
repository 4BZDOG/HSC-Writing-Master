import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

/**
 * Shared behaviour for the workspace's disclosure panels.
 *
 * Every panel now starts shut, which buys a much calmer page but costs the one
 * thing an open panel gave for free: a student could see at a glance what they
 * had already looked at. A row of identical closed panels answers "have I read
 * the marking guide yet?" with nothing at all — so a panel that has been opened
 * and shut again says so.
 *
 * The mark is per question, not per session: `resetKey` (the prompt id) clears
 * it when the student moves to a new question, because "read" means read for
 * THIS question. Panels that outlive a question without one — Live Insights,
 * whose content is the student's own draft — simply pass nothing.
 */
export const useOpenedOnce = (isOpen: boolean, resetKey?: string): boolean => {
  const [opened, setOpened] = useState(false);
  const key = useRef(resetKey);

  useEffect(() => {
    if (isOpen) setOpened(true);
  }, [isOpen]);

  // Reset during render rather than in an effect: an effect would leave the
  // previous question's tick on screen for a frame after switching.
  if (key.current !== resetKey) {
    key.current = resetKey;
    if (opened) setOpened(false);
    return false;
  }

  return opened;
};

/**
 * "You have opened this one." Shown only while the panel is SHUT — open, the
 * content is the feedback — and deliberately quiet: a tick and a word, in the
 * same small caps as every other label in the panel chrome.
 */
export const PanelReadChip: React.FC<{ show: boolean; className?: string }> = ({
  show,
  className = '',
}) =>
  show ? (
    <span
      title="You have opened this panel for this question"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 animate-fade-in ${className}`}
    >
      <Check className="w-2.5 h-2.5" strokeWidth={3} />
      Read
    </span>
  ) : null;
