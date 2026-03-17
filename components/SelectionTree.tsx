import React from 'react';
import { TreeItem } from '../utils/dataManagerUtils';
import { BookOpen, ChevronRight, Folder, Hash } from 'lucide-react';

interface SelectionTreeProps {
  items: TreeItem[];
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  onToggleSelect: (id: string, isSelected: boolean) => void;
  onToggleExpand: (id: string) => void;
  level?: number;
}

const itemTypeStyles: { [key: string]: { icon: React.ReactNode; color: string } } = {
  course: {
    icon: <BookOpen className="w-3.5 h-3.5" />,
    color: 'text-[rgb(var(--color-accent))] light:text-sky-600',
  },
  topic: {
    icon: <Folder className="w-3.5 h-3.5" />,
    color: 'text-purple-400 light:text-purple-600',
  },
  subTopic: {
    icon: <Folder className="w-3.5 h-3.5" />,
    color: 'text-indigo-400 light:text-indigo-600',
  },
  dotPoint: {
    icon: <Hash className="w-3.5 h-3.5" />,
    color: 'text-[rgb(var(--color-text-secondary))] light:text-slate-500',
  },
};

interface TreeItemComponentProps {
  item: TreeItem;
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  onToggleSelect: (id: string, isSelected: boolean) => void;
  onToggleExpand: (id: string) => void;
  level: number;
}

const TreeItemComponent: React.FC<TreeItemComponentProps> = ({
  item,
  selectedIds,
  expandedIds,
  onToggleSelect,
  onToggleExpand,
  level,
}) => {
  const isSelected = selectedIds.has(item.id);
  const isExpanded = expandedIds.has(item.id);
  const hasChildren = item.children && item.children.length > 0;
  const style = itemTypeStyles[item.type] || { icon: '▪️', color: 'text-gray-400' };

  const handleCheckboxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Space/Enter to toggle selection
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onToggleSelect(item.id, !isSelected);
    }
    // Right arrow to expand (if has children and not expanded)
    if (e.key === 'ArrowRight' && hasChildren && !isExpanded) {
      e.preventDefault();
      onToggleExpand(item.id);
    }
    // Left arrow to collapse (if expanded)
    if (e.key === 'ArrowLeft' && isExpanded) {
      e.preventDefault();
      onToggleExpand(item.id);
    }
  };

  return (
    <div className="relative">
      {level > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 w-px bg-[rgb(var(--color-border-secondary))]/30 light:bg-slate-300/50 ml-[11px]"
          style={{ left: `${(level - 1) * 20}px` }}
        ></div>
      )}

      <div
        className={`flex items-center py-1.5 px-2 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))]/50 light:hover:bg-slate-100 transition-colors group mb-0.5 ${isSelected ? 'bg-[rgb(var(--color-accent))]/5 light:bg-sky-50' : ''}`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
      >
        <button
          onClick={() => onToggleExpand(item.id)}
          className={`mr-1 p-0.5 rounded hover:bg-white/10 light:hover:bg-slate-200 text-[rgb(var(--color-text-muted))] light:text-slate-400 transition-colors ${hasChildren ? 'opacity-100' : 'opacity-0'}`}
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          />
        </button>

        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(item.id, e.target.checked)}
          onKeyDown={handleCheckboxKeyDown}
          className="h-3.5 w-3.5 rounded border-gray-600 light:border-slate-400 bg-[rgb(var(--color-bg-surface-inset))] light:bg-white text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))] mr-2.5 cursor-pointer"
          aria-label={`Select ${item.label}`}
        />

        <span
          className={`mr-2.5 ${style.color} opacity-80 group-hover:opacity-100 transition-opacity`}
        >
          {style.icon}
        </span>

        <span
          className={`flex-grow text-xs truncate select-none ${isSelected ? 'font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900' : 'text-[rgb(var(--color-text-secondary))] light:text-slate-700'}`}
        >
          {item.label}
        </span>
      </div>

      {hasChildren && isExpanded && (
        <div>
          <SelectionTree
            items={item.children!}
            selectedIds={selectedIds}
            expandedIds={expandedIds}
            onToggleSelect={onToggleSelect}
            onToggleExpand={onToggleExpand}
            level={level + 1}
          />
        </div>
      )}
    </div>
  );
};

const SelectionTree: React.FC<SelectionTreeProps> = ({
  items,
  selectedIds,
  expandedIds,
  onToggleSelect,
  onToggleExpand,
  level = 0,
}) => {
  return (
    <div>
      {items.map((item) => (
        <TreeItemComponent
          key={item.id}
          item={item}
          selectedIds={selectedIds}
          expandedIds={expandedIds}
          onToggleSelect={onToggleSelect}
          onToggleExpand={onToggleExpand}
          level={level}
        />
      ))}
    </div>
  );
};

export default SelectionTree;
