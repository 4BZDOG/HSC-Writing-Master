import React, { useState, useEffect } from 'react';
import { X, FileDown, Eye, RotateCcw } from 'lucide-react';

export interface PdfConfig {
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
    scale: number;
    filename: string;
    containerWidth: number;
}

interface PdfConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (config: PdfConfig) => void;
    onPreview: (config: PdfConfig) => void;
    defaultConfig: PdfConfig;
}

const PdfConfigModal: React.FC<PdfConfigModalProps> = ({ isOpen, onClose, onGenerate, onPreview, defaultConfig }) => {
    const [config, setConfig] = useState<PdfConfig>(defaultConfig);

    // Update internal state if defaults change (e.g. filename updates)
    useEffect(() => {
        setConfig(prev => ({ ...prev, filename: defaultConfig.filename }));
    }, [defaultConfig.filename]);

    if (!isOpen) return null;

    const handleChange = (field: keyof PdfConfig, value: string | number) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleReset = () => {
        setConfig(defaultConfig);
    };

    return (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[rgb(var(--color-bg-surface))] rounded-2xl border border-[rgb(var(--color-border-secondary))] w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
                
                <div className="px-6 py-4 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex justify-between items-center">
                    <h3 className="font-bold text-[rgb(var(--color-text-primary))] flex items-center gap-2">
                        PDF Export Settings
                    </h3>
                    <button 
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-muted))] transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* File Settings */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))]">File Details</label>
                        <div>
                            <input 
                                type="text" 
                                value={config.filename}
                                onChange={e => handleChange('filename', e.target.value)}
                                className="w-full bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded-lg px-3 py-2 text-sm text-[rgb(var(--color-text-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
                                placeholder="Enter filename..."
                            />
                        </div>
                    </div>

                    {/* Dimensions */}
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] block mb-1.5">Scale (Quality)</label>
                            <input 
                                type="number" 
                                value={config.scale}
                                onChange={e => handleChange('scale', parseFloat(e.target.value))}
                                step="0.5"
                                min="1"
                                max="4"
                                className="w-full bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded-lg px-3 py-2 text-sm text-[rgb(var(--color-text-primary))]"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] block mb-1.5">Width (px)</label>
                            <input 
                                type="number" 
                                value={config.containerWidth}
                                onChange={e => handleChange('containerWidth', parseInt(e.target.value))}
                                step="10"
                                className="w-full bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded-lg px-3 py-2 text-sm text-[rgb(var(--color-text-primary))]"
                            />
                        </div>
                    </div>

                    {/* Margins */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))]">Margins (mm)</label>
                            <button onClick={handleReset} className="text-[10px] text-[rgb(var(--color-accent))] hover:underline flex items-center gap-1">
                                <RotateCcw className="w-3 h-3" /> Reset Defaults
                            </button>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            {['Top', 'Right', 'Bottom', 'Left'].map((side) => {
                                const key = `margin${side}` as keyof PdfConfig;
                                return (
                                    <div key={side}>
                                        <label className="text-[10px] text-center block mb-1 text-[rgb(var(--color-text-secondary))]">{side}</label>
                                        <input 
                                            type="number" 
                                            value={config[key]}
                                            onChange={e => handleChange(key, parseFloat(e.target.value))}
                                            className="w-full bg-[rgb(var(--color-bg-surface-inset))] border border-[rgb(var(--color-border-secondary))] rounded-lg px-2 py-2 text-sm text-center text-[rgb(var(--color-text-primary))]"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 flex justify-between items-center border-t border-[rgb(var(--color-border-secondary))]">
                     <button 
                        onClick={() => onPreview(config)}
                        className="px-4 py-2 rounded-xl bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 text-xs font-bold flex items-center gap-2 transition-all hover:scale-105"
                        title="Render the print view to screen for debugging (click overlay to close)"
                     >
                        <Eye className="w-4 h-4" /> Preview Overlay
                    </button>
                    <button 
                        onClick={() => onGenerate(config)}
                        className="px-6 py-2 rounded-xl bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] text-white text-xs font-bold flex items-center gap-2 shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                    >
                        <FileDown className="w-4 h-4" /> Generate PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PdfConfigModal;