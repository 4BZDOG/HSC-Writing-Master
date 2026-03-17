import React from 'react';
import { TreeItem } from '../../utils/dataManagerUtils';
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
  course: { icon: <BookOpen className="w-3.5 h-3.5" />, color: 'text-[rgb(var(--color-accent))]' },
  topic: { icon: <Folder className="w-3.5 h-3.5" />, color: 'text-purple-400' },
  subTopic: { icon: <Folder className="w-3.5 h-3.5" />, color: 'text-indigo-400' },
  dotPoint: {
    icon: <Hash className="w-3.5 h-3.5" />,
    color: 'text-[rgb(var(--color-text-secondary))]',
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

  return (
    <div className="relative">
      {level > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 w-px bg-[rgb(var(--color-border-secondary))]/30 ml-[11px]"
          style={{ left: `${(level - 1) * 20}px` }}
        ></div>
      )}

      <div
        className={`flex items-center py-1.5 px-2 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))]/50 transition-colors group mb-0.5 ${isSelected ? 'bg-[rgb(var(--color-accent))]/5' : ''}`}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
      >
        <button
          onClick={() => onToggleExpand(item.id)}
          className={`mr-1 p-0.5 rounded hover:bg-white/10 text-[rgb(var(--color-text-muted))] transition-colors ${hasChildren ? 'opacity-100' : 'opacity-0'}`}
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          />
        </button>

        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(item.id, e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-600 bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))] mr-2.5 cursor-pointer"
        />

        <span
          className={`mr-2.5 ${style.color} opacity-80 group-hover:opacity-100 transition-opacity`}
        >
          {style.icon}
        </span>

        <span
          className={`flex-grow text-xs truncate select-none ${isSelected ? 'font-semibold text-[rgb(var(--color-text-primary))]' : 'text-[rgb(var(--color-text-secondary))]'}`}
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
