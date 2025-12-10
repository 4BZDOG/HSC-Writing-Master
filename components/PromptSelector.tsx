
import React, { useMemo } from 'react';
import { Course, StatePath, UserRole, PromptVerb } from '../types';
import Combobox from './Combobox';
import { 
  Plus, Edit3, Trash2, Sparkles, Settings, Upload, BookOpen, 
  Layers, FolderOpen, List, FileQuestion, ChevronDown, Book
} from 'lucide-react';
import { getCommandTermInfo, extractCommandVerb } from '../data/commandTerms';
import { getBandConfig } from '../utils/renderUtils';

interface PromptSelectorProps {
  courses: Course[];
  statePath: StatePath;
  onPathChange: (path: Partial<StatePath>) => void;
  onAddCourse: () => void;
  onAddTopic: () => void;
  onAddSubTopic: () => void;
  onGeneratePrompt: () => void;
  onEditOutcomes: () => void;
  onRenameItem: (type: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt', id: string, name: string) => void;
  onDeleteItem: (target: { type: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt'; id: string; name: string }) => void;
  onAddTopicFromSyllabus: () => void;
  onGenerateSuggestedTopic: () => void;
  onGenerateDotPoints: () => void;
  onImportTopic: () => void;
  newlyAddedIds: Set<string>;
  userRole: UserRole;
}

const PromptSelector: React.FC<PromptSelectorProps> = ({
  courses,
  statePath,
  onPathChange,
  onAddCourse,
  onAddTopic,
  onAddSubTopic,
  onGeneratePrompt,
  onEditOutcomes,
  onRenameItem,
  onDeleteItem,
  onAddTopicFromSyllabus,
  onGenerateSuggestedTopic,
  onGenerateDotPoints,
  onImportTopic,
  newlyAddedIds,
  userRole
}) => {
  const isAdmin = userRole === 'admin';

  // Selection Resolution
  const selectedCourse = courses.find(c => c.id === statePath.courseId);
  const selectedTopic = selectedCourse?.topics.find(t => t.id === statePath.topicId);
  const selectedSubTopic = selectedTopic?.subTopics.find(st => st.id === statePath.subTopicId);
  const selectedDotPoint = selectedSubTopic?.dotPoints.find(dp => dp.id === statePath.dotPointId);
  const selectedPrompt = selectedDotPoint?.prompts.find(p => p.id === statePath.promptId);

  // Selection State Booleans
  const isCourseSelected = !!selectedCourse;
  const isTopicSelected = !!selectedTopic;
  const isSubTopicSelected = !!selectedSubTopic;
  const isDotPointSelected = !!selectedDotPoint;
  const isPromptSelected = !!selectedPrompt;

  // Options Memos with Rich Icons
  const courseOptions = useMemo(() => courses.map(c => ({ 
      id: c.id, 
      label: c.name, 
      isNew: newlyAddedIds.has(c.id),
      renderLabel: (
        <div className="flex items-center gap-3">
           <div className="p-1.5 rounded-md bg-blue-500/20 text-blue-500 light:bg-blue-100 light:text-blue-700 border border-blue-500/20 flex-shrink-0">
               <Book className="w-4 h-4" />
           </div>
           <span className="font-medium">{c.name}</span>
        </div>
      )
  })), [courses, newlyAddedIds]);

  const topicOptions = useMemo(() => selectedCourse?.topics.map(t => ({ 
      id: t.id, 
      label: t.name, 
      isNew: newlyAddedIds.has(t.id),
      renderLabel: (
        <div className="flex items-center gap-3">
           <div className="p-1.5 rounded-md bg-purple-500/20 text-purple-500 light:bg-purple-100 light:text-purple-700 border border-purple-500/20 flex-shrink-0">
               <Layers className="w-4 h-4" />
           </div>
           <span className="font-medium">{t.name}</span>
        </div>
      )
  })) || [], [selectedCourse, newlyAddedIds]);

  const subTopicOptions = useMemo(() => selectedTopic?.subTopics.map(st => ({ 
      id: st.id, 
      label: st.name, 
      isNew: newlyAddedIds.has(st.id),
      renderLabel: (
        <div className="flex items-center gap-3">
           <div className="p-1.5 rounded-md bg-indigo-500/20 text-indigo-500 light:bg-indigo-100 light:text-indigo-700 border border-indigo-500/20 flex-shrink-0">
               <FolderOpen className="w-4 h-4" />
           </div>
           <span className="font-medium">{st.name}</span>
        </div>
      )
  })) || [], [selectedTopic, newlyAddedIds]);

  const dotPointOptions = useMemo(() => selectedSubTopic?.dotPoints.map(dp => ({ 
      id: dp.id, 
      label: dp.description, 
      isNew: newlyAddedIds.has(dp.id),
      renderLabel: (
        <div className="flex items-start gap-3">
           <div className="p-1.5 rounded-md bg-pink-500/20 text-pink-500 light:bg-pink-100 light:text-pink-700 border border-pink-500/20 mt-0.5 flex-shrink-0">
               <List className="w-4 h-4" />
           </div>
           <span className="leading-snug font-medium">{dp.description}</span>
        </div>
      )
  })) || [], [selectedSubTopic, newlyAddedIds]);

  const promptOptions = useMemo(() => {
      if (!selectedDotPoint?.prompts) return [];
      
      // Helper to robustly find verb info
      const resolveVerbInfo = (verb?: string, question?: string) => {
          if (verb) {
              const normalized = verb.toUpperCase() as PromptVerb;
              const info = getCommandTermInfo(normalized);
              if (info.term === 'EXPLAIN' && normalized !== 'EXPLAIN') {
                   // Continue to extraction to see if we can find a better match
              } else {
                  return info;
              }
          }
          if (question) {
              const extracted = extractCommandVerb(question);
              if (extracted) return extracted;
          }
          return getCommandTermInfo('EXPLAIN');
      };

      // Sort questions: Tier (asc) -> Marks (asc) -> ID (asc)
      const sortedPrompts = [...selectedDotPoint.prompts].sort((a, b) => {
          const infoA = resolveVerbInfo(a.verb, a.question);
          const infoB = resolveVerbInfo(b.verb, b.question);
          
          if (infoA.tier !== infoB.tier) {
              return infoA.tier - infoB.tier;
          }
          if (a.totalMarks !== b.totalMarks) {
              return a.totalMarks - b.totalMarks;
          }
          return a.id.localeCompare(b.id);
      });

      return sortedPrompts.map(p => {
          const verbInfo = resolveVerbInfo(p.verb, p.question);
          const safeTier = Math.max(1, Math.min(6, Math.floor(verbInfo.tier || 4)));
          const tierConfig = getBandConfig(safeTier);

          return {
              id: p.id,
              label: p.question,
              marks: p.totalMarks,
              verb: verbInfo.term,
              tier: safeTier,
              isNew: newlyAddedIds.has(p.id),
              renderLabel: (
                <div className="flex items-start gap-3 w-full overflow-hidden">
                   {/* Solid, Tier-coded Icon Box - Using solidBg + text-white for guaranteed visibility */}
                   <div className={`
                       w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border
                       ${tierConfig.solidBg} ${tierConfig.border}
                       transition-colors duration-200 shadow-sm
                   `}>
                       <FileQuestion className="w-5 h-5 text-white" />
                   </div>
                   <div className="flex flex-col min-w-0 flex-1">
                     <span 
                        className="leading-snug font-medium line-clamp-2 block break-words"
                        title={p.question}
                     >
                        {p.question}
                     </span>
                     <div className="flex items-center gap-2 mt-1.5">
                        {/* Solid Pill for Verb - Ensures color pop regardless of row selection state */}
                        <span className={`
                            text-[9px] font-black uppercase tracking-wider px-1.5 py-px rounded border
                            ${tierConfig.solidBg} text-white ${tierConfig.border} shadow-sm
                        `}>
                            {verbInfo.term}
                        </span>
                        <span className="text-[10px] opacity-70 font-mono font-medium">
                            • {p.totalMarks} Marks
                        </span>
                     </div>
                   </div>
                </div>
              )
          };
      });
  }, [selectedDotPoint, newlyAddedIds]);

  // Style Helpers
  const getContainerClasses = (isSelected: boolean, isActive: boolean, zIndex: string) => `
    relative transition-all duration-500 ease-in-out w-full
    ${zIndex}
    ${isSelected 
      ? 'mb-1' // Tight spacing when locked in
      : 'mb-6' // Room to breathe when active
    }
  `;

  const getBoxClasses = (isSelected: boolean, isActive: boolean) => `
    relative rounded-2xl transition-all duration-500 ease-out w-full
    ${isSelected 
      ? 'bg-[rgb(var(--color-bg-surface))]/60 light:bg-white/80 border border-[rgb(var(--color-primary))]/20 light:border-slate-300 py-3 px-4 shadow-sm z-10' 
      : isActive
        ? 'bg-[rgb(var(--color-bg-surface))] light:bg-white border-2 border-[rgb(var(--color-primary))] light:border-indigo-500 shadow-xl py-6 px-6 scale-[1.01] z-20'
        : 'bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 py-4 px-6 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'
    }
  `;

  const getNodeClasses = (isSelected: boolean, isComplete: boolean) => `
      absolute -left-[0.85rem] md:-left-[0.85rem] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 transition-all duration-500 z-10
      ${isComplete
        ? 'bg-purple-500 border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)] scale-100'
        : isSelected
          ? 'bg-[rgb(var(--color-bg-surface))] border-[rgb(var(--color-accent))] shadow-[0_0_8px_rgba(14,165,233,0.4)] scale-125'
          : 'bg-[rgb(var(--color-bg-surface))] border-[rgb(var(--color-text-muted))] scale-90 opacity-50'
      }
  `;

  const StepHeader = ({ icon: Icon, label, isSelected, colorClass }: any) => (
    <div className={`flex items-center gap-2 mb-3 transition-all duration-300 ${isSelected ? 'opacity-70 scale-95 origin-left' : 'opacity-100'}`}>
        <div className={`p-1.5 rounded-md ${isSelected ? 'bg-transparent' : `bg-${colorClass}-500/10 text-${colorClass}-400`}`}>
            <Icon className={`w-4 h-4 ${isSelected ? 'text-[rgb(var(--color-text-secondary))]' : `text-${colorClass}-400`}`} />
        </div>
        <span className={`text-xs font-black uppercase tracking-widest ${isSelected ? 'text-[rgb(var(--color-text-secondary))]' : 'text-[rgb(var(--color-text-primary))] light:text-slate-800'}`}>
            {label}
        </span>
        {isSelected && <div className="h-px flex-grow bg-[rgb(var(--color-border-secondary))]/50 ml-2"></div>}
    </div>
  );

  const ActionButton = ({ onClick, icon: Icon, title, variant = 'default' }: any) => (
      <button 
        onClick={onClick} 
        className={`p-2 rounded-lg transition-all duration-200 flex-shrink-0 hover:scale-105 active:scale-95 ${
            variant === 'danger' 
            ? 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-red-50 hover:bg-red-500/10 text-[rgb(var(--color-text-secondary))] light:text-red-600 hover:text-red-400' 
            : variant === 'special'
            ? 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-amber-50 hover:bg-[rgb(var(--color-bg-surface-light))] text-yellow-400 light:text-amber-600'
            : variant === 'primary'
            ? 'bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] text-white shadow-md hover:shadow-lg'
            : variant === 'info'
            ? 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-blue-50 hover:bg-[rgb(var(--color-bg-surface-light))] text-blue-400 light:text-blue-600'
            : 'bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-light))] text-[rgb(var(--color-text-secondary))] light:text-slate-600'
        }`} 
        title={title}
      >
         <Icon className="w-4 h-4" />
      </button>
  );

  return (
    <div className="flex flex-col pl-4 md:pl-12 relative">
      <div className="absolute left-[1.35rem] md:left-[2.35rem] top-0 bottom-0 w-px bg-[rgb(var(--color-border-secondary))]/20 z-0"></div>
      
      {/* Course Level */}
      <div className={getContainerClasses(isCourseSelected, !isCourseSelected, 'z-50')}>
        <div className={getBoxClasses(isCourseSelected, !isCourseSelected)}>
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
                <div className={getNodeClasses(isCourseSelected, isTopicSelected)} />
            </div>
            {!isCourseSelected && <StepHeader icon={BookOpen} label="Course Selection" isSelected={false} colorClass="blue" />}
            <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="flex-1 min-w-0 w-full">
                    <Combobox
                        label={isCourseSelected ? null : ""}
                        options={courseOptions}
                        value={statePath.courseId || ''}
                        onChange={(id) => onPathChange({ courseId: id, topicId: undefined, subTopicId: undefined, dotPointId: undefined, promptId: undefined })}
                        placeholder="Select Course..."
                    />
                </div>
                {isAdmin && (
                    <div className={`flex items-center gap-2 ${!isCourseSelected ? 'mt-6 md:mt-0' : ''}`}>
                        <ActionButton onClick={onAddCourse} icon={Plus} title="Add Course" />
                        {selectedCourse && (
                        <>
                            <ActionButton onClick={onEditOutcomes} icon={Settings} title="Edit Outcomes" />
                            <ActionButton onClick={() => onRenameItem('course', selectedCourse.id, selectedCourse.name)} icon={Edit3} title="Rename" />
                            <ActionButton onClick={() => onDeleteItem({ type: 'course', id: selectedCourse.id, name: selectedCourse.name })} icon={Trash2} title="Delete" variant="danger" />
                        </>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Topic Level */}
      {selectedCourse && (
        <div className={`${getContainerClasses(isTopicSelected, isCourseSelected && !isTopicSelected, 'z-40')} animate-fade-in-up`}>
           <div className={getBoxClasses(isTopicSelected, isCourseSelected && !isTopicSelected)}>
               <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
                    <div className={getNodeClasses(isTopicSelected, isSubTopicSelected)} />
               </div>
               {!isTopicSelected && <StepHeader icon={Layers} label="Topic / Module" isSelected={false} colorClass="purple" />}
               <div className="flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex-1 min-w-0 w-full">
                     <Combobox
                        label={isTopicSelected ? null : ""}
                        options={topicOptions}
                        value={statePath.topicId || ''}
                        onChange={(id) => onPathChange({ topicId: id, subTopicId: undefined, dotPointId: undefined, promptId: undefined })}
                        placeholder="Select Topic..."
                     />
                  </div>
                  {isAdmin && (
                     <div className={`flex items-center gap-2 ${!isTopicSelected ? 'mt-6 md:mt-0' : ''}`}>
                        {selectedTopic ? (
                           <>
                              <ActionButton onClick={() => onRenameItem('topic', selectedTopic.id, selectedTopic.name)} icon={Edit3} title="Rename" />
                              <ActionButton onClick={() => onDeleteItem({ type: 'topic', id: selectedTopic.id, name: selectedTopic.name })} icon={Trash2} title="Delete" variant="danger" />
                           </>
                        ) : (
                           <>
                              <ActionButton onClick={onAddTopic} icon={Plus} title="Add Manually" />
                              <ActionButton onClick={onGenerateSuggestedTopic} icon={Sparkles} title="Suggest with AI" variant="special" />
                              <ActionButton onClick={onImportTopic} icon={Upload} title="Import JSON" variant="info" />
                           </>
                        )}
                     </div>
                  )}
               </div>
            </div>
        </div>
      )}

      {/* SubTopic Level */}
      {selectedTopic && (
        <div className={`${getContainerClasses(isSubTopicSelected, isTopicSelected && !isSubTopicSelected, 'z-30')} animate-fade-in-up`}>
           <div className={getBoxClasses(isSubTopicSelected, isTopicSelected && !isSubTopicSelected)}>
                <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
                    <div className={getNodeClasses(isSubTopicSelected, isDotPointSelected)} />
               </div>
               {!isSubTopicSelected && <StepHeader icon={FolderOpen} label="Sub-Topic / Inquiry" isSelected={false} colorClass="indigo" />}
               <div className="flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex-1 min-w-0 w-full">
                     <Combobox
                        label={isSubTopicSelected ? null : ""}
                        options={subTopicOptions}
                        value={statePath.subTopicId || ''}
                        onChange={(id) => onPathChange({ subTopicId: id, dotPointId: undefined, promptId: undefined })}
                        placeholder="Select Sub-Topic..."
                     />
                  </div>
                  {isAdmin && (
                     <div className={`flex items-center gap-2 ${!isSubTopicSelected ? 'mt-6 md:mt-0' : ''}`}>
                        {selectedSubTopic ? (
                           <>
                              <ActionButton onClick={() => onRenameItem('subTopic', selectedSubTopic.id, selectedSubTopic.name)} icon={Edit3} title="Rename" />
                              <ActionButton onClick={() => onDeleteItem({ type: 'subTopic', id: selectedSubTopic.id, name: selectedSubTopic.name })} icon={Trash2} title="Delete" variant="danger" />
                           </>
                        ) : (
                           <>
                              <ActionButton onClick={onAddSubTopic} icon={Plus} title="Add Manually" />
                              <ActionButton onClick={onAddTopicFromSyllabus} icon={BookOpen} title="Parse Syllabus" variant="info" />
                           </>
                        )}
                     </div>
                  )}
               </div>
            </div>
        </div>
      )}

      {/* Dot Point Level */}
      {selectedSubTopic && (
        <div className={`${getContainerClasses(isDotPointSelected, isSubTopicSelected && !isDotPointSelected, 'z-20')} animate-fade-in-up`}>
           <div className={getBoxClasses(isDotPointSelected, isSubTopicSelected && !isDotPointSelected)}>
                <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
                    <div className={getNodeClasses(isDotPointSelected, isPromptSelected)} />
               </div>
               {!isDotPointSelected && <StepHeader icon={List} label="Syllabus Dot Point" isSelected={false} colorClass="pink" />}
               <div className="flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex-1 min-w-0 w-full">
                     <Combobox
                        label={isDotPointSelected ? null : ""}
                        options={dotPointOptions}
                        value={statePath.dotPointId || ''}
                        onChange={(id) => onPathChange({ dotPointId: id, promptId: undefined })}
                        placeholder="Select Dot Point..."
                     />
                  </div>
                  {isAdmin && (
                     <div className={`flex items-center gap-2 ${!isDotPointSelected ? 'mt-6 md:mt-0' : ''}`}>
                        {selectedDotPoint ? (
                           <>
                              <ActionButton onClick={() => onRenameItem('dotPoint', selectedDotPoint.id, selectedDotPoint.description)} icon={Edit3} title="Edit Text" />
                              <ActionButton onClick={() => onDeleteItem({ type: 'dotPoint', id: selectedDotPoint.id, name: selectedDotPoint.description })} icon={Trash2} title="Delete" variant="danger" />
                           </>
                        ) : (
                           <ActionButton onClick={onGenerateDotPoints} icon={Sparkles} title="Auto-Generate" variant="special" />
                        )}
                     </div>
                  )}
               </div>
            </div>
        </div>
      )}

      {/* Question Level */}
      {selectedDotPoint && (
        <div className={`${getContainerClasses(isPromptSelected, isDotPointSelected && !isPromptSelected, 'z-10')} animate-fade-in-up`}>
           <div className={getBoxClasses(isPromptSelected, isDotPointSelected && !isPromptSelected)}>
               <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-10 flex items-center justify-center">
                    <div className={getNodeClasses(isPromptSelected, false)} />
               </div>
               {!isPromptSelected && <StepHeader icon={FileQuestion} label="Challenge Question" isSelected={false} colorClass="green" />}
               <div className="flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex-1 min-w-0 w-full">
                     <Combobox
                        label={isPromptSelected ? null : ""}
                        options={promptOptions}
                        value={statePath.promptId || ''}
                        onChange={(id) => onPathChange({ promptId: id })}
                        placeholder="Select Question..."
                     />
                  </div>
                  {isAdmin && (
                     <div className={`flex items-center gap-2 ${!isPromptSelected ? 'mt-6 md:mt-0' : ''}`}>
                        {selectedPrompt ? (
                           <>
                               <ActionButton onClick={onGeneratePrompt} icon={Sparkles} title="Generate Another Question" variant="primary" />
                               <ActionButton onClick={() => onDeleteItem({ type: 'prompt', id: selectedPrompt.id, name: selectedPrompt.question })} icon={Trash2} title="Delete" variant="danger" />
                           </>
                        ) : (
                           <button onClick={onGeneratePrompt} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all" title="Generate New Question">
                              <Sparkles className="w-4 h-4" /> Generate
                           </button>
                        )}
                     </div>
                  )}
               </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default PromptSelector;
