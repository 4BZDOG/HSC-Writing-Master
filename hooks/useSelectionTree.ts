import { useState, useCallback, useMemo } from 'react';
import { TreeItem } from '../utils/dataManagerUtils';

const getAllIds = (items: TreeItem[]): string[] => {
  let ids: string[] = [];
  for (const item of items) {
    ids.push(item.id);
    if (item.children) {
      ids = ids.concat(getAllIds(item.children));
    }
  }
  return ids;
};

const getChildIds = (item: TreeItem): string[] => {
    if (!item.children) return [];
    return getAllIds(item.children);
}

export const useSelectionTree = (treeData: TreeItem[]) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    return new Set(treeData.map(item => item.id));
  });

  const itemMap = useMemo(() => {
    const map = new Map<string, TreeItem>();
    const traverse = (items: TreeItem[]) => {
      items.forEach(item => {
        map.set(item.id, item);
        if (item.children) traverse(item.children);
      });
    };
    traverse(treeData);
    return map;
  }, [treeData]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleToggleSelect = useCallback((id: string, isSelected: boolean) => {
    setSelectedIds(prev => {
        const newSet = new Set(prev);
        const item = itemMap.get(id);
        if (!item) return newSet;

        const descendantIds = getChildIds(item);

        if (isSelected) {
            newSet.add(id);
            descendantIds.forEach(childId => newSet.add(childId));

            // Cascade selection up: check if parent should now be selected
            let currentItem = item;
            while (currentItem && currentItem.parentId) {
                const parent = itemMap.get(currentItem.parentId);
                if (!parent || !parent.children) break;

                const allChildrenSelected = parent.children.every(child => newSet.has(child.id));
                if (allChildrenSelected) {
                    newSet.add(parent.id);
                } else {
                    break; // No need to check higher parents
                }
                currentItem = parent;
            }
        } else {
            // Cascade deselection down
            newSet.delete(id);
            descendantIds.forEach(childId => newSet.delete(childId));

            // Cascade deselection up
            let currentItem = item;
            while (currentItem && currentItem.parentId) {
                const parent = itemMap.get(currentItem.parentId);
                if (!parent) break;

                // If the parent was selected, deselect it because one of its children is now deselected
                if (newSet.has(parent.id)) {
                    newSet.delete(parent.id);
                }
                currentItem = parent;
            }
        }
        
        return newSet;
    });
  }, [itemMap]);

  const selectAll = useCallback(() => {
    const allIds = getAllIds(treeData);
    setSelectedIds(new Set(allIds));
  }, [treeData]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    expandedIds,
    handleToggleSelect,
    handleToggleExpand,
    selectAll,
    deselectAll,
  };
};