import React, { useSyncExternalStore } from 'react';
import { Cpu } from 'lucide-react';
import { getSelectionSnapshot, setSelectedModel, subscribeAiConfig } from '../../services/aiConfig';
import { modelsForRole, type AIRole } from '../../services/aiModels';

const ROLE_LABELS: Record<AIRole, string> = {
  reasoning: 'Marking & reasoning',
  basic: 'Generation & parsing',
};

/**
 * The admin AI-engine picker: one dropdown per role (marking/reasoning and
 * generation/parsing) listing the models offered for that role. Backed by the
 * runtime selection store (`services/aiConfig.ts`), so it stays in sync wherever
 * it is mounted — the API telemetry widget and the Runtime AI Keys modal both
 * render this same control. Needs no Supabase; it only requires an admin.
 */
const AiEngineSelector: React.FC<{ className?: string }> = ({ className = '' }) => {
  const selection = useSyncExternalStore(
    subscribeAiConfig,
    getSelectionSnapshot,
    getSelectionSnapshot
  );

  return (
    <div className={className}>
      <div className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-2 flex items-center gap-2">
        <Cpu className="w-3.5 h-3.5" />
        AI Engine
      </div>
      <div className="space-y-2">
        {(['reasoning', 'basic'] as AIRole[]).map((role) => (
          <label key={role} className="block">
            <span className="text-[10px] text-[rgb(var(--color-text-dim))]">
              {ROLE_LABELS[role]}
            </span>
            <select
              value={selection[role]}
              onChange={(e) => setSelectedModel(role, e.target.value)}
              aria-label={`${ROLE_LABELS[role]} model`}
              className="mt-0.5 w-full text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/60 border border-[rgb(var(--color-border-secondary))]/40 text-[rgb(var(--color-text-secondary))] px-2 py-1.5 outline-none focus:border-[rgb(var(--color-accent))]/60 transition-colors"
            >
              {modelsForRole(role).map((m) => (
                <option key={m.id} value={m.id} title={m.description}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="mt-2 text-[9px] leading-relaxed text-[rgb(var(--color-text-dim))]">
        Applies to new requests. Non-Gemini engines require their server-side API key.
      </p>
    </div>
  );
};

export default AiEngineSelector;
