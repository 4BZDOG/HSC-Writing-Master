import { useMemo } from 'react';
import { textContainsKeyword } from '../utils/renderUtils';

export const useAnswerMetrics = (text: string, keywords: string[] | undefined) => {
  return useMemo(() => {
    const cleanText = text || '';
    const wordCount = cleanText.trim().split(/\s+/).filter(Boolean).length;

    // Keyword Analysis — shares the highlighter's matcher so these counts
    // always agree with the terms shown highlighted in the text.
    const validKeywords = (keywords || []).filter((kw) => kw && kw.trim());
    const foundCount = validKeywords.filter((kw) => textContainsKeyword(cleanText, kw)).length;

    const percentage =
      validKeywords.length > 0 ? Math.round((foundCount / validKeywords.length) * 100) : 0;

    // Colour Stage Logic
    let colourStage = { emoji: '🔴', label: 'Basic', color: 'text-red-400' };
    if (percentage >= 30)
      colourStage = { emoji: '🟠', label: 'Developing', color: 'text-orange-400' };
    if (percentage >= 60)
      colourStage = { emoji: '🟡', label: 'Proficient', color: 'text-yellow-400' };
    if (percentage >= 85) colourStage = { emoji: '🟢', label: 'Advanced', color: 'text-green-400' };

    return {
      wordCount,
      keywordStats: {
        found: foundCount,
        total: validKeywords.length,
        percentage,
      },
      colourStage,
    };
  }, [text, keywords]);
};

export default useAnswerMetrics;
