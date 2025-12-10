import React, { useMemo, useRef, useState } from 'react';
import { EvaluationResult, Prompt, EvaluationCriterion, UserFeedback, HierarchyContext } from '../types';
import { getBandConfig, renderFormattedText, stripHtmlTags, escapeRegExp, getKeywordVariants } from '../utils/renderUtils';
import { CheckCircle, XCircle, BookOpen, Repeat, BarChart, Hash, Award, Sparkles, AlertTriangle, Trophy, ClipboardList, Check, X, FileDown, FileText, Loader2, Save, ArrowUpCircle, ChevronRight, AlertCircle, Settings } from 'lucide-react';
import { getCommandTermInfo } from '../data/commandTerms';
import LoadingIndicator from './LoadingIndicator';
import ResponseFeedback from './ResponseFeedback';
import { useAnswerMetrics } from '../hooks/useAnswerMetrics';
import AnswerMetricsDisplay from './AnswerMetricsDisplay';
import PdfConfigModal, { PdfConfig } from './PdfConfigModal';

// ... (EvaluationMetricsDisplay remains the same)
const EvaluationMetricsDisplay: React.FC<{ result: EvaluationResult; prompt: Prompt; userAnswer: string; }> = ({ result, prompt, userAnswer }) => {
    const bandConfig = getBandConfig(result.overallBand);
    
    const wordCount = useMemo(() => 
        userAnswer.trim().split(/\s+/).filter(Boolean).length, 
        [userAnswer]
    );

    const { keywordsUsedCount, usedKeywordsList } = useMemo(() => {
        if (!prompt.keywords || prompt.keywords.length === 0 || !userAnswer.trim()) {
            return { keywordsUsedCount: 0, usedKeywordsList: '' };
        }
        
        const answerLower = userAnswer.toLowerCase();
        const used = (prompt.keywords || []).filter(kw => {
            if (!kw) return false;
            const variants = getKeywordVariants(kw);
            return variants.some(v => new RegExp(`\\b${escapeRegExp(v)}\\b`, 'i').test(answerLower));
        });

        return { keywordsUsedCount: used.length, usedKeywordsList: used.join(', ') };
    }, [userAnswer, prompt.keywords]);
    
    // Approximating a target word count for the achieved band.
    const bandWordCountTarget = (prompt.totalMarks * 1.8) * (result.overallBand / 6);
    const wordCountProgress = Math.min((wordCount / bandWordCountTarget) * 100, 100);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:gap-2">
            {/* Word Count */}
            <div className={`p-4 print:p-2 rounded-lg flex flex-col justify-between ${bandConfig.bg} border ${bandConfig.border} hover-lift print:border-gray-400 print:bg-white`}>
                <div>
                    <h5 className="font-semibold text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600 print:text-black flex items-center gap-2"><Hash className="w-4 h-4" /> Word Count</h5>
                    <p className="text-3xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 print:text-black mt-1">{wordCount}</p>
                </div>
                <div className="print:hidden">
                    <div className="w-full bg-black/20 light:bg-black/10 rounded-full h-2 mt-2">
                        <div className={`h-2 rounded-full transition-all duration-300 ${bandConfig.solidBg}`} style={{ width: `${wordCountProgress}%` }}></div>
                    </div>
                    <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1">Relative to band performance.</p>
                </div>
            </div>
            
             {/* Keyword Usage */}
            <div className={`p-4 print:p-2 rounded-lg ${bandConfig.bg} border ${bandConfig.border} hover-lift print:border-gray-400 print:bg-white`}>
                 <h5 className="font-semibold text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600 print:text-black flex items-center gap-2"><Award className="w-4 h-4" /> Keyword Usage</h5>
                 <p className="text-3xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 print:text-black mt-1">{keywordsUsedCount} <span className="text-lg text-[rgb(var(--color-text-muted))] light:text-slate-500 print:text-gray-600">/ {prompt.keywords?.length || 0}</span></p>
                 <div className="mt-2 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-600 print:text-black">
                    <p><strong>Used:</strong> {usedKeywordsList || "None"}</p>
                 </div>
            </div>
        </div>
    );
};

