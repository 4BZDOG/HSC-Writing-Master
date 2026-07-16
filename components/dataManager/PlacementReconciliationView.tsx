import React, { useState, useMemo } from 'react';
import { Course } from '../../types';
import { OrphanedGroup, PlacementMap } from '../../utils/dataManagerUtils';
import { ActionButtons } from './common';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  SkipForward,
  Package,
  Layers,
} from 'lucide-react';

interface PlacementReconciliationViewProps {
  orphanedGroups: OrphanedGroup[];
  existingCourses: Course[];
  onApply: (placements: PlacementMap) => void;
  onBack: () => void;
}

interface GroupPlacement {
  topicId?: string;
  subTopicId?: string;
  dotPointId?: string;
  skipped: boolean;
}

const PlacementReconciliationView: React.FC<PlacementReconciliationViewProps> = ({
  orphanedGroups,
  existingCourses,
  onApply,
  onBack,
}) => {
  const [placements, setPlacements] = useState<Map<string, GroupPlacement>>(() => {
    const initial = new Map<string, GroupPlacement>();
    orphanedGroups.forEach((g) => {
      initial.set(g.id, { skipped: false });
    });
    return initial;
  });

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    existingCourses.forEach((c) => map.set(c.id, c));
    return map;
  }, [existingCourses]);

  const stats = useMemo(() => {
    let placed = 0;
    let skipped = 0;
    let remaining = 0;
    placements.forEach((p) => {
      if (p.skipped) skipped++;
      else if (p.topicId && p.subTopicId && p.dotPointId) placed++;
      else remaining++;
    });
    return { placed, skipped, remaining, total: orphanedGroups.length };
  }, [placements, orphanedGroups.length]);

  const totalPrompts = useMemo(
    () => orphanedGroups.reduce((acc, g) => acc + g.prompts.length, 0),
    [orphanedGroups]
  );

  const updatePlacement = (groupId: string, updates: Partial<GroupPlacement>) => {
    setPlacements((prev) => {
      const next = new Map(prev);
      const current = next.get(groupId) || { skipped: false };
      const updated = { ...current, ...updates };
      if (updates.topicId !== undefined && updates.topicId !== current.topicId) {
        updated.subTopicId = undefined;
        updated.dotPointId = undefined;
      }
      if (updates.subTopicId !== undefined && updates.subTopicId !== current.subTopicId) {
        updated.dotPointId = undefined;
      }
      if (updates.skipped) {
        updated.topicId = undefined;
        updated.subTopicId = undefined;
        updated.dotPointId = undefined;
      }
      next.set(groupId, updated);
      return next;
    });
  };

  const [bulkPlacement, setBulkPlacement] = useState<{
    topicId?: string;
    subTopicId?: string;
    dotPointId?: string;
  }>({});
  const [showBulkPlacer, setShowBulkPlacer] = useState(false);

  const bulkCourse = useMemo(() => {
    const courseIds = new Set(orphanedGroups.map((g) => g.targetCourseId));
    if (courseIds.size === 1) return courseMap.get([...courseIds][0]);
    return undefined;
  }, [orphanedGroups, courseMap]);

  const handleSkipAll = () => {
    setPlacements((prev) => {
      const next = new Map(prev);
      next.forEach((p, id) => {
        if (!p.skipped && !(p.topicId && p.subTopicId && p.dotPointId)) {
          next.set(id, { skipped: true });
        }
      });
      return next;
    });
  };

  const handlePlaceAllRemaining = () => {
    if (!bulkPlacement.topicId || !bulkPlacement.subTopicId || !bulkPlacement.dotPointId) return;
    setPlacements((prev) => {
      const next = new Map(prev);
      next.forEach((p, id) => {
        if (!p.skipped && !(p.topicId && p.subTopicId && p.dotPointId)) {
          next.set(id, {
            topicId: bulkPlacement.topicId!,
            subTopicId: bulkPlacement.subTopicId!,
            dotPointId: bulkPlacement.dotPointId!,
            skipped: false,
          });
        }
      });
      return next;
    });
    setShowBulkPlacer(false);
    setBulkPlacement({});
  };

  const handleApply = () => {
    const result: PlacementMap = new Map();
    placements.forEach((p, id) => {
      if (p.skipped) {
        result.set(id, 'skip');
      } else if (p.topicId && p.subTopicId && p.dotPointId) {
        result.set(id, {
          topicId: p.topicId,
          subTopicId: p.subTopicId,
          dotPointId: p.dotPointId,
        });
      }
    });
    onApply(result);
  };

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const getStatusStyle = (p: GroupPlacement) => {
    if (p.skipped) return 'border-amber-500/30 bg-amber-500/5';
    if (p.topicId && p.subTopicId && p.dotPointId) return 'border-emerald-500/30 bg-emerald-500/5';
    return 'border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface))]/50';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 md:px-8 py-5 md:py-6 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[rgb(var(--color-text-primary))] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Structure Reconciliation
            </h3>
            <p className="text-sm text-[rgb(var(--color-text-secondary))] mt-1">
              {totalPrompts} question{totalPrompts !== 1 ? 's' : ''} across {orphanedGroups.length}{' '}
              group{orphanedGroups.length !== 1 ? 's' : ''} don't match your existing syllabus
              structure.
            </p>
          </div>
          <button
            onClick={onBack}
            className="text-xs font-bold text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] flex items-center gap-1 self-start py-1.5 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" /> {stats.placed} placed
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <SkipForward className="w-3.5 h-3.5" /> {stats.skipped} skipped
            </span>
            <span className="text-[rgb(var(--color-text-muted))]">{stats.remaining} remaining</span>
          </div>
          {stats.remaining > 0 && (
            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
              {bulkCourse && (
                <button
                  onClick={() => setShowBulkPlacer(!showBulkPlacer)}
                  aria-expanded={showBulkPlacer}
                  className={`flex-1 sm:flex-none justify-center text-[10px] font-bold px-3 py-2 sm:py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                    showBulkPlacer
                      ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                      : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20'
                  }`}
                >
                  <Layers className="w-3 h-3" /> Place All Remaining
                </button>
              )}
              <button
                onClick={handleSkipAll}
                className="flex-1 sm:flex-none justify-center text-[10px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 sm:py-1.5 rounded-lg border border-amber-500/20 transition-all flex items-center gap-1.5"
              >
                <SkipForward className="w-3 h-3" /> Skip All Remaining
              </button>
            </div>
          )}
        </div>

        <div className="mt-3 h-1.5 bg-[rgb(var(--color-bg-surface-inset))] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
            style={{
              width: `${((stats.placed + stats.skipped) / Math.max(stats.total, 1)) * 100}%`,
            }}
          />
        </div>

        {showBulkPlacer && bulkCourse && (
          <div className="mt-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 animate-fade-in">
            <p className="text-xs font-bold text-emerald-400 mb-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Place all {stats.remaining} remaining group{stats.remaining !== 1 ? 's' : ''} into:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label
                  htmlFor="bulk-topic"
                  className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1 block"
                >
                  Topic
                </label>
                <select
                  id="bulk-topic"
                  value={bulkPlacement.topicId || ''}
                  onChange={(e) => setBulkPlacement({ topicId: e.target.value || undefined })}
                  className="w-full bg-[rgb(var(--color-bg-surface-inset))] text-xs text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-2.5 sm:p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                >
                  <option value="">Select topic...</option>
                  {bulkCourse.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="bulk-subtopic"
                  className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1 block"
                >
                  Sub-topic
                </label>
                <select
                  id="bulk-subtopic"
                  value={bulkPlacement.subTopicId || ''}
                  onChange={(e) =>
                    setBulkPlacement((prev) => ({
                      topicId: prev.topicId,
                      subTopicId: e.target.value || undefined,
                    }))
                  }
                  disabled={!bulkPlacement.topicId}
                  className="w-full bg-[rgb(var(--color-bg-surface-inset))] text-xs text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-2.5 sm:p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-40"
                >
                  <option value="">{bulkPlacement.topicId ? 'Select sub-topic...' : '—'}</option>
                  {(
                    bulkCourse.topics.find((t) => t.id === bulkPlacement.topicId)?.subTopics || []
                  ).map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="bulk-dotpoint"
                  className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1 block"
                >
                  Dot Point
                </label>
                <select
                  id="bulk-dotpoint"
                  value={bulkPlacement.dotPointId || ''}
                  onChange={(e) =>
                    setBulkPlacement((prev) => ({
                      topicId: prev.topicId,
                      subTopicId: prev.subTopicId,
                      dotPointId: e.target.value || undefined,
                    }))
                  }
                  disabled={!bulkPlacement.subTopicId}
                  className="w-full bg-[rgb(var(--color-bg-surface-inset))] text-xs text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-2.5 sm:p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-40"
                >
                  <option value="">{bulkPlacement.subTopicId ? 'Select dot point...' : '—'}</option>
                  {(
                    bulkCourse.topics
                      .find((t) => t.id === bulkPlacement.topicId)
                      ?.subTopics.find((st) => st.id === bulkPlacement.subTopicId)?.dotPoints || []
                  ).map((dp) => (
                    <option key={dp.id} value={dp.id}>
                      {dp.description.length > 60
                        ? dp.description.slice(0, 60) + '...'
                        : dp.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button
                onClick={handlePlaceAllRemaining}
                disabled={
                  !bulkPlacement.topicId || !bulkPlacement.subTopicId || !bulkPlacement.dotPointId
                }
                className="w-full sm:w-auto justify-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 sm:py-2 rounded-lg transition-all disabled:opacity-40 disabled:hover:bg-emerald-600 flex items-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5" />
                Place {stats.remaining} Group{stats.remaining !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
        <div className="space-y-3 max-w-4xl mx-auto">
          {orphanedGroups.map((group) => {
            const placement = placements.get(group.id) || { skipped: false };
            const course = courseMap.get(group.targetCourseId);
            if (!course) return null;

            const topics = course.topics;
            const selectedTopic = topics.find((t) => t.id === placement.topicId);
            const subTopics = selectedTopic?.subTopics || [];
            const selectedST = subTopics.find((st) => st.id === placement.subTopicId);
            const dotPoints = selectedST?.dotPoints || [];
            const isExpanded = expandedGroups.has(group.id);
            const isComplete =
              placement.skipped ||
              !!(placement.topicId && placement.subTopicId && placement.dotPointId);

            return (
              <div
                key={group.id}
                className={`rounded-xl border transition-all ${getStatusStyle(placement)}`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {placement.skipped ? (
                          <SkipForward className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : isComplete ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Package className="w-4 h-4 text-[rgb(var(--color-text-muted))] shrink-0" />
                        )}
                        <span className="text-xs font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider">
                          {group.prompts.length} question
                          {group.prompts.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="text-sm text-[rgb(var(--color-text-secondary))] leading-snug">
                        <span className="font-bold text-[rgb(var(--color-text-primary))]">
                          {group.sourceTopicName}
                        </span>
                        <ArrowRight className="w-3 h-3 inline mx-1.5 opacity-40" />
                        <span className="font-medium">{group.sourceSubTopicName}</span>
                        <ArrowRight className="w-3 h-3 inline mx-1.5 opacity-40" />
                        <span className="italic opacity-70 text-xs">
                          {group.sourceDotPointDescription.length > 80
                            ? group.sourceDotPointDescription.slice(0, 80) + '...'
                            : group.sourceDotPointDescription}
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExpand(group.id)}
                      className="p-2 rounded-lg hover:bg-white/5 text-[rgb(var(--color-text-muted))] transition-colors shrink-0"
                      aria-label={
                        isExpanded ? 'Collapse question preview' : 'Expand question preview'
                      }
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mb-4 sm:ml-6 p-3 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 border border-[rgb(var(--color-border-secondary))]/50 animate-fade-in">
                      <p className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-2">
                        Questions in this group
                      </p>
                      <ul className="space-y-1.5">
                        {group.prompts.map((prompt, i) => (
                          <li
                            key={prompt.id || i}
                            className="text-xs text-[rgb(var(--color-text-secondary))] leading-relaxed"
                          >
                            <span className="text-[rgb(var(--color-text-muted))] font-mono mr-2">
                              {i + 1}.
                            </span>
                            {prompt.question.length > 120
                              ? prompt.question.slice(0, 120) + '...'
                              : prompt.question}
                            {prompt.totalMarks > 0 && (
                              <span className="ml-2 text-[10px] font-bold text-[rgb(var(--color-accent))]">
                                ({prompt.totalMarks} marks)
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {placement.skipped ? (
                    <div className="flex items-center justify-between gap-3 sm:ml-6">
                      <span className="text-xs font-medium text-amber-400 italic">
                        Skipped — these questions will not be imported.
                      </span>
                      <button
                        onClick={() => updatePlacement(group.id, { skipped: false })}
                        className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))] transition-colors py-1.5 px-2 -my-1.5 rounded-lg hover:bg-white/5"
                      >
                        Undo
                      </button>
                    </div>
                  ) : (
                    <div className="sm:ml-6 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label
                            htmlFor={`${group.id}-topic`}
                            className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1 block"
                          >
                            Topic
                          </label>
                          <select
                            id={`${group.id}-topic`}
                            value={placement.topicId || ''}
                            onChange={(e) =>
                              updatePlacement(group.id, { topicId: e.target.value || undefined })
                            }
                            className="w-full bg-[rgb(var(--color-bg-surface-inset))] text-xs text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-2.5 sm:p-2 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-accent))] transition-colors"
                          >
                            <option value="">Select topic...</option>
                            {topics.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`${group.id}-subtopic`}
                            className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1 block"
                          >
                            Sub-topic
                          </label>
                          <select
                            id={`${group.id}-subtopic`}
                            value={placement.subTopicId || ''}
                            onChange={(e) =>
                              updatePlacement(group.id, {
                                subTopicId: e.target.value || undefined,
                              })
                            }
                            disabled={!placement.topicId}
                            className="w-full bg-[rgb(var(--color-bg-surface-inset))] text-xs text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-2.5 sm:p-2 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-accent))] transition-colors disabled:opacity-40"
                          >
                            <option value="">
                              {placement.topicId ? 'Select sub-topic...' : '—'}
                            </option>
                            {subTopics.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor={`${group.id}-dotpoint`}
                            className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] uppercase tracking-wider mb-1 block"
                          >
                            Dot Point
                          </label>
                          <select
                            id={`${group.id}-dotpoint`}
                            value={placement.dotPointId || ''}
                            onChange={(e) =>
                              updatePlacement(group.id, {
                                dotPointId: e.target.value || undefined,
                              })
                            }
                            disabled={!placement.subTopicId}
                            className="w-full bg-[rgb(var(--color-bg-surface-inset))] text-xs text-[rgb(var(--color-text-primary))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-2.5 sm:p-2 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-accent))] transition-colors disabled:opacity-40"
                          >
                            <option value="">
                              {placement.subTopicId ? 'Select dot point...' : '—'}
                            </option>
                            {dotPoints.map((dp) => (
                              <option key={dp.id} value={dp.id}>
                                {dp.description.length > 60
                                  ? dp.description.slice(0, 60) + '...'
                                  : dp.description}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {placement.topicId && placement.subTopicId && placement.dotPointId && (
                        <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium animate-fade-in">
                          <MapPin className="w-3 h-3" />
                          Placed into {selectedTopic?.name}
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          onClick={() => updatePlacement(group.id, { skipped: true })}
                          className="text-[10px] font-bold text-amber-400/70 hover:text-amber-400 transition-colors flex items-center gap-1 py-1.5 px-2 -my-1 rounded-lg hover:bg-amber-500/10"
                        >
                          <SkipForward className="w-3 h-3" /> Skip
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ActionButtons
        onCancel={onBack}
        onConfirm={handleApply}
        confirmText={`Apply & Continue (${stats.placed} placed)`}
        isConfirmDisabled={stats.remaining > 0}
        hint={
          stats.remaining > 0
            ? `Place or skip ${stats.remaining} remaining group${stats.remaining !== 1 ? 's' : ''} to continue.`
            : undefined
        }
      />
    </div>
  );
};

export default PlacementReconciliationView;
