import React, { useRef, useEffect } from 'react';
import { ChevronRight, BookOpen, Layers, Folder, Hash, FileText } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  const scrollRef = useRef<HTMLOListElement>(null);

  // Auto-scroll to end on update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
    }
  }, [items]);

  const getLevelIcon = (index: number) => {
    switch (index) {
      case 0:
        return <BookOpen className="w-4 h-4" />; // Course
      case 1:
        return <Layers className="w-4 h-4" />; // Topic
      case 2:
        return <Folder className="w-4 h-4" />; // SubTopic
      case 3:
        return <Hash className="w-4 h-4" />; // Dot Point
      default:
        return <FileText className="w-4 h-4" />; // Question
    }
  };

  return (
    <nav
      className="w-full overflow-hidden rounded-xl border border-white/5 light:border-slate-200 bg-[rgb(var(--color-bg-surface-elevated))]/40 light:bg-white backdrop-blur-md shadow-sm hover:border-white/10 transition-colors"
      aria-label="Breadcrumb"
    >
      <ol ref={scrollRef} className="flex items-center overflow-x-auto scrollbar-hide py-3 px-4">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`breadcrumb-${index}`} className="flex items-center flex-shrink-0">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 mx-2 text-[rgb(var(--color-text-muted))]/50 flex-shrink-0" />
              )}
              <button
                onClick={item.onClick}
                disabled={isLast || !item.onClick}
                className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                    whitespace-nowrap border transition-all duration-200
                    ${
                      isLast
                        ? 'bg-[rgb(var(--color-bg-surface-inset))] text-[rgb(var(--color-text-primary))] border-white/10 light:border-slate-200 shadow-sm font-bold'
                        : 'bg-transparent text-[rgb(var(--color-text-secondary))] border-transparent hover:bg-[rgb(var(--color-bg-surface-light))]/50 hover:text-[rgb(var(--color-text-primary))]'
                    }
                    ${item.onClick && !isLast ? 'cursor-pointer' : 'cursor-default'}
                `}
              >
                <span
                  className={`opacity-70 ${isLast ? 'text-[rgb(var(--color-accent))] opacity-100' : ''}`}
                >
                  {getLevelIcon(index)}
                </span>
                <span className="truncate max-w-[150px] sm:max-w-[250px]">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