const CriteriaBreakdown: React.FC<{ criteria: EvaluationCriterion[] }> = ({ criteria }) => {
    if (!criteria || criteria.length === 0) return null;

    return (
        <div className="animate-fade-in-up-sm">
             <h4 className="font-bold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 print:text-black flex items-center gap-2 mb-3 uppercase tracking-wider">
                <ClipboardList className="w-4 h-4 text-[rgb(var(--color-accent))] print:text-black" />
                Marking Criteria Breakdown
            </h4>
            
            {/* data-section attribute used for PDF export targeting */}
            <div data-section="criteria" className="space-y-4 print:space-y-0 print:grid print:grid-cols-2 print:gap-3 print:items-start">
                {criteria.map((criterion, idx) => {
                    const percentage = criterion.maxMark > 0 ? (criterion.mark / criterion.maxMark) * 100 : 0;
                    
                    // Traffic Light Logic
                    let statusColor = 'border-l-red-500 bg-red-500/5 light:bg-red-50 text-red-400 light:text-red-700'; // Default Red
                    let icon = <XCircle className="w-5 h-5 text-red-500" />;
                    let statusText = "Not Achieved";

                    if (percentage === 100) {
                        statusColor = 'border-l-emerald-500 bg-emerald-500/5 light:bg-emerald-50 text-emerald-400 light:text-emerald-700';
                        icon = <CheckCircle className="w-5 h-5 text-emerald-500" />;
                        statusText = "Achieved";
                    } else if (percentage > 0) {
                        statusColor = 'border-l-amber-500 bg-amber-500/5 light:bg-amber-50 text-amber-400 light:text-amber-700';
                        icon = <AlertTriangle className="w-5 h-5 text-amber-500" />;
                        statusText = "Partial";
                    }

                    return (
                        <div key={idx} className={`relative group overflow-hidden rounded-r-xl rounded-l-sm border-l-[6px] ${statusColor} border-y border-r border-[rgb(var(--color-border-secondary))] light:border-slate-200 transition-all duration-300 hover:shadow-md print-break-inside-avoid print:border-gray-300 print:bg-white print:h-full`}>
                            <div className="p-4 print:p-2 flex gap-4 items-start">
                                
                                {/* Status Icon Column */}
                                <div className="flex-shrink-0 pt-0.5 print:text-black">
                                    {icon}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 print:text-black font-serif leading-tight">
                                            {renderFormattedText(criterion.criterion)}
                                        </div>
                                        <div className="flex items-center gap-2 pl-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 hidden sm:block print:text-black">{statusText}</span>
                                            <div className={`text-lg font-black leading-none ${statusColor.split(' ').pop()} print:text-black`}>
                                                {criterion.mark}<span className="text-xs font-normal opacity-60 text-[rgb(var(--color-text-muted))] print:text-gray-600">/{criterion.maxMark}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xs mt-1 leading-relaxed opacity-90 text-[rgb(var(--color-text-secondary))] light:text-slate-700 print:text-black">
                                        {renderFormattedText(criterion.feedback)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}

interface EvaluationDisplayProps {
  result: EvaluationResult;
  prompt: Prompt;
  onUseRevisedAnswer: (answer: string) => void;
  onImproveAnswer: () => void;
  isImproving: boolean;
  improveAnswerError: string | null;
  userAnswer?: string;
  breadcrumbs?: string[];
  onSaveToSamples?: () => void;
  onFeedbackSubmit?: (feedback: UserFeedback) => void;
  hierarchy?: HierarchyContext;
  userName?: string;
}

const EvaluationDisplay: React.FC<EvaluationDisplayProps> = ({ 
    result, 
    prompt, 
    onUseRevisedAnswer, 
    onImproveAnswer, 
    isImproving, 
    improveAnswerError, 
    userAnswer = '',
    breadcrumbs = [],
    onSaveToSamples,
    onFeedbackSubmit,
    hierarchy,
    userName = 'Student'
}) => {

  const bandConfig = getBandConfig(result.overallBand);
  
  // Command Term Styling
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const termBandConfig = useMemo(() => getBandConfig(commandTermInfo.tier), [commandTermInfo.tier]);

  const reportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPdfConfigOpen, setIsPdfConfigOpen] = useState(false);

  // Default PDF Config
  const safeUserName = userName.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const [pdfConfig, setPdfConfig] = useState<PdfConfig>({
      marginTop: 10,
      marginBottom: 10,
      marginLeft: 10,
      marginRight: 10,
      scale: 2,
      filename: `HSC_Eval_${safeUserName}_Band${result.overallBand}_${dateStr}.pdf`,
      containerWidth: 715 // Default optimized A4 width
  });

  const renderedFeedback = useMemo(() => {
    return renderFormattedText(result.overallFeedback, prompt.keywords, prompt.verb);
  }, [result.overallFeedback, prompt.keywords, prompt.verb]);

  const revisedText = useMemo(() => {
      if (!result.revisedAnswer) return '';
      if (typeof result.revisedAnswer === 'string') return result.revisedAnswer;
      return result.revisedAnswer.text;
  }, [result.revisedAnswer]);
  
  const revisedMeta = useMemo(() => {
      if (!result.revisedAnswer || typeof result.revisedAnswer === 'string') return null;
      return {
          mark: result.revisedAnswer.mark,
          band: result.revisedAnswer.band,
          changes: result.revisedAnswer.keyChanges
      };
  }, [result.revisedAnswer]);

  const renderedRevisedAnswer = useMemo(() => {
    if (!revisedText) return null;
    return renderFormattedText(revisedText, prompt.keywords, prompt.verb);
  }, [revisedText, prompt.keywords, prompt.verb]);

  const revisedMetrics = useAnswerMetrics(revisedText, prompt.keywords);

  // Updated Export Function accepting config
  const handleExportPDF = async (configOverride?: PdfConfig) => {
    if (!reportRef.current || typeof html2pdf === 'undefined') {
        if (typeof html2pdf === 'undefined') {
            alert("PDF generation library not loaded. Please check your internet connection.");
        }
        return;
    }

    const currentConfig = configOverride || pdfConfig;
    setIsExporting(true);
    setIsPdfConfigOpen(false); // Close modal if open

    console.log("PDF Export: Starting with config:", currentConfig);
    
    // 1. Create a dedicated container for the print version
    const overlay = document.createElement('div');
    overlay.id = 'pdf-export-overlay';
    overlay.setAttribute('data-theme', 'light');
    
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '9999',
        backgroundColor: '#ffffff',
        overflow: 'hidden' 
    });
    
    // 2. Create the constrained A4 container with dynamic width from config
    const contentContainer = document.createElement('div');
    contentContainer.id = 'pdf-render-target';
    Object.assign(contentContainer.style, {
        width: `${currentConfig.containerWidth}px`, 
        minHeight: '1123px', // A4 height
        position: 'absolute',
        top: '0',
        left: '0',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'serif',
        boxSizing: 'border-box',
        margin: '0',
        padding: '0'
    });

    // 3. Inject Styles
    const styleBlock = document.createElement('style');
    styleBlock.innerHTML = `
        #pdf-render-target {
            --color-bg-base: 255 255 255;
            --color-bg-surface: 255 255 255;
            --color-bg-surface-elevated: 255 255 255;
            --color-bg-surface-inset: 245 247 250;
            --color-text-primary: 0 0 0;
            --color-text-secondary: 40 40 40;
            --color-text-muted: 80 80 80;
            --color-border-secondary: 200 200 200;
            --color-border-primary: 0 0 0;
            --color-accent: 14 165 233;
        }
        #pdf-render-target * {
            color: #000000 !important;
            -webkit-text-fill-color: #000000 !important;
            text-shadow: none !important;
            box-shadow: none !important;
        }
        #pdf-render-target .bg-gradient-to-r, 
        #pdf-render-target .bg-gradient-to-br {
            background: none !important;
            background-color: #f3f4f6 !important; 
            border: 1px solid #ddd !important;
        }
        #pdf-render-target .pdf-header { display: block !important; }
        #pdf-render-target .pdf-footer { display: block !important; }
        #pdf-render-target .no-print { display: none !important; }
        #pdf-render-target button { display: none !important; }
    `;
    overlay.appendChild(styleBlock);

    // 4. Clone content
    const clone = reportRef.current.cloneNode(true) as HTMLElement;
    const noPrintElements = clone.querySelectorAll('button, .no-print');
    noPrintElements.forEach(el => el.remove());
    clone.querySelectorAll('.pdf-header, .pdf-footer').forEach(el => el.classList.remove('hidden'));
    
    clone.style.width = '100%';
    clone.style.height = 'auto';
    clone.style.margin = '0';
    clone.style.border = 'none';
    clone.style.boxShadow = 'none';

    contentContainer.appendChild(clone);
    overlay.appendChild(contentContainer);
    document.body.appendChild(overlay);

    // 5. Wait for layout
    await new Promise(resolve => setTimeout(resolve, 800));

    // 6. Generate PDF with dynamic margins and scale
    const opt = {
      margin: [currentConfig.marginTop, currentConfig.marginRight, currentConfig.marginBottom, currentConfig.marginLeft],
      filename: currentConfig.filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
          scale: currentConfig.scale, 
          useCORS: true, 
          logging: true,
          scrollY: 0,
          scrollX: 0,
          x: 0,
          y: 0,
          windowWidth: currentConfig.containerWidth,
          width: currentConfig.containerWidth
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
        console.log("PDF Export: Generating...");
        await html2pdf().set(opt).from(contentContainer).save();
        console.log("PDF Export: Complete.");
    } catch (err) {
        console.error("PDF Export Error:", err);
        alert("Could not generate PDF. Please try again.");
    } finally {
        // 7. Cleanup
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
        setIsExporting(false);
    }
  };

  // Preview Mode: Mounts the overlay but DOES NOT generate PDF. Allows user to inspect DOM.
  const handlePreviewOverlay = async (configOverride: PdfConfig) => {
      setIsPdfConfigOpen(false);
      const currentConfig = configOverride;
      
      const overlay = document.createElement('div');
      overlay.id = 'pdf-preview-overlay';
      overlay.setAttribute('data-theme', 'light');
      overlay.title = "Click anywhere to close debug view";
      overlay.onclick = () => document.body.removeChild(overlay);
      
      Object.assign(overlay.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          width: '100vw',
          height: '100vh',
          zIndex: '9999',
          backgroundColor: '#333333', // Dark background to see the A4 page clearly
          overflowY: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '40px',
          cursor: 'pointer'
      });

      const contentContainer = document.createElement('div');
      Object.assign(contentContainer.style, {
          width: `${currentConfig.containerWidth}px`, 
          minHeight: '1123px',
          backgroundColor: '#ffffff',
          color: '#000000',
          fontFamily: 'serif',
          boxSizing: 'border-box',
          margin: '0 auto',
          position: 'relative',
          cursor: 'default'
      });
      contentContainer.onclick = (e) => e.stopPropagation(); // Prevent close when clicking content

      // Styles
      const styleBlock = document.createElement('style');
      styleBlock.innerHTML = `
          /* Same print styles as export */
           #pdf-preview-overlay {
            --color-bg-base: 255 255 255;
            --color-bg-surface: 255 255 255;
            --color-bg-surface-elevated: 255 255 255;
            --color-bg-surface-inset: 245 247 250;
            --color-text-primary: 0 0 0;
            --color-text-secondary: 40 40 40;
            --color-text-muted: 80 80 80;
            --color-border-secondary: 200 200 200;
            --color-border-primary: 0 0 0;
            --color-accent: 14 165 233;
        }
        #pdf-preview-overlay * {
            color: #000000 !important;
            -webkit-text-fill-color: #000000 !important;
            text-shadow: none !important;
            box-shadow: none !important;
        }
        #pdf-preview-overlay .bg-gradient-to-r, 
        #pdf-preview-overlay .bg-gradient-to-br {
            background: none !important;
            background-color: #f3f4f6 !important;
            border: 1px solid #ddd !important;
        }
        #pdf-preview-overlay .pdf-header { display: block !important; }
        #pdf-preview-overlay .pdf-footer { display: block !important; }
        #pdf-preview-overlay .no-print { display: none !important; }
        #pdf-preview-overlay button { display: none !important; }
      `;
      overlay.appendChild(styleBlock);

      const clone = reportRef.current?.cloneNode(true) as HTMLElement;
      if (!clone) return;
      
      const noPrintElements = clone.querySelectorAll('button, .no-print');
      noPrintElements.forEach(el => el.remove());
      clone.querySelectorAll('.pdf-header, .pdf-footer').forEach(el => el.classList.remove('hidden'));
      
      clone.style.width = '100%';
      clone.style.height = 'auto';
      clone.style.margin = '0';
      clone.style.border = 'none';
      clone.style.boxShadow = 'none';

      contentContainer.appendChild(clone);
      overlay.appendChild(contentContainer);
      document.body.appendChild(overlay);
  };

  const improvedBand = revisedMeta ? revisedMeta.band : Math.min(6, result.overallBand + 1);
  const improvedBandConfig = getBandConfig(improvedBand);

  return (
    <>
    <div 
        ref={reportRef}
        id="evaluation-print-container" 
        className="relative bg-[rgb(var(--color-bg-surface))] light:bg-white print:bg-white print:text-black print:shadow-none print:border-none rounded-2xl p-6 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 shadow-xl light:shadow-xl animate-fade-in overflow-hidden print:overflow-visible print:h-auto hover-lift"
    >
      
      <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${bandConfig.gradient} opacity-5 light:opacity-10 blur-[80px] pointer-events-none rounded-full -translate-y-1/2 translate-x-1/2 no-print`} />

      {/* Print-Only Header - Redesigned as Breadcrumb */}
      <div className="pdf-header hidden print:block mb-6 border-b-2 border-gray-900 pb-4">
        
        {/* Breadcrumb Trail */}
        {hierarchy && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-600 uppercase tracking-wider mb-2 font-mono">
                <span className="font-bold text-black">{hierarchy.course}</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
                <span>{hierarchy.topic}</span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
                <span>{hierarchy.subTopic}</span>
            </div>
        )}
        
        {hierarchy?.dotPoint && (
             <div className="text-[10px] text-gray-500 italic mb-4 pl-2 border-l-2 border-gray-300">
                {hierarchy.dotPoint}
             </div>
        )}
        
        <div className="flex justify-between items-start gap-6">
            <div className="flex-1">
                <h1 className="text-xl font-bold text-black leading-tight font-serif mb-2">
                    {renderFormattedText(prompt.question, prompt.keywords, prompt.verb)}
                </h1>
                {prompt.scenario && (
                    <p className="text-xs text-gray-600 italic mt-1">
                        Context: {renderFormattedText(prompt.scenario, prompt.keywords, prompt.verb)}
                    </p>
                )}
            </div>
            
            <div className={`flex-shrink-0 text-right`}>
                 <div className={`text-3xl font-black text-black leading-none`}>Band {result.overallBand}</div>
                 <div className="text-xs font-mono font-bold uppercase tracking-wide text-gray-500 mt-1">{result.overallMark}/{prompt.totalMarks} Marks</div>
                 <div className="text-[9px] text-gray-400 uppercase mt-1">{new Date().toLocaleDateString()} • {userName}</div>
            </div>
        </div>
      </div>
      
      {isImproving && (
        <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 light:bg-white/95 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20 no-print">
          <div className="w-full max-w-md mx-6">
            <LoadingIndicator 
              messages={[
                'Revising your answer...',
                'Applying feedback...',
                `Targeting Band ${improvedBand}...`,
                'Refining language and flow...',
              ]} 
              duration={15}
              band={improvedBand}
            />
          </div>
        </div>
      )}

      {/* Screen Header Section (Hidden on Print/PDF) */}
      <div className="flex flex-col mb-6 pb-6 border-b border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 relative z-10 no-print">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
                <h3 className="text-2xl font-bold text-white light:text-slate-900 mb-2 flex items-center gap-3">
                    <Trophy className={`w-6 h-6 ${bandConfig.text}`} />
                    Evaluation Result
                </h3>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 max-w-xs">
                    Detailed breakdown of your response performance against NESA standards.
                </p>
                
                <div className="mt-4 flex flex-wrap items-center gap-2">
                     <div className="flex bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 rounded-lg p-0.5 border border-[rgb(var(--color-border-secondary))] light:border-slate-300">
                        <button
                            type="button"
                            onClick={() => handleExportPDF(pdfConfig)}
                            disabled={isExporting}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-200 text-[rgb(var(--color-text-secondary))] light:text-slate-700 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 transition-all text-xs font-bold cursor-pointer select-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Export with default settings"
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileDown className="w-4 h-4" />}
                            {isExporting ? 'Generating...' : 'PDF'}
                        </button>
                        <div className="w-px bg-[rgb(var(--color-border-secondary))] light:bg-slate-300 my-1"></div>
                        <button
                            type="button"
                            onClick={() => setIsPdfConfigOpen(true)}
                            className="px-2 py-1.5 rounded-md hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-200 text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] transition-colors"
                            title="Configure PDF Settings"
                        >
                            <Settings className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    
                    {onSaveToSamples && (
                        <button
                            type="button"
                            onClick={onSaveToSamples}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-elevated))] light:hover:bg-slate-200 text-[rgb(var(--color-text-secondary))] light:text-slate-700 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 transition-all text-xs font-bold cursor-pointer select-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed hover-scale"
                            title="Save to Sample Answers"
                        >
                            <Save className="w-4 h-4" />
                            Save as Sample
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 flex-shrink-0">
                {/* Command Term Card */}
                <div className={`
                    relative overflow-hidden px-5 py-3.5 rounded-xl flex flex-col justify-center min-w-[140px]
                    ${termBandConfig.bg} border ${termBandConfig.border} border-opacity-50
                    hover-lift
                `}>
                     <div className="flex items-center gap-2 mb-1.5">
                        <BarChart className={`w-4 h-4 ${termBandConfig.text}`} />
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500">Task</p>
                    </div>
                    <p className={`text-xl font-black ${termBandConfig.text}`}>{prompt.verb}</p>
                    <p className="text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">Tier {commandTermInfo.tier}</p>
                </div>

                {/* Result Card */}
                <div className={`
                    relative overflow-hidden px-6 py-4 rounded-xl flex items-center gap-6
                    bg-gradient-to-br ${bandConfig.gradient}
                    shadow-lg shadow-[rgba(0,0,0,0.2)] ${bandConfig.glow}
                    group border border-white/10 hover-lift flex-1 sm:flex-none
                `}>
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-20 transition-opacity duration-500" />
                    <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
                    
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-0.5">Achieved</p>
                        <p className="text-3xl font-black text-white leading-none tracking-tight">Band {result.overallBand}</p>
                    </div>
                    
                    <div className="h-10 w-px bg-white/20" />
                    
                    <div className="text-center min-w-[80px]">
                        <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-0.5">Mark</p>
                        <div className="flex items-baseline justify-center gap-0.5">
                            <span className="text-3xl font-mono font-bold text-white leading-none">{result.overallMark}</span>
                            <span className="text-sm font-medium text-white/60">/{prompt.totalMarks}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div className="space-y-6 print:space-y-4 relative z-10">
        
        {/* 1. Marker's Summary */}
        <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 p-5 print:p-3 rounded-xl border border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 backdrop-blur-sm print-break-inside-avoid hover-glow-border print:bg-white print:border print:border-gray-400">
          <h4 className="font-bold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 print:text-black mb-3 print:mb-1 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[rgb(var(--color-accent))] print:text-black" />
            Marker's Summary
          </h4>
          <div className="prose prose-sm max-w-none text-[rgb(var(--color-text-secondary))] light:text-slate-700 print:text-black leading-relaxed font-serif print:text-xs">
            {renderedFeedback}
          </div>
        </div>
        
        {/* 2. Response Statistics */}
        <div className="print-break-inside-avoid">
            <EvaluationMetricsDisplay result={result} prompt={prompt} userAnswer={userAnswer} />
        </div>

        {/* 3. Criteria Breakdown */}
        <div className="print-break-inside-avoid">
            {result.criteria && result.criteria.length > 0 && (
                <CriteriaBreakdown criteria={result.criteria} />
            )}
        </div>

        {/* --- PAGE 2 OF PDF STARTS HERE --- */}
        <div className="html2pdf__page-break" />

        {/* 4. Strengths & Weaknesses */}
        <div data-section="strengths-weaknesses" className="grid grid-cols-1 md:grid-cols-2 gap-5 print:gap-3 print-break-inside-avoid">
          <div className="bg-green-500/5 light:bg-green-50 print:bg-white p-5 print:p-3 rounded-xl border border-green-500/20 light:border-green-200 print:border-gray-400 hover-lift">
            <h4 className="font-bold text-green-400 light:text-green-700 print:text-black mb-3 print:mb-2 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500 print:text-black" /> Strengths
            </h4>
            <ul className="space-y-2 print:space-y-1">
              {(result.strengths && Array.isArray(result.strengths)) ? result.strengths.map((s, i) => (
                  <li key={`strength-${i}`} className="flex items-start gap-2 text-sm print:text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-700 print:text-black">
                      <span className="text-green-500/50 light:text-green-600 print:text-black mt-1.5 print:mt-1 text-[8px]">●</span>
                      <span>{renderFormattedText(s, prompt.keywords)}</span>
                  </li>
              )) : <li className="text-sm print:text-xs text-gray-500 print:text-black">No specific strengths identified.</li>}
            </ul>
          </div>
          
          <div className="bg-red-500/5 light:bg-red-50 print:bg-white p-5 print:p-3 rounded-xl border border-red-500/20 light:border-red-200 print:border-gray-400 flex flex-col hover-lift">
            <h4 className="font-bold text-red-400 light:text-red-700 print:text-black mb-3 print:mb-2 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500 print:text-black" /> Next Steps for Improvement
            </h4>
            <ul className="space-y-2 print:space-y-1 flex-grow">
              {(result.improvements && Array.isArray(result.improvements)) ? result.improvements.map((i, idx) => (
                 <li key={`improvement-${idx}`} className="flex items-start gap-2 text-sm print:text-xs text-[rgb(var(--color-text-secondary))] light:text-slate-700 print:text-black">
                      <span className="text-red-500/50 light:text-red-600 print:text-black mt-1.5 print:mt-1 text-[8px]">●</span>
                      <span>{renderFormattedText(i, prompt.keywords)}</span>
                  </li>
              )) : <li className="text-sm print:text-xs text-gray-500 print:text-black">No specific improvements identified.</li>}
            </ul>
            
            {result.overallBand < 6 && (
                <div className="mt-6 pt-4 border-t border-red-500/10 light:border-red-200/50 no-print">
                    {improveAnswerError && !isImproving ? (
                        <div className="bg-red-900/40 light:bg-red-100 p-3 rounded-lg border border-red-500/50 light:border-red-300 flex flex-col items-start gap-2 mb-2">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-300 light:text-red-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-red-300 light:text-red-700">{improveAnswerError}</p>
                            </div>
                            <button 
                                onClick={onImproveAnswer} 
                                className="text-xs font-semibold text-white bg-red-600/60 hover:bg-red-600 px-3 py-1 rounded-md transition"
                            >
                                Retry
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={onImproveAnswer}
                            disabled={isImproving}
                            className={`
                                w-full text-xs font-bold px-4 py-3 rounded-lg 
                                bg-gradient-to-r from-[rgb(var(--color-purple))] to-[rgb(var(--color-pink))] 
                                text-white hover:shadow-lg hover:shadow-purple-500/20 
                                transition-all duration-200 flex items-center justify-center gap-2 
                                disabled:opacity-50 active:scale-[0.98] hover-scale
                            `}
                        >
                          <Sparkles className="w-4 h-4" />
                          Generate Band {Math.min(6, result.overallBand + 1)} Version
                        </button>
                    )}
                </div>
            )}
          </div>
        </div>

        {/* Revised Answer Card */}
        {revisedText && (
          <div data-section="exemplar" className="bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 print:bg-white p-1 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 print:border-gray-400 overflow-hidden print-break-inside-avoid hover-lift">
            <div className={`
                px-5 py-3 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 print:border-gray-400 
                flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4
                ${improvedBandConfig.bg}
                print:bg-white
            `}>
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <div className={`p-1 rounded bg-white/10 ${improvedBandConfig.text} print:text-black print:bg-transparent`}>
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <h4 className={`font-bold text-sm ${improvedBandConfig.text} light:text-slate-900 print:text-black`}>
                            Exemplar Response: Band {improvedBand}
                        </h4>
                    </div>
                    <div className="flex items-center gap-3">
                         {revisedMeta && (
                            <span className={`text-xs font-bold ${improvedBandConfig.text} print:text-black opacity-90 border ${improvedBandConfig.border} print:border-gray-400 px-2 py-0.5 rounded-md`}>
                                {revisedMeta.mark}/{prompt.totalMarks} Marks
                            </span>
                        )}
                        {revisedMetrics && (
                             <AnswerMetricsDisplay metrics={revisedMetrics} showLabel={false} className="opacity-80 scale-90 origin-left" />
                        )}
                    </div>
                </div>
                <button 
                  onClick={() => onUseRevisedAnswer(stripHtmlTags(revisedText))}
                  className="text-xs font-bold px-3 py-2 rounded-lg bg-[rgb(var(--color-bg-surface))] light:bg-white hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-50 text-[rgb(var(--color-text-primary))] light:text-slate-800 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 transition-all duration-200 flex items-center gap-1.5 no-print hover-scale flex-shrink-0 shadow-sm"
                >
                  <Repeat className="w-3.5 h-3.5" /> Replace My Answer
                </button>
            </div>

            <div className="flex flex-col md:flex-row">
                <div className="p-5 print:p-4 flex-1 bg-[rgb(var(--color-bg-surface))]/50 light:bg-white print:bg-white">
                    <div className="prose prose-sm max-w-none text-[rgb(var(--color-text-secondary))] light:text-slate-700 print:text-black leading-relaxed font-serif print:text-xs">
                         {renderedRevisedAnswer}
                    </div>
                </div>

                {/* Dynamic Key Changes Panel */}
                {revisedMeta?.changes && revisedMeta.changes.length > 0 && (
                    <div className="md:w-80 p-5 print:p-4 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50 print:bg-white border-l border-[rgb(var(--color-border-secondary))] light:border-slate-200 print:border-gray-400 flex-shrink-0 flex flex-col">
                        <h5 className="text-xs font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 print:text-black uppercase tracking-wider mb-4 flex items-center gap-2">
                             <div className={`p-1.5 rounded-lg bg-gradient-to-br ${improvedBandConfig.gradient} text-white shadow-sm print:bg-none print:bg-transparent print:text-black print:border print:border-black`}>
                                <ArrowUpCircle className="w-3.5 h-3.5" />
                            </div>
                            Key Upgrades
                        </h5>
                        <div className="space-y-3 print:space-y-2 overflow-y-auto custom-scrollbar pr-1">
                            {revisedMeta.changes.map((change, i) => (
                                <div 
                                    key={i} 
                                    className={`
                                        group relative p-3.5 print:p-2 rounded-xl border transition-all duration-300
                                        bg-[rgb(var(--color-bg-surface))] light:bg-white print:bg-white
                                        border-[rgb(var(--color-border-secondary))] light:border-slate-200 print:border-gray-400
                                        hover:shadow-lg hover:-translate-y-0.5
                                        flex gap-3
                                    `}
                                >
                                    <div className={`
                                        flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                                        ${improvedBandConfig.bg} border ${improvedBandConfig.border}
                                        print:bg-white print:border-gray-400 print:text-black
                                        group-hover:scale-110 transition-transform
                                    `}>
                                        <span className={`text-[10px] font-bold ${improvedBandConfig.text} print:text-black`}>{i + 1}</span>
                                    </div>
                                    <p className="text-xs print:text-[10px] text-[rgb(var(--color-text-secondary))] light:text-slate-700 print:text-black leading-relaxed pt-0.5">
                                        {change}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
          </div>
        )}
        
        {onFeedbackSubmit && (
            <ResponseFeedback onFeedbackSubmit={onFeedbackSubmit} existingFeedback={result.userFeedback} />
        )}
        
        {userAnswer && (
            <div className="pdf-footer hidden print:block mt-8 pt-6 border-t border-[rgb(var(--color-border-secondary))] print:border-gray-400 print-break-inside-avoid">
                 <h4 className="font-bold text-sm text-[rgb(var(--color-text-primary))] print:text-black mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[rgb(var(--color-text-muted))] print:text-black" />
                    Student Answer
                </h4>
                <div className="p-5 rounded-xl border border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/20 print:bg-white print:border-gray-400">
                     <div className="prose prose-sm max-w-none text-[rgb(var(--color-text-secondary))] print:text-black leading-relaxed font-serif whitespace-pre-wrap">
                        {userAnswer}
                    </div>
                </div>
            </div>
        )}
        
        <div className="pdf-footer hidden print:block mt-8 pt-4 border-t border-[rgb(var(--color-border-secondary))] print:border-gray-400 text-center text-[10px] text-[rgb(var(--color-text-dim))] print:text-gray-500 uppercase tracking-widest">
            Generated by HSC AI Evaluator
        </div>

      </div>
    </div>

    <PdfConfigModal 
        isOpen={isPdfConfigOpen}
        onClose={() => setIsPdfConfigOpen(false)}
        onGenerate={handleExportPDF}
        onPreview={handlePreviewOverlay}
        defaultConfig={pdfConfig}
    />
    </>
  );
};

export default EvaluationDisplay;