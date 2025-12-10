
import { useMemo } from 'react';
import { getKeywordVariants, escapeRegExp } from '../utils/renderUtils';

export const useAnswerMetrics = (text: string, keywords: string[] | undefined) => {
  return useMemo(() => {
    const cleanText = text || '';
    const wordCount = cleanText.trim().split(/\s+/).filter(Boolean).length;
    
    // Keyword Analysis
    const validKeywords = (keywords || []).filter(kw => kw && kw.trim());
    let foundCount = 0;
    
    if (validKeywords.length > 0) {
        const textLower = cleanText.toLowerCase();
        const foundSet = new Set<string>();
        
        validKeywords.forEach(kw => {
            const variants = getKeywordVariants(kw);
            const isFound = variants.some(v => {
                try {
                    return new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i').test(textLower);
                } catch {
                    return textLower.includes(v.toLowerCase());
                }
            });
            
            if (isFound) {
                foundSet.add(kw);
            }
        });
        foundCount = foundSet.size;
    }

    const percentage = validKeywords.length > 0 ? Math.round((foundCount / validKeywords.length) * 100) : 0;

    // Colour Stage Logic
    let colourStage = { emoji: '🔴', label: 'Basic', color: 'text-red-400' };
    if (percentage >= 30) colourStage = { emoji: '🟠', label: 'Developing', color: 'text-orange-400' };
    if (percentage >= 60) colourStage = { emoji: '🟡', label: 'Proficient', color: 'text-yellow-400' };
    if (percentage >= 85) colourStage = { emoji: '🟢', label: 'Advanced', color: 'text-green-400' };

    return {
        wordCount,
        keywordStats: {
            found: foundCount,
            total: validKeywords.length,
            percentage
        },
        colourStage
    };
  }, [text, keywords]);
};

export default useAnswerMetrics;
